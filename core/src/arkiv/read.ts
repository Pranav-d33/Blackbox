/**
 * Reads from Arkiv (browser-safe): per-asset history, site analytics, the fleet board, and the
 * 0G Storage mirror the verifier falls back to. Every query is shown as its Arkiv query string so a
 * judge can paste it into the explorer or run it with `arkiv_query`.
 */
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq, exists } from "@arkiv-network/sdk/query";
import { hexToBytes, hexToString, http } from "viem";
import { Asset, Blob, Finding, Mission } from "./schema";

export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network";

export function arkivPublic(accessKey = "") {
  return createPublicClient({ chain: rabdi({ accessKey }), transport: http() });
}
type Pub = ReturnType<typeof arkivPublic>;

const json = (h: unknown) => {
  try {
    return JSON.parse(hexToString(h as `0x${string}`));
  } catch {
    return {};
  }
};
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x);
const num = (x: any) => (typeof v(x) === "bigint" ? Number(v(x)) : Number(v(x)));

export interface FindingRow {
  key: string;
  owner: string;
  site: string;
  asset: string;
  label: string;
  severity: number;
  action: string;
  source: string;
  mission: string;
  seq: number;
  at: number;
  maker: string;
  model: string;
  batch: string;
  detail: any;
}

const FINDING_SELECT = { $key: true, $owner: true, site: true, asset: true, label: true, severity: true, action: true, source: true, mission: true, seq: true, at: true, maker: true, model: true, batch: true, detail: true } as const;

function toFinding(e: any): FindingRow {
  return {
    key: v(e.$key),
    owner: v(e.$owner),
    site: v(e.site),
    asset: v(e.asset),
    label: v(e.label),
    severity: num(e.severity),
    action: v(e.action),
    source: v(e.source),
    mission: v(e.mission),
    seq: num(e.seq),
    at: num(e.at),
    maker: v(e.maker),
    model: v(e.model),
    batch: v(e.batch),
    detail: json(v(e.detail)),
  };
}

/** Every inspection of one asset, newest first, across all missions and inspectors. */
export async function assetHistory(c: Pub, site: string, asset: string) {
  const q = c.select(FINDING_SELECT).from(Finding).where(and(eq("site", site), eq("asset", asset))).orderBy(desc("at")).limit(50);
  const { entities } = await q.fetch();
  const reg = await c.select({ $owner: true, maker: true, model: true, batch: true, installed: true, warranty_until: true }).from(Asset).where(and(eq("site", site), eq("asset", asset))).limit(1).fetch();
  const a: any = reg.entities[0];
  return {
    query: q.toString(),
    findings: entities.map(toFinding),
    register: a ? { owner: v(a.$owner), maker: v(a.maker), model: v(a.model), batch: v(a.batch), installed: num(a.installed), warranty_until: num(a.warranty_until) } : null,
  };
}

/** Site analytics: findings by label, defects by maker and batch, the most-flagged assets. */
export async function siteSummary(c: Pub, site: string, defectLabels: string[]) {
  const page = (n: number) => c.select(FINDING_SELECT).from(Finding).where(eq("site", site)).orderBy(desc("at")).limit(100).offset(n);
  const q = page(0);
  const rows: FindingRow[] = [];
  for (let n = 0; n < 2000; n += 100) { // a page is at most 100 entities
    const r = await page(n).fetch();
    rows.push(...r.entities.map(toFinding));
    if (r.entities.length + r.skipped < 100) break;
  }
  const register = await c.count().from(Asset).where(eq("site", site)).fetch();
  const by = (f: (r: FindingRow) => string, keep = (_: FindingRow) => true) => {
    const m = new Map<string, number>();
    for (const r of rows.filter(keep)) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const defect = (r: FindingRow) => defectLabels.includes(r.label);
  // the latest finding per asset: an asset is open while its latest finding is a defect
  const latest = new Map<string, FindingRow>();
  for (const r of rows) if (!latest.has(r.asset) || latest.get(r.asset)!.at < r.at) latest.set(r.asset, r);
  return {
    query: q.toString(),
    total: rows.length,
    registered: Number(register),
    missions: new Set(rows.map((r) => r.mission)).size,
    byLabel: by((r) => r.label),
    defectsByMaker: by((r) => `${r.maker} ${r.model}`.trim() || "unregistered", defect),
    defectsByBatch: by((r) => r.batch || "unregistered", defect),
    open: [...latest.values()].filter(defect).sort((a, b) => b.severity - a.severity),
    inspectors: by((r) => r.owner),
  };
}

/** The fleet board: recent missions, newest first. */
export async function missions(c: Pub, site?: string) {
  const q = c
    .select({ $key: true, $owner: true, mission: true, site: true, status: true, robot: true, decisions: true, safe_stops: true, started: true, parent: true, detail: true })
    .from(Mission)
    .where(site ? eq("site", site) : exists("mission"))
    .orderBy(desc("started"))
    .limit(20);
  const { entities } = await q.fetch();
  return entities.map((e: any) => ({ key: v(e.$key), owner: v(e.$owner), mission: v(e.mission), site: v(e.site), status: v(e.status), robot: v(e.robot), decisions: num(e.decisions), safe_stops: num(e.safe_stops), started: num(e.started), parent: v(e.parent), detail: json(v(e.detail)) }));
}

/** The backup: a blob 0G Storage holds, read from its Arkiv mirror by root. The caller checks it against 0G Chain. */
export async function mirroredBlob(c: Pub, root: string): Promise<Uint8Array | null> {
  const { entities } = await c.select({ content: true }).from(Blob).where(eq("root", root.toLowerCase())).limit(1).fetch();
  const e: any = entities[0];
  return e ? hexToBytes(v(e.content)) : null;
}
