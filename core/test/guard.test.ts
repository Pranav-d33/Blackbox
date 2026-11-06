import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { PublicGuard } from "../src/guard";

const req = (ip: string, opts: { remote?: string; xff?: boolean; admin?: string } = {}) =>
  ({
    headers: { ...(opts.xff === false ? {} : { "x-forwarded-for": ip }), ...(opts.admin ? { "x-admin-token": opts.admin } : {}) },
    socket: { remoteAddress: opts.remote ?? "10.0.0.9" },
  }) as unknown as IncomingMessage;

const pub = (extra: Record<string, string> = {}) => new PublicGuard({ PUBLIC_MODE: "1", ADMIN_TOKEN: "s3cret", PUBLIC_FLIGHT_COOLDOWN_S: "90", PUBLIC_DAILY_FLIGHTS: "2", ...extra } as NodeJS.ProcessEnv);

test("guard is a no-op unless PUBLIC_MODE=1", () => {
  const g = new PublicGuard({} as NodeJS.ProcessEnv);
  assert.equal(g.check(req("1.1.1.1"), "POST", "/api/checkpoint", false), null);
  assert.deepEqual(g.clampDefects([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("robot-facing routes answer only to loopback with no proxy hop", () => {
  const g = pub();
  assert.equal(g.check(req("1.1.1.1"), "POST", "/api/entries", false)?.status, 403);
  assert.equal(g.check(req("", { remote: "10.0.0.9", xff: false }), "POST", "/api/checkpoint", false)?.status, 403);
  assert.equal(g.check(req("", { remote: "127.0.0.1", xff: false }), "POST", "/api/checkpoint", true), null);
});

test("a flight has a per-IP cooldown and a daily cap, and the admin token bypasses both", () => {
  const g = pub();
  const a = req("2.2.2.2");
  assert.equal(g.check(a, "POST", "/api/mission/start", false), null);
  g.started(a);
  assert.equal(g.check(a, "POST", "/api/mission/start", false)?.status, 429); // cooldown
  const b = req("3.3.3.3");
  assert.equal(g.check(b, "POST", "/api/mission/start", false), null);
  g.started(b);
  assert.match(g.check(req("4.4.4.4"), "POST", "/api/mission/start", false)?.error ?? "", /limit/); // cap of 2
  assert.equal(g.check(req("4.4.4.4", { admin: "s3cret" }), "POST", "/api/mission/start", false), null);
  assert.equal(g.check(req("4.4.4.4", { admin: "wrong" }), "POST", "/api/mission/start", false)?.status, 429);
});

test("only the visitor who started the flight may steer it", () => {
  const g = pub({ PUBLIC_DAILY_FLIGHTS: "10" });
  const owner = req("5.5.5.5");
  g.started(owner);
  for (const p of ["/api/robot/estop", "/api/demo/link", "/api/world/place", "/api/robot/human", "/api/counterfactual"]) {
    assert.equal(g.check(req("6.6.6.6"), "POST", p, true)?.status, 403, p);
    assert.equal(g.check(owner, "POST", p, true), null, p);
  }
  assert.equal(g.check(req("6.6.6.6"), "GET", "/api/robot/state", true), null); // watching is open
  assert.equal(g.check(req("6.6.6.6"), "POST", "/api/robot/estop", false), null); // nothing flying: no owner to protect
});

test("marks per flight are capped and writes are rate limited", () => {
  const g = pub({ PUBLIC_MAX_MARKS: "3" });
  assert.deepEqual(g.clampDefects([1, 2, 3, 4, 5]), [1, 2, 3]);
  const x = req("7.7.7.7");
  let denied = 0;
  for (let i = 0; i < 60; i++) if (g.check(x, "POST", "/api/world/place", false)) denied++;
  assert.ok(denied >= 20, `expected the write budget to run out, denied ${denied}`);
});
