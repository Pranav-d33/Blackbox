/**
 * Public-mode guardrails. Off by default (local demo, booth). With PUBLIC_MODE=1 the core can sit on the open
 * internet next to one real robot and real 0G credits:
 *   - robot-facing routes (/api/checkpoint, /api/entries) answer only to loopback, so nobody can inject entries
 *   - one flight at a time is already enforced by Missions.start; this adds a per-IP cooldown and a daily cap
 *   - the flight's controls (place, e-stop, human, counterfactual, demo breakers) belong to whoever started it
 *   - every client gets a request budget, writes a smaller one
 *   - ADMIN_TOKEN (header x-admin-token) bypasses all of it for the operator
 * The client IP is the first x-forwarded-for hop, which is what Railway and Render set. It is a brake on
 * accidents and drive-by abuse, not authentication.
 */
import type { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";

export type Denial = { status: number; error: string };

const ROBOT_ONLY = [/^\/api\/checkpoint$/, /^\/api\/entries$/];
const FLIGHT_CONTROLS = [/^\/api\/world\/place$/, /^\/api\/robot\/estop$/, /^\/api\/robot\/human$/, /^\/api\/robot\/instruct$/, /^\/api\/counterfactual$/, /^\/api\/demo\//];
const HEAVY = [/^\/api\/missions\/0x[0-9a-fA-F]{64}\/replay$/, /^\/api\/missions\/0x[0-9a-fA-F]{64}\/verify$/];

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export const clientIp = (req: IncomingMessage): string => {
  const xff = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return xff || req.socket.remoteAddress || "unknown";
};

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

class Window {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private ms: number) {}
  /** true if this hit is allowed (and counts it) */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.ms);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
  sweep(now = Date.now()) {
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.ms)) this.hits.delete(k);
  }
}

export class PublicGuard {
  readonly enabled: boolean;
  readonly maxDefects: number;
  private admin: string;
  private dailyCap: number;
  private cooldownMs: number;
  private reads = new Window(240, 60_000);
  private writes = new Window(40, 60_000);
  private heavy = new Window(6, 60_000);
  private starts = new Map<string, number>();
  private day = "";
  private flightsToday = 0;
  private owner: string | null = null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.enabled = env.PUBLIC_MODE === "1";
    this.admin = env.ADMIN_TOKEN ?? "";
    this.dailyCap = Number(env.PUBLIC_DAILY_FLIGHTS ?? 40);
    this.cooldownMs = Number(env.PUBLIC_FLIGHT_COOLDOWN_S ?? 90) * 1000;
    this.maxDefects = Number(env.PUBLIC_MAX_MARKS ?? 8);
    if (this.enabled) setInterval(() => [this.reads, this.writes, this.heavy].forEach((w) => w.sweep()), 60_000).unref();
  }

  private isAdmin(req: IncomingMessage) {
    const t = String(req.headers["x-admin-token"] ?? "");
    return !!this.admin && !!t && same(t, this.admin);
  }

  private today() {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== this.day) ((this.day = d), (this.flightsToday = 0));
    return d;
  }

  /** Decide before a route runs. `flying` = a mission is preparing or flying right now. */
  check(req: IncomingMessage, method: string, path: string, flying: boolean): Denial | null {
    if (!this.enabled || method === "OPTIONS" || !path.startsWith("/api/")) return null;
    if (this.isAdmin(req)) return null;
    const ip = clientIp(req);

    if (ROBOT_ONLY.some((re) => re.test(path))) {
      return LOOPBACK.has(req.socket.remoteAddress ?? "") && !req.headers["x-forwarded-for"] ? null : { status: 403, error: "robot-only route" };
    }
    if (!(method === "GET" ? this.reads : this.writes).take(ip)) return { status: 429, error: "too many requests, slow down" };
    if (HEAVY.some((re) => re.test(path)) && !this.heavy.take(ip)) return { status: 429, error: "one at a time, try again in a minute" };

    if (method === "POST" && path === "/api/mission/start") {
      this.today();
      if (this.flightsToday >= this.dailyCap) return { status: 429, error: "today's public flight limit is reached, come back tomorrow" };
      const wait = this.cooldownMs - (Date.now() - (this.starts.get(ip) ?? 0));
      if (wait > 0) return { status: 429, error: `please wait ${Math.ceil(wait / 1000)} s before the next flight` };
      return null;
    }
    if (method === "POST" && FLIGHT_CONTROLS.some((re) => re.test(path))) {
      if (!flying) this.owner = null;
      if (flying && this.owner && this.owner !== ip) return { status: 403, error: "another visitor is flying right now" };
    }
    return null;
  }

  /** Call after Missions.start succeeded. */
  started(req: IncomingMessage) {
    if (!this.enabled) return;
    const ip = clientIp(req);
    this.today();
    this.flightsToday++;
    this.starts.set(ip, Date.now());
    this.owner = ip;
  }

  /** Public mode caps how many marks one flight may carry. */
  clampDefects<T>(defects: T[] | undefined): T[] | undefined {
    return this.enabled && Array.isArray(defects) ? defects.slice(0, this.maxDefects) : defects;
  }

  status() {
    return { enabled: this.enabled, flightsToday: this.flightsToday, dailyCap: this.dailyCap, cooldownS: this.cooldownMs / 1000, maxMarks: this.maxDefects };
  }
}
