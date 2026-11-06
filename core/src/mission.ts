/**
 * Mission orchestration in the core:
 *   manifest -> 0G Storage -> robot prepares (genesis) -> registerMission on 0G Chain -> takeoff
 *   checkpoint -> 0G Compute (sealed) -> bundle back to the robot (the robot decides whether to act)
 *   entries -> writer queue -> 0G Storage, anchor every N decisions, close with trajectory hash
 * Plus the demo hooks a judge uses: kill switch, forged decision, tampered answer, tampered log.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AbiCoder, Wallet, hexlify, keccak256, randomBytes, toUtf8Bytes } from "ethers";
import type { Config } from "./config";
import { RegistryClient } from "./chain/registry";
import { cropMasterKey, encryptCrop, keyId, missionCropKey } from "./privacy";
import type { ArkivWriter } from "./arkiv/write";
import { mirroredBlob } from "./arkiv/read";
import { type Entry, canonicalJson, entryHash, goJson, sha256Hex } from "./lib/canonical";
import { type Bundle, type Policy, expectedEcho, extractContent, parseAnswer } from "./lib/interlock";
import { SerialQueue } from "./lib/queue";
import { RobotClient } from "./robotClient";
import type { Storage } from "./storage";
import { type AllowlistEntry, type CheckpointRequest, DEFAULT_TASK, type Task, ZgDecider } from "./zg/decide";
import { type Profile, loadProfile, registerOf, simSection, vocabulary } from "./profile";
import { ZgUnreachable } from "./zg/router";
import { type MissionIndex, type Report, type ServiceView, loadFromChain, loadServices, verifyMission } from "./verifier/core";

const MANIFEST_VERSION = 1;

export interface Attempt {
  at: number;
  kind: "0g" | "forged" | "tampered" | "error";
  endpoint?: string;
  request_id?: string | null;
  chat_id?: string | null;
  latency_ms?: number;
  answer?: unknown;
  precheck?: string;
  error?: string;
  robot_result?: string;
}

export interface MissionRecord {
  id: string;
  createdAt: string;
  status: "preparing" | "flying" | "ended" | "closed" | "error";
  /** What start() is doing right now, for the console while the 0G Storage and Chain writes finish. */
  stage?: string;
  robot: string;
  robotId: string;
  seed: number;
  manifest: any;
  manifestText: string;
  manifestRoot: string | null;
  manifestTx: string | null;
  allowlist: AllowlistEntry[];
  entries: Entry[];
  roots: Record<number, { root: string; tx: string | null }>;
  crops: Record<number, { root: string | null; tx: string | null }>;
  checkpoints: Record<number, { k: number; status: string; attempts: Attempt[] }>;
  chain: {
    registerTx: string | null;
    anchors: { count: number; head: string; indexRoot: string; tx: string | null }[];
    closeTx: string | null;
    indexRoot: string | null;
  };
  decisionsSinceAnchor: number;
  anchoredCount: number;
  replay: any | null;
  errors: string[];
}

export class Missions {
  current: MissionRecord | null = null;
  records = new Map<string, MissionRecord>();
  demo = { forgeArmed: false, tamperArmed: false };
  /** 0G Storage uploads. They drain in the background: chain writes use roots computed locally. */
  readonly queue = new SerialQueue();
  /** 0G Chain writes. Its own queue when Storage pays from another key, else the same one (one nonce). */
  readonly chainQueue: SerialQueue;
  private cropB64 = new Map<string, string>();
  private dir: string;
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private cropMaster: Buffer | null = null;

  constructor(
    private cfg: Config,
    public decider: ZgDecider,
    public storage: Storage,
    public registry: RegistryClient | null,
    public robot: RobotClient,
    public arkiv: ArkivWriter | null = null,
  ) {
    if (cfg.storage.storeCrops && cfg.storage.cropPrivacy === "encrypted") this.cropMaster = cropMasterKey(cfg.storage.cropKey, cfg.dataDir);
    const chainKey = registry?.wallet?.address ?? null;
    this.chainQueue = chainKey && storage.payer && chainKey.toLowerCase() !== storage.payer.toLowerCase() ? new SerialQueue() : this.queue;
    this.dir = join(cfg.dataDir, "missions");
    mkdirSync(this.dir, { recursive: true });
    for (const f of readdirSync(this.dir).filter((f) => f.endsWith(".json"))) {
      try {
        const r: MissionRecord = JSON.parse(readFileSync(join(this.dir, f), "utf8"));
        this.records.set(r.id, r);
      } catch {
        /* ignore corrupt record */
      }
    }
  }

