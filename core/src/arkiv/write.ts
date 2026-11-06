/**
 * Writes Blackbox data to Arkiv: a finding per decision, the mission row, and a mirror of every blob
 * uploaded to 0G Storage. Writes are batched (one Arkiv transaction carries several entities) and never
 * block the mission: Arkiv is the working database, 0G holds the proof.
 */
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { i32, u64 } from "@arkiv-network/sdk/schema";
import { http, stringToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "../config";
import { SerialQueue } from "../lib/queue";
import { Blob, Finding, Mission } from "./schema";
import { arkivPublic } from "./read";

export type ArkivConfig = NonNullable<Config["arkiv"]>;

export interface FindingInput {
  site: string;
  asset: string;
  label: string;
  severity: number;
  action: string;
  source: "0g" | "human" | "safe_stop";
  mission: string;
  seq: number;
  at: number;
  maker?: string;
  model?: string;
  batch?: string;
  detail: Record<string, unknown>;
}

export interface MissionInput {
  mission: string;
  site: string;
  status: string;
  robot: string;
  decisions: number;
  safe_stops: number;
  started: number;
  parent: string;
  detail: Record<string, unknown>;
}

const MAX_DAYS = 91; // Rabdi's MAX_LIFETIME is 7,884,000 s; Arkiv entities are extended, never permanent

export class ArkivWriter {
  readonly wallet;
  readonly reader;
  private queue = new SerialQueue();
  private pending: { creates: any[]; patches: any[]; done: ((keys: Hex[]) => void)[] } = { creates: [], patches: [], done: [] };
  private timer: NodeJS.Timeout | null = null;
  /** Arkiv entity key of each mission row, so the row is patched rather than duplicated. */
  private missionKeys = new Map<string, Hex>();
  readonly stats = { txs: 0, entities: 0, bytes: 0, gas: 0n, fee: 0n, errors: 0, last: null as string | null };

  constructor(readonly cfg: ArkivConfig) {
    const chain = rabdi({ accessKey: cfg.accessKey });
    this.wallet = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(cfg.key as Hex) });
    this.reader = arkivPublic(cfg.accessKey);
  }

  get address() {
    return this.wallet.account.address;
  }

  private exp(days = this.cfg.retentionDays) {
    return { expiration: ExpirationTime.fromDays(Math.min(MAX_DAYS, days)) };
  }

  /** Collect writes for a moment and send them as one batch transaction. */
  private add(kind: "creates" | "patches", op: any): Promise<Hex[]> {
    return new Promise((resolve) => {
      this.pending[kind].push(op);
      this.pending.done.push(resolve);
      if (!this.timer) this.timer = setTimeout(() => this.flush(), this.cfg.batchMs);
    });
  }

  private flush() {
    this.timer = null;
    const batch = this.pending;
    this.pending = { creates: [], patches: [], done: [] };
    if (!batch.creates.length && !batch.patches.length) return;
    this.queue
      .run(async () => {
        const r = await this.wallet.executeBatch({ creates: batch.creates, patches: batch.patches } as any);
        const rc = await this.reader.waitForTransactionReceipt({ hash: r.txHash });
        this.stats.txs++;
        this.stats.entities += batch.creates.length + batch.patches.length;
        this.stats.gas += rc.gasUsed;
        this.stats.fee += rc.gasUsed * (rc.effectiveGasPrice ?? 0n);
        this.stats.last = r.txHash;
        batch.done.forEach((d) => d(r.createdEntities));
        return r;
      })
      .catch((e) => {
        this.stats.errors++;
        console.warn(`[arkiv] batch of ${batch.creates.length + batch.patches.length} failed: ${String(e.shortMessage ?? e.message).slice(0, 160)}`);
        batch.done.forEach((d) => d([]));
      });
  }

  /** Mirror a blob uploaded to 0G Storage, keyed by its root: the verifier's fallback when 0G Storage is unreachable. */
  mirror(root: string, kind: "manifest" | "entry" | "index", mission: string, seq: number, content: Uint8Array) {
    if (!this.cfg.mirror || content.length > 120_000) return Promise.resolve([]);
    this.stats.bytes += content.length;
    return this.add("creates", { schema: Blob, values: { root: root.toLowerCase(), kind, mission, seq: i32(seq), content }, ...this.exp() });
  }

  finding(f: FindingInput) {
    const detail = stringToBytes(JSON.stringify(f.detail));
    this.stats.bytes += detail.length;
    return this.add("creates", {
      schema: Finding,
      values: {
        site: f.site, asset: f.asset, label: f.label, severity: i32(f.severity), action: f.action, source: f.source,
        mission: f.mission, seq: u64(BigInt(f.seq)), at: u64(BigInt(f.at)), maker: f.maker ?? "", model: f.model ?? "", batch: f.batch ?? "", detail,
      },
      ...this.exp(),
    });
  }

  /** Create the mission row at takeoff, patch it as the mission moves. */
  async mission(m: MissionInput) {
    const values = {
      mission: m.mission, site: m.site, status: m.status, robot: m.robot, decisions: i32(m.decisions), safe_stops: i32(m.safe_stops),
      started: u64(BigInt(m.started)), parent: m.parent, detail: stringToBytes(JSON.stringify(m.detail)),
    };
    const key = this.missionKeys.get(m.mission);
    if (key) return this.add("patches", { schema: Mission, entityKey: key, values });
    const [k] = await this.add("creates", { schema: Mission, values, ...this.exp() });
    if (k) this.missionKeys.set(m.mission, k);
    return [k];
  }

  idle() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.flush();
    }
    return this.queue.idle();
  }
}
