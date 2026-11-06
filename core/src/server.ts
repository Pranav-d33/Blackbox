/**
 * Blackbox core: http://127.0.0.1:8787
 *   /            operator console (3D mission view, decision feed, demo beats, SDK)
 *   /verify.html public verifier (reads 0G Chain + 0G Storage in the browser)
 *   /api/...     robot-facing API (checkpoint, entries) + dashboard API
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { CORE_ROOT, loadConfig } from "./config";
import { RegistryClient } from "./chain/registry";
import { Missions } from "./mission";
import { ArkivWriter } from "./arkiv/write";
import { RobotClient } from "./robotClient";
import { listProfiles, loadProfile, simSection } from "./profile";
import { makeStorage } from "./storage";
import { ZgDecider } from "./zg/decide";
import { RouterClient } from "./zg/router";
import { ServiceDirectory } from "./zg/services";

// The 0G Storage SDK can emit a late socket reset on a connection after its upload already finished.
// Node would kill the whole core for it, so transient network errors are logged and survived; real bugs still exit.
const TRANSIENT = /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|other side closed/i;
for (const evt of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(evt, (e: any) => {
    const msg = `${e?.code ?? ""} ${e?.message ?? e}`;
    if (TRANSIENT.test(msg)) return void console.warn(`[core] survived ${evt}: ${msg.trim().slice(0, 160)}`);
    console.error(`[core] fatal ${evt}:`, e);
    process.exit(1);
  });
}

const cfg = loadConfig();
const publicBase = `http://${cfg.host}:${cfg.port}`;
const storage = makeStorage(cfg, publicBase);
const registry = cfg.chain.enabled ? new RegistryClient(cfg.chain) : null;
const robot = new RobotClient(cfg.robotUrl);
const router = new RouterClient(cfg.zg, { down: false });
const decider = new ZgDecider(cfg, router, new ServiceDirectory(cfg.zg));
const arkiv = cfg.arkiv ? new ArkivWriter(cfg.arkiv) : null;
const missions = new Missions(cfg, decider, storage, registry, robot, arkiv);

const WEB = join(CORE_ROOT, "web");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".obj": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/** A scenario's world before any mission exists: geometry for the 3D view, texture for placing defects. */
const previewOf = (id: string) => robot.preview(simSection(loadProfile(id), "native"));

function publicConfig() {
  const n = cfg.chain.network;
  return {
    chain: cfg.chain.enabled
      ? { network: n.name, chainId: n.chainId, rpc: n.rpc, explorer: n.explorer, registry: cfg.chain.registry, robotRegistry: cfg.chain.robotRegistry, robotId: cfg.chain.robotId }
      : null,
    storage: { kind: storage.kind, label: storage.label, indexer: cfg.storage.indexer, storagescan: cfg.storage.network.storagescan },
    zg: {
      mode: cfg.zg.mode,
      model: cfg.zg.visionModel,
      trustMode: cfg.zg.trustMode,
      attestation: cfg.zg.attestation,
      endpoints: cfg.zg.endpoints.map((e) => e.name),
      decisionModel: cfg.zg.decisionModel || null,
    },
    arkiv: arkiv ? { network: "rabdi", chainId: 7794095, writer: arkiv.address, accessKey: cfg.arkiv!.accessKey, retentionDays: cfg.arkiv!.retentionDays, explorer: "https://rabdi.explorer.arkiv.network", stats: { ...arkiv.stats, gas: String(arkiv.stats.gas), fee: String(arkiv.stats.fee) } } : null,
    policy: cfg.policy,
    publicVerifierUrl: cfg.publicVerifierUrl || null,
  };
}

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

function send(res: ServerResponse, code: number, obj: unknown) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(b);
}

function sendBytes(res: ServerResponse, bytes: Uint8Array | null, type: string) {
  if (!bytes) return send(res, 404, { ok: false, error: "not found" });
  res.writeHead(200, { "content-type": type, "access-control-allow-origin": "*", "cache-control": "no-store" });
  res.end(Buffer.from(bytes));
}