  get link() {
    return this.decider.router.link;
  }

  private persist(rec: MissionRecord) {
    clearTimeout(this.saveTimers.get(rec.id));
    this.saveTimers.set(
      rec.id,
      setTimeout(() => writeFileSync(join(this.dir, `${rec.id}.json`), JSON.stringify(rec)), 250),
    );
  }

  private fail(rec: MissionRecord, msg: string) {
    rec.errors.push(`${new Date().toISOString()} ${msg}`);
    console.error(`[core] ${rec.id.slice(0, 10)}: ${msg}`);
    this.persist(rec);
  }

  policyOf(rec: MissionRecord): Policy {
    return rec.manifest.policy;
  }

  // ------------------------------------------------------------------ start
  async start(opts: { defects?: any[]; seed?: number; scenario?: string; background?: boolean; resume?: string }): Promise<MissionRecord> {
    const resume = opts.resume ? this.resumeFrom(opts.resume) : null;
    if (resume) opts = { ...opts, seed: resume.seed, scenario: resume.scenario, defects: resume.defects };
    if (this.current && (this.current.status === "preparing" || this.current.status === "flying"))
      throw new Error("a mission is already in progress");
    const health = await this.robot.health().catch(() => {
      throw new Error(`robot adapter not reachable at ${this.robot.base} (start it: npm run robot)`);
    });
    const robot: string = health.robot;
    const chain = this.cfg.chain;
    const robotId = chain.robotId || keccak256(toUtf8Bytes("blackbox-dev-robot"));
    if (this.registry) {
      if (!chain.robotId) throw new Error("ROBOT_ID is not set (run: npm run setup:robot)");
      if (!(await this.registry.isOperator(robotId, robot)))
        throw new Error(`robot ${robot} is not a zerobot operator of ${robotId.slice(0, 10)} (run: npm run setup:robot)`);
    }
    const allow = await this.decider.allowlist();
    const unsealed = this.cfg.zg.attestation === "none";
    if (!unsealed && !allow.signers.length)
      throw new Error(`no TEE signers found for ${this.cfg.zg.visionModel}: refusing to fly without an allowlist`);

    const profile = loadProfile(opts.scenario ?? this.cfg.sim.scenario);
    const backends: string[] = health.backends ?? [];
    const backend = this.cfg.sim.backend === "auto" ? (backends[0] ?? "native") : this.cfg.sim.backend;
    if (!backends.includes(backend)) throw new Error(`robot adapter has no ${backend} physics (has: ${backends.join(", ")})`);
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    const missionId = keccak256(
      AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "uint256", "bytes32"], [robot, robotId, Date.now(), hexlify(randomBytes(32))]),
    );
    const p = this.cfg.policy;
    const manifest = {
      v: MANIFEST_VERSION,
      kind: "blackbox.mission-manifest",
      mission_id: missionId,
      robot_id: robotId,
      robot,
      chain_id: chain.enabled ? chain.network.chainId : 0,
      registry: chain.enabled ? chain.registry : "0x0000000000000000000000000000000000000000",
      robot_registry: chain.enabled ? chain.robotRegistry : null,
      seed,
      profile,
      sim: resume ? { ...simSection(profile, backend), resume: resume.point } : simSection(profile, backend),
      resume: resume?.link ?? null,
      policy: {
        ...vocabulary(profile),
        vision_model: this.cfg.zg.visionModel,
        trust_mode: this.cfg.zg.trustMode,
        attestation: this.cfg.zg.attestation,
        tee_signers: allow.signers,
        tee_binding: p.teeBinding,
        nonce_hex_len: p.nonceHexLen,
        lease_ms: p.leaseMs,
        max_asks: p.maxAsks,
        anchor_every: p.anchorEvery,
        decision_model: this.cfg.zg.decisionModel || null,
        hold_below_permille: this.cfg.zg.decisionModel ? this.cfg.zg.holdBelowPermille : null,
        human_timeout_ms: p.humanTimeoutMs,
      },
      compute: {
        mode: this.cfg.zg.mode,
        endpoints: this.cfg.zg.endpoints,
        providers: allow.providers.map((a) => ({ provider: a.provider, signer: a.signer, url: a.url, endpoint: a.endpoint, verifiability: a.verifiability })),
        service_registry: this.cfg.zg.mode === "mock" ? "mock" : unsealed ? "none (unsealed: not TEE-attested)" : `${this.cfg.zg.servingContract}@16661`,
      },
      storage: { kind: this.storage.kind, network: this.cfg.storage.network.name },
      // what is public and what is not (docs/privacy.md). Fixed in the manifest, so it is anchored with the mission.
      privacy: {
        crops: !this.cfg.storage.storeCrops ? "not stored" : this.cropMaster ? "aes-256-gcm" : "public",
        crop_key_id: this.cropMaster ? keyId(missionCropKey(this.cropMaster, missionId)) : null,
        inference: this.cfg.zg.attestation === "tee" ? `sealed (${this.cfg.zg.trustMode} trust, TEE)` : "unsealed",
        log: "public (hashes, answers, positions, TEE signatures)",
      },
      created_at: new Date().toISOString(),
    };
    const manifestText = canonicalJson(manifest);
    const rec: MissionRecord = {
      id: missionId,
      createdAt: manifest.created_at,
      status: "preparing",
      robot,
      robotId,
      seed,
      manifest,
      manifestText,
      manifestRoot: null,
      manifestTx: null,
      allowlist: allow.providers,
      entries: [],
      roots: {},
      crops: {},
      checkpoints: {},
      chain: { registerTx: null, anchors: [], closeTx: null, indexRoot: null },
      decisionsSinceAnchor: 0,
      anchoredCount: 1,
      replay: null,
      errors: [],
    };
    this.records.set(missionId, rec);
    this.current = rec;
    const launch = async () => {
    try {
      // The manifest's 0G Storage root is computed locally, so the robot and the registry get it at once
      // and the upload drains behind them. Takeoff still waits for registerMission on 0G Chain.
      const bytes = toUtf8Bytes(manifestText);
      const root = await this.storage.rootOf(bytes);
      rec.manifestRoot = root;
      this.upload(rec, bytes, root, (s) => (rec.manifestTx = s.txHash), "manifest", { kind: "manifest", seq: -1 });
      rec.stage = "Robot is loading the manifest";
      const prep = await this.robot.prepare({ manifest_text: manifestText, manifest_root: root, defects: opts.defects ?? [] });
      await this.onEntry(prep.genesis);
      if (this.registry) {
        rec.stage = "Registering the mission on 0G Chain (BlackboxRegistry)";
        const seedHash = keccak256(AbiCoder.defaultAbiCoder().encode(["uint256"], [seed]));
        rec.chain.registerTx = await this.chainQueue.run(() =>
          this.registry!.registerMission(missionId, robotId, robot, seedHash, root, prep.genesis.hash),
        );
        this.persist(rec);
      }
      rec.stage = "Taking off";
      await this.robot.go();
      rec.status = "flying";
      this.arkivMission(rec);
      rec.stage = undefined;
      this.persist(rec);
      console.log(`[core] mission ${missionId.slice(0, 10)} flying (seed ${seed}, ${allow.signers.length} TEE signer(s)) register tx ${rec.chain.registerTx ?? "(no chain)"}`);
    } catch (e) {
      rec.status = "error";
      rec.stage = undefined;
      this.fail(rec, `start failed: ${(e as Error).message}`);
      throw e;
    }
    };
    // The 0G Storage and Chain writes take over a minute. A background start returns the record at once and the console follows rec.stage.
    if (opts.background) {
      launch().catch(() => {});
      return rec;
    }
    await launch();
    return rec;
  }

  // ------------------------------------------------------------- checkpoint
  async onCheckpoint(req: CheckpointRequest): Promise<{ ok: boolean; bundle?: Bundle; error?: string }> {
    const rec = this.records.get(req.mission_id);
    if (!rec) return { ok: false, error: "unknown mission" };
    const k = req.checkpoint;
    const cpv = (rec.checkpoints[k] ??= { k, status: "asking", attempts: [] });
    const cropKey = `${rec.id}:${k}`;
    if (!this.cropB64.has(cropKey)) {
      this.cropB64.set(cropKey, req.crop_png_b64);
      if (this.cfg.storage.storeCrops) {
        const png = Buffer.from(req.crop_png_b64, "base64");
        const bytes = this.cropMaster ? encryptCrop(missionCropKey(this.cropMaster, rec.id), png) : png;
        rec.crops[k] = { root: null, tx: null };
        this.storage.rootOf(bytes).then((root) => {
          rec.crops[k] = { root, tx: null };
          this.upload(rec, bytes, root, (s) => (rec.crops[k].tx = s.txHash), `crop ${k}`);
        });
      }
    }
    if (this.demo.forgeArmed) {
      this.demo.forgeArmed = false;
      const forged = forgeBundle(req, this.policyOf(rec), rec.manifest.profile);
      const fa = JSON.parse(JSON.parse(forged.raw_response).choices[0].message.content);
      const at: Attempt = { at: Date.now(), kind: "forged", answer: { label: fa.label, action: fa.action } };
      cpv.attempts.push(at);
      this.robot
        .decision(forged, "operator console")
        .then((r) => (at.robot_result = r.accepted ? "ACCEPTED (!)" : `refused: ${r.reason}`))
        .catch((e) => (at.robot_result = `error: ${e.message}`));
    }
    try {
      const { bundle, precheck } = await this.decider.decide(req, this.policyOf(rec), taskOf(rec.manifest.profile));
      let out = bundle;
      const at: Attempt = {
        at: Date.now(),
        kind: "0g",
        endpoint: bundle.endpoint,
        request_id: bundle.request_id,
        chat_id: bundle.chat_id,
        latency_ms: bundle.latency_ms,
        answer: precheck.answer,
        precheck: precheck.reason,
      };
      cpv.attempts.push(at);
      if (this.demo.tamperArmed && precheck.accepted) {
        this.demo.tamperArmed = false;
        const t = tamperBundle(bundle, rec.manifest.profile);
        out = t.bundle;
        cpv.attempts.push({ at: Date.now(), kind: "tampered", answer: t.answer, request_id: bundle.request_id });
      }
      cpv.status = "answered";
      this.persist(rec);
      return { ok: true, bundle: out };
    } catch (e) {
      const msg = (e as Error).message;
      cpv.attempts.push({ at: Date.now(), kind: "error", error: msg });
      cpv.status = e instanceof ZgUnreachable ? "unreachable" : "error";
      this.persist(rec);
      return { ok: false, error: msg };
    }
  }

  // ---------------------------------------------------------------- entries
  async onEntry(entry: Entry): Promise<{ ok: boolean; error?: string }> {
    const rec = this.records.get(entry.mission_id);
    if (!rec) return { ok: false, error: "unknown mission" };
    const have = rec.entries[entry.seq];
    if (have) return have.hash === entry.hash ? { ok: true } : { ok: false, error: `conflicting entry #${entry.seq}` };
    if (entryHash(entry) !== entry.hash) return { ok: false, error: `entry #${entry.seq} hash does not recompute` };
    rec.entries[entry.seq] = entry;
    const seq = entry.seq;
    const bytes = toUtf8Bytes(canonicalJson(entry));
    rec.roots[seq] = { root: await this.storage.rootOf(bytes), tx: null };
    this.upload(rec, bytes, rec.roots[seq].root, (s) => (rec.roots[seq].tx = s.txHash), `entry #${seq}`, { kind: "entry", seq });
    if (this.arkiv && ["decision", "human", "safe_stop"].includes(entry.kind) && entry.body?.asset) this.arkivFinding(rec, entry);
    if (["decision", "human", "safe_stop"].includes(entry.kind)) {
      rec.decisionsSinceAnchor++;
      if (rec.decisionsSinceAnchor >= this.cfg.policy.anchorEvery) {
        rec.decisionsSinceAnchor = 0;
        this.queueAnchor(rec, false);
      }
    }
    if (entry.kind === "mission_end") {
      rec.status = "ended";
      this.queueAnchor(rec, true);
    }
    this.persist(rec);
    return { ok: true };
  }

  /** Queue an upload whose root is already known; check 0G Storage agrees on it. */
  private upload(rec: MissionRecord, bytes: Uint8Array, root: string, done: (s: { txHash: string | null }) => void, what: string, mirror?: { kind: "manifest" | "entry" | "index"; seq: number }) {
    // the Arkiv copy, keyed by the same 0G root: a backup the verifier re-checks against 0G Chain
    if (this.arkiv && mirror) this.arkiv.mirror(root, mirror.kind, rec.id, mirror.seq, bytes);
    this.queue
      .run(() => this.storage.upload(bytes))
      .then((s) => {
        if (s.root.toLowerCase() !== root.toLowerCase()) throw new Error(`0G Storage returned root ${s.root}, computed ${root}`);
        done(s);
        this.persist(rec);
      })
      .catch((e) => this.fail(rec, `${what} upload: ${e.message}`));
  }

  private contiguous(rec: MissionRecord) {
    let n = 0;
    while (rec.entries[n]) n++;
    return n;
  }

  private index(rec: MissionRecord, count: number): MissionIndex {
    return {
      v: 1,
      mission_id: rec.id,
      manifest_root: rec.manifestRoot!,
      count,
      entries: rec.entries.slice(0, count).map((e) => ({ seq: e.seq, kind: e.kind, hash: e.hash, root: rec.roots[e.seq]?.root ?? null })),
      crops: Object.fromEntries(Object.entries(rec.crops).map(([k, v]) => [k, v.root ?? ""])),
    };
  }

  private queueAnchor(rec: MissionRecord, close: boolean) {
    this.chainQueue
      .run(async () => {
        const count = this.contiguous(rec);
        if (!close && count <= rec.anchoredCount) return;
        const head = rec.entries[count - 1].hash;
        for (const e of rec.entries.slice(0, count)) // an entry still computing its root in a parallel request
          if (!rec.roots[e.seq]) rec.roots[e.seq] = { root: await this.storage.rootOf(toUtf8Bytes(canonicalJson(e))), tx: null };
        const ib = toUtf8Bytes(canonicalJson(this.index(rec, count)));
        const idx = { root: await this.storage.rootOf(ib) };
        this.upload(rec, ib, idx.root, () => {}, `index at ${count}`, { kind: "index", seq: -1 });
        rec.chain.indexRoot = idx.root;
        let tx: string | null = null;
        if (close) {
          const end = rec.entries[count - 1];
          if (end.kind !== "mission_end") throw new Error("close requested before mission_end arrived");
          const traj = end.body.trajectory_hash;
          const { signature } = await this.robot.sign({ type: "close", mission_id: rec.id, count, head, index_root: idx.root, trajectory_hash: traj });
          if (this.registry) tx = await this.registry.close(rec.id, count, head, idx.root, traj, signature);
          rec.chain.closeTx = tx;
          rec.status = "closed";
          this.arkivMission(rec);
        } else {
          const { signature } = await this.robot.sign({ type: "anchor", mission_id: rec.id, count, head, index_root: idx.root });
          if (this.registry) tx = await this.registry.anchor(rec.id, count, head, idx.root, signature);
        }
        rec.chain.anchors.push({ count, head, indexRoot: idx.root, tx });
        rec.anchoredCount = count;
        this.persist(rec);
        console.log(`[core] ${close ? "closed" : "anchored"} ${rec.id.slice(0, 10)} at ${count} entries ${tx ?? "(no chain)"}`);
        if (close) {
          rec.replay = await this.robot.replay(rec.entries).catch((e) => ({ match: null, error: e.message }));
          this.persist(rec);
        }
      })
      .catch((e) => this.fail(rec, `${close ? "close" : "anchor"}: ${e.message}`));
  }

  /**
   * Resume a survey a safe stop interrupted. The parent must be closed on chain, and its last entry, the
   * robot-signed mission_end, must carry the stop point. The new mission keeps the seed, profile and marks,
   * takes off, flies back to that point and asks 0G again about the mark that was never decided.
   */
  private resumeFrom(parentId: string) {
    const p = this.records.get(parentId);
    if (!p) throw new Error("unknown mission to resume");
    const end = p.entries.filter(Boolean).at(-1);
    if (end?.kind !== "mission_end") throw new Error("that mission has not ended yet");
    if (!end.body.resume) throw new Error(end.body.final === "landed" ? "that mission finished its survey: nothing to resume" : "that mission stopped with no resume point");
    if (p.status !== "closed") throw new Error("wait until the mission is closed on 0G Chain, then resume");
    const start = p.entries[0].body;
    const placed = [...(start.defects ?? []), ...p.entries.filter((e) => e?.kind === "world").map((e) => e.body.defect)];
    return {
      seed: p.seed,
      scenario: p.manifest.profile?.id,
      defects: placed.map((d: any) => ({ kind: d.kind, x_mm: d.x_mm, y_mm: d.y_mm, variant: d.variant })),
      point: end.body.resume,
      link: { parent: p.id, parent_head: end.hash, parent_count: p.entries.length, wp_idx: end.body.resume.wp_idx, pose_mm: end.body.resume.pose_mm },
    };
  }

  /** For an auditor: the mission's crop key. Released by the operator, never uploaded. */
  cropKey(missionId: string) {
    if (!this.cropMaster) throw new Error("crops are not encrypted (CROP_PRIVACY=public or STORE_CROPS=false)");
    const key = missionCropKey(this.cropMaster, missionId);
    return { mission: missionId, cipher: "aes-256-gcm", key: "0x" + key.toString("hex"), key_id: keyId(key) };
  }

  // ------------------------------------------------------------------ Arkiv
  /** A decision, human decision or safe stop on an asset becomes a queryable Arkiv row, joined with the asset register. */
  private arkivFinding(rec: MissionRecord, entry: Entry) {
    const profile: Profile = rec.manifest.profile;
    const b = entry.body;
    const reg = registerOf(profile, b.asset);
    const hold = entry.kind === "human" ? rec.entries.filter((e) => e?.kind === "hold" && e.body.checkpoint === b.checkpoint).at(-1)?.body : null;
    const ans = entry.kind === "decision" ? b.answer : hold?.answer;
    this.arkiv!.finding({
      site: profile.id,
      asset: b.asset,
      label: entry.kind === "safe_stop" ? "safe_stop" : ans?.label ?? "unsure",
      severity: entry.kind === "safe_stop" ? -1 : ans?.severity ?? -1,
      action: entry.kind === "decision" ? b.action_applied : entry.kind === "human" ? b.action : "safe_stop",
      source: entry.kind === "decision" ? "0g" : entry.kind === "human" ? "human" : "safe_stop",
      mission: rec.id,
      seq: entry.seq,
      at: Math.floor(Date.now() / 1000),
      maker: reg?.maker,
      model: reg?.model,
      batch: reg?.batch,
      detail: {
        entry_hash: entry.hash,
        storage_root: rec.roots[entry.seq]?.root ?? null,
        request_id: b.zg?.request_id ?? null,
        tee_signer: b.interlock?.signer ?? null,
        reason: b.reason ?? null,
        outcome: ans ? profile.ui.outcomes?.[ans.label] ?? null : "Safe stop, inspect again",
        checkpoint: b.checkpoint,
      },
    });
  }

  private arkivMission(rec: MissionRecord) {
    if (!this.arkiv) return;
    const n = (k: string) => rec.entries.filter((e) => e?.kind === k).length;
    this.arkiv
      .mission({
        mission: rec.id,
        site: rec.manifest.profile?.id ?? "",
        status: rec.status,
        robot: rec.robot,
        decisions: n("decision") + n("human"),
        safe_stops: n("safe_stop"),
        started: Math.floor(Date.parse(rec.createdAt) / 1000),
        parent: rec.manifest.resume?.parent ?? "",
        detail: { register_tx: rec.chain.registerTx, close_tx: rec.chain.closeTx, anchors: rec.chain.anchors.length, manifest_root: rec.manifestRoot, chain_id: rec.manifest.chain_id },
      })
      .catch(() => {});
  }

  // ----------------------------------------------------------------- verify
  async chainView(missionId: string) {
    if (!this.registry) return null;
    const [mission, anchors] = await Promise.all([this.registry.getMission(missionId), this.registry.getAnchors(missionId)]);
    const robotIsOperator = mission ? await this.registry.isOperator(mission.robotId, mission.robot) : null;
    const net = this.cfg.chain.network;
    const parentId = this.records.get(missionId)?.manifest?.resume?.parent;
    const parent = parentId ? await this.registry.getMission(parentId) : undefined;
    return { network: net.name, chainId: net.chainId, registry: this.cfg.chain.registry, robotRegistry: this.cfg.chain.robotRegistry, mission, anchors, robotIsOperator, parent };
  }

  /** source=storage re-reads everything from 0G Chain + 0G Storage; source=local uses the core's copy. */
  async verify(missionId: string, source: "storage" | "local" = "storage", entriesOverride?: Entry[]): Promise<Report> {
    const rec = this.records.get(missionId);
    if (source === "storage") await Promise.all([this.queue.idle(), this.chainQueue.idle()]); // read back what was written
    if (source === "storage" && this.registry && !entriesOverride) {
      const n = this.cfg.chain.network;
      const inp = await loadFromChain({
        rpc: n.rpc,
        chainId: n.chainId,
        network: n.name,
        registry: this.cfg.chain.registry,
        missionId,
        fetchRoot: (r) => this.storage.download(r),
        fallback: this.arkiv ? (r) => mirroredBlob(this.arkiv!.reader, r) : null,
        servingRpc: this.cfg.zg.servingRpc,
      });
      return verifyMission({ ...inp, replay: rec?.replay ?? null });
    }
    if (!rec) throw new Error("unknown mission");
    let services: ServiceView[] | null = null;
    let servicesError: string | null = null;
    try {
      services = await loadServices(rec.manifest, this.cfg.zg.servingRpc);
    } catch (e) {
      servicesError = (e as Error).message.slice(0, 160);
    }
    return verifyMission({
      missionId,
      services,
      servicesError,
      entries: entriesOverride ?? rec.entries,
      manifestText: rec.manifestText,
      chain: await this.chainView(missionId),
      roots: Object.fromEntries(Object.entries(rec.roots).map(([k, v]) => [k, v.root])),
      replay: entriesOverride ? null : rec.replay,
    });
  }

  /** Beat 3b: lower one severity in a local copy of the log and verify that copy. */
  async tamperedReport(missionId: string, seq?: number) {
    const rec = this.records.get(missionId);
    if (!rec) throw new Error("unknown mission");
    const copy: Entry[] = JSON.parse(JSON.stringify(rec.entries));
    const target = seq ?? copy.findIndex((e) => e.kind === "decision" && e.body.answer?.severity > 0);
    const i = target >= 0 ? target : copy.findIndex((e) => e.kind === "decision");
    if (i < 0) throw new Error("no decision entry to tamper with yet");
    const e = copy[i];
    let change: string;
    if (e.kind === "decision") {
      const before = e.body.answer.severity;
      e.body.answer.severity = Math.max(0, before - 2);
      change = `entry #${i}: severity ${before} -> ${e.body.answer.severity}`;
    } else {
      e.t_ms += 1;
      change = `entry #${i}: t_ms +1`;
    }
    const report = await this.verify(missionId, "local", copy);
    return { change, seq: i, report };
  }

  // ------------------------------------------------------------------- view
  summary(rec: MissionRecord | null) {
    if (!rec) return null;
    const ex = this.cfg.chain.network.explorer;
    const txUrl = (t: string | null) => (t && ex ? `${ex}/tx/${t}` : null);
    return {
      id: rec.id,
      status: rec.status,
      stage: rec.stage ?? null,
      createdAt: rec.createdAt,
      robot: rec.robot,
      robotId: rec.robotId,
      seed: rec.seed,
      manifestRoot: rec.manifestRoot,
      manifestUrl: rec.manifestRoot ? this.storage.fileUrl(rec.manifestRoot) : null,
      manifestTxUrl: this.storage.txUrl(rec.manifestTx),
      policy: rec.manifest.policy,
      profile: rec.manifest.profile ?? null,
      allowlist: rec.allowlist,
      registerTx: rec.chain.registerTx,
      registerTxUrl: txUrl(rec.chain.registerTx),
      anchors: rec.chain.anchors.map((a) => ({ ...a, txUrl: txUrl(a.tx), indexUrl: this.storage.fileUrl(a.indexRoot) })),
      closeTx: rec.chain.closeTx,
      closeTxUrl: txUrl(rec.chain.closeTx),
      checkpoints: rec.checkpoints,
      crops: rec.crops,
      replay: rec.replay,
      resumeOf: rec.manifest.resume ?? null,
      privacy: rec.manifest.privacy ?? null,
      resumable: (() => {
        const end = rec.entries.filter(Boolean).at(-1);
        return end?.kind === "mission_end" && end.body.resume ? { ...end.body.resume, stoppedAt: rec.entries.filter((e) => e?.kind === "safe_stop").at(-1)?.body ?? null } : null;
      })(),
      errors: rec.errors.slice(-8),
      entries: rec.entries.filter(Boolean).map((e) => ({
        seq: e.seq,
        kind: e.kind,
        hash: e.hash,
        t_ms: e.t_ms,
        root: rec.roots[e.seq]?.root ?? null,
        rootUrl: rec.roots[e.seq] ? this.storage.fileUrl(rec.roots[e.seq].root) : null,
        txUrl: this.storage.txUrl(rec.roots[e.seq]?.tx ?? null),
        body: summarizeBody(e),
      })),
    };
  }

  crop(missionId: string, k: number): Buffer | null {
    const b = this.cropB64.get(`${missionId}:${k}`);
    return b ? Buffer.from(b, "base64") : null;
  }
}

function summarizeBody(e: Entry) {
  const b = e.body ?? {};
  switch (e.kind) {
    case "decision":
    case "hold":
      return {
        checkpoint: b.checkpoint,
        asset: b.asset ?? null,
        answer: b.answer,
        action_applied: b.action_applied ?? null,
        target_mm: b.target_mm,
        request_id: b.zg?.request_id,
        chat_id: b.zg?.chat_id,
        provider: b.zg?.provider,
        endpoint: b.zg?.endpoint,
        latency_ms: b.zg?.latency_ms,
        router_tee_verified: b.zg?.router_tee_verified,
        signer: b.interlock?.signer,
        binding: b.interlock?.binding,
        tee_text: b.zg?.tee?.text,
        decision_model: b.decision_model ? { ...b.decision_model, raw_response: undefined } : null,
      };
    case "rejected":
      return { checkpoint: b.checkpoint, asset: b.asset ?? null, reason: b.reason, source: b.source, attempted_answer: b.attempted_answer, signer: b.signer, request_id: b.zg?.request_id };
    case "safe_stop":
      return { checkpoint: b.checkpoint, asset: b.asset ?? null, reason: b.reason, asks: b.asks, refused: b.refused, last_error: b.last_error };
    case "mission_start":
      return { manifest_root: b.manifest_root, manifest_hash: b.manifest_hash, defects: b.defects, backend: b.backend };
    default:
      return b;
  }
}