function serveStatic(res: ServerResponse, path: string) {
  const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  const file = normalize(join(WEB, rel));
  if (!file.startsWith(WEB) || !existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
  return true;
}

type Handler = (req: IncomingMessage, m: RegExpMatchArray, url: URL) => Promise<unknown>;
const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/config$/, async () => publicConfig()],
  ["GET", /^\/api\/scenarios$/, async () => ({ scenarios: listProfiles(), default: cfg.sim.scenario })],
  ["GET", /^\/api\/scenarios\/([a-z0-9-]+)\/preview$/, async (_q, m) => previewOf(m[1])],
  [
    "GET",
    /^\/api\/status$/,
    async () => ({
      mission: missions.summary(missions.current),
      demo: { linkDown: router.link.down, ...missions.demo },
      queue: missions.queue.pending + (missions.chainQueue === missions.queue ? 0 : missions.chainQueue.pending),
      missions: [...missions.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
    }),
  ],
  ["GET", /^\/api\/robot\/state$/, async (_q, _m, u) => robot.state(Number(u.searchParams.get("since") ?? 0))],
  ["POST", /^\/api\/mission\/start$/, async (q) => ({ mission: missions.summary(await missions.start({ ...(await body(q)), background: true })) })],
  ["POST", /^\/api\/world\/place$/, async (q) => robot.place(await body(q))],
  ["POST", /^\/api\/robot\/estop$/, async () => robot.estop()],
  ["POST", /^\/api\/robot\/human$/, async (q) => robot.human(await body(q))],
  ["POST", /^\/api\/counterfactual$/, async (q) => robot.counterfactual((await body(q)).force ?? "continue")],
  // robot-facing
  ["POST", /^\/api\/checkpoint$/, async (q) => missions.onCheckpoint(await body(q))],
  ["POST", /^\/api\/entries$/, async (q) => missions.onEntry((await body(q)).entry)],
  // demo controls
  ["POST", /^\/api\/demo\/link$/, async (q) => ((router.link.down = !!(await body(q)).down), { linkDown: router.link.down })],
  ["POST", /^\/api\/demo\/forge$/, async () => ((missions.demo.forgeArmed = true), missions.demo)],
  ["POST", /^\/api\/demo\/tamper-answer$/, async () => ((missions.demo.tamperArmed = true), missions.demo)],
  ["POST", /^\/api\/missions\/(0x[0-9a-fA-F]{64})\/tamper-log$/, async (q, m) => missions.tamperedReport(m[1], (await body(q)).seq)],
  // missions
  ["GET", /^\/api\/missions\/(0x[0-9a-fA-F]{64})$/, async (_q, m) => missions.summary(missions.records.get(m[1]) ?? null)],
  [
    "GET",
    /^\/api\/missions\/(0x[0-9a-fA-F]{64})\/entries$/,
    async (_q, m) => ({ entries: missions.records.get(m[1])?.entries ?? [], manifest: missions.records.get(m[1])?.manifestText ?? null }),
  ],
  ["GET", /^\/api\/missions\/(0x[0-9a-fA-F]{64})\/verify$/, async (_q, m, u) => missions.verify(m[1], (u.searchParams.get("source") as any) ?? "storage")],
  ["GET", /^\/api\/missions\/(0x[0-9a-fA-F]{64})\/crop-key$/, async (_q, m) => missions.cropKey(m[1])],
  ["POST", /^\/api\/missions\/(0x[0-9a-fA-F]{64})\/replay$/, async (_q, m) => robot.replay(missions.records.get(m[1])?.entries)],
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", publicBase);
  const path = url.pathname;
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" });
    return res.end();
  }
  try {
    if (req.method === "GET" && path === "/api/robot/world.png") return sendBytes(res, await robot.bytes("/world.png"), "image/png");
    if (req.method === "GET" && path === "/api/robot/world/texture.jpg") return sendBytes(res, await robot.bytes("/world/texture.jpg", 20000), "image/jpeg");
    let pm = path.match(/^\/api\/scenarios\/([a-z0-9-]+)\/preview\.jpg$/);
    if (req.method === "GET" && pm) {
      await previewOf(pm[1]);
      return sendBytes(res, await robot.bytes("/world/preview.jpg", 20000), "image/jpeg");
    }
    let m = path.match(/^\/api\/missions\/(0x[0-9a-fA-F]{64})\/crop\/(\d+)\.png$/);
    if (req.method === "GET" && m) return sendBytes(res, missions.crop(m[1], Number(m[2])), "image/png");
    m = path.match(/^\/api\/storage\/(0x[0-9a-fA-F]{64})$/);
    if (req.method === "GET" && m) return sendBytes(res, await storage.download(m[1]), "application/octet-stream");
    for (const [method, re, fn] of routes) {
      const mm = path.match(re);
      if (mm && req.method === method) return send(res, 200, await fn(req, mm, url));
    }
    if (req.method === "GET" && serveStatic(res, path)) return;
    send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    send(res, 500, { ok: false, error: (e as Error).message });
  }
});

server.listen(cfg.port, cfg.host, () => {
  const c = publicConfig();
  console.log(`[core] Blackbox core on ${publicBase}`);
  console.log(`[core]   0G Compute : ${c.zg.mode === "mock" ? "MOCK (dev only, not 0G)" : "Router"} ${cfg.zg.endpoints.map((e) => `${e.name}=${e.url}`).join(", ")} model=${c.zg.model} trust=${c.zg.trustMode}`);
  console.log(`[core]   Storage    : ${storage.label}`);
  console.log(`[core]   Arkiv      : ${arkiv ? `rabdi (7794095) writer ${arkiv.address}, ${cfg.arkiv!.retentionDays}-day retention, mirror ${cfg.arkiv!.mirror ? "on" : "off"}${cfg.arkiv!.accessKey ? "" : ", public endpoint (rate limited)"}` : "off (ARKIV=rabdi to turn on)"}`);
  console.log(`[core]   Chain      : ${c.chain ? `${c.chain.network} (${c.chain.chainId}) registry ${c.chain.registry || "UNSET"}` : "disabled (CHAIN=none)"}`);
  console.log(`[core]   Robot      : ${cfg.robotUrl}`);
});