/** A perfectly formed answer for this checkpoint, signed by the operator's own key instead of 0G's TEE. */
function forgeBundle(req: CheckpointRequest, policy: Policy, profile?: Profile): Bundle {
  const operator = Wallet.createRandom();
  const skip = otherAction(profile, defectAction(profile));
  const answer = { nonce: expectedEcho(req.nonce, policy.nonce_hex_len ?? 64), label: labelFor(profile, skip), severity: 0, action: skip };
  const chat = crypto.randomUUID();
  const broker = {
    id: `chatcmpl-${chat}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "0GM-1.0-35B-A3B",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(answer) } }],
  };
  const fakeReq = JSON.stringify({ forged: true });
  const text = `${sha256Hex(fakeReq)}:${sha256Hex(goJson(broker))}`;
  return {
    mission_id: req.mission_id,
    checkpoint: req.checkpoint,
    endpoint: "operator-console",
    request_id: crypto.randomUUID(),
    chat_id: chat,
    chat_id_source: "header",
    provider: null,
    model: "0gm-1.0-35b-a3b",
    router_tee_verified: true,
    latency_ms: 0,
    request_sha256: sha256Hex(fakeReq),
    raw_response: goJson({ ...broker, x_0g_trace: { request_id: crypto.randomUUID(), tee_verified: true } }),
    tee: { text, signature: operator.signMessageSync(text), signing_address: operator.address, service_url: "operator-console" },
  };
}

/** The real 0G answer with its real TEE signature, but the action flipped (skip a crack / dive on a decoy). */
function tamperBundle(b: Bundle, profile?: Profile): { bundle: Bundle; answer: Record<string, unknown> } {
  const body = JSON.parse(b.raw_response);
  const a = parseAnswer(extractContent(b.raw_response), vocabulary(profile ?? LEGACY));
  const to = otherAction(profile, a.action);
  const flipped = { ...a, label: labelFor(profile, to), severity: to === defectAction(profile) ? (profile?.decision.severity_max ?? 3) : 0, action: to };
  body.choices[0].message.content = JSON.stringify(flipped);
  return { bundle: { ...b, raw_response: goJson(body) }, answer: { label: flipped.label, action: flipped.action } };
}

const LEGACY = {
  decision: { labels: ["crack", "decoy", "unsure"], actions: ["descend", "continue"], severity_max: 3, label_actions: { crack: "descend", decoy: "continue", unsure: "descend" }, prompt: "" },
} as unknown as Profile;

function taskOf(profile?: Profile): Task {
  return profile ? { prompt: profile.decision.prompt, title: profile.title } : DEFAULT_TASK;
}
/** The action the profile's first (defect) label calls for, e.g. descend. */
function defectAction(profile?: Profile): string {
  const d = (profile ?? LEGACY).decision;
  return d.label_actions[d.labels[0]] ?? d.actions[0];
}
function otherAction(profile: Profile | undefined, action: string): string {
  const d = (profile ?? LEGACY).decision;
  return d.actions.find((x) => x !== action) ?? action;
}
/** A label that the profile maps to this action (never "unsure"). */
function labelFor(profile: Profile | undefined, action: string): string {
  const d = (profile ?? LEGACY).decision;
  return d.labels.find((l) => l !== "unsure" && d.label_actions[l] === action) ?? d.labels[0];
}
