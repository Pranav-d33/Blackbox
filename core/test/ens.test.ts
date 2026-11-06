/** ENS names and the verifier's ENS checks: ENS may index the log, never contradict it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentNames, assetName, evmCoinType, finding, parseFinding } from "../src/ens/names";
import { type EnsView, verifyMission } from "../src/verifier/core";
import type { Entry } from "../src/lib/canonical";

const MID = "0x" + "ab".repeat(32);
const ROBOT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TEE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const PARENT = "blackbox.eth";
const section = { network: "local", chain_id: 31337, universal_resolver: "0x" + "11".repeat(20), parent: PARENT, zone: "solar", names: agentNames(PARENT) };
const manifest = { robot: ROBOT, seed: 1, policy: { tee_signers: [TEE], attestation: "tee" }, ens: section };

const entry = (seq: number, kind: string, body: any): Entry => ({ v: 1, mission_id: MID, seq, t_ms: seq, kind, body, prev: "0x", hash: "0x" + String(seq).padStart(64, "0"), robot: ROBOT, robot_sig: "0x" } as any);
const log = [
  entry(0, "mission_start", { manifest }),
  entry(1, "decision", { checkpoint: 0, asset: "r2m14", answer: { label: "cracked_cell", severity: 2, action: "descend" }, action_applied: "descend" }),
  entry(2, "safe_stop", { checkpoint: 1, asset: "r3m02", reason: "0G unreachable, no decision made" }),
];
const rec = (addr: string | null, texts: Record<string, string> = {}) => ({ name: "", resolver: section.universal_resolver, addr, texts });
const view = (assets: EnsView["assets"], drone = ROBOT): EnsView => ({ section, agents: { robot: rec(drone), tee: rec(TEE), operator: rec(null), registry: rec(null) }, assets });
const asset = (e: Entry, f: string, mission = MID) => rec(null, { "blackbox.mission": mission, "blackbox.entry": `${e.seq}:${e.hash}`, "blackbox.finding": f });
const check = (ens: EnsView, id: string) => verifyMission({ missionId: MID, entries: log, ens }).checks.find((c) => c.id === id)!;

test("names follow <asset>.<zone>.<parent>", () => {
  assert.equal(assetName("r2m14", "solar", PARENT), "r2m14.solar.blackbox.eth");
  assert.equal(agentNames(PARENT).tee, "0g-tee.blackbox.eth");
  assert.equal(evmCoinType(16602), 0x80000000 + 16602);
  assert.deepEqual(parseFinding(finding("safe_stop", "-", "safe_stop")), { label: "safe_stop", severity: null, action: "safe_stop" });
});

test("agent names resolve to the robot key and the TEE signer", () => {
  assert.equal(check(view({}), "ens-agents").status, "pass");
  const c = check(view({}, "0x" + "99".repeat(20)), "ens-agents");
  assert.equal(c.status, "warn");
  assert.match(c.detail, /drone\.blackbox\.eth resolves to 0x9999/);
});

test("asset records that match the signed log pass", () => {
  const c = check(view({ r2m14: asset(log[1], "cracked_cell/2/descend"), r3m02: asset(log[2], "safe_stop/-/safe_stop") }), "ens-assets");
  assert.equal(c.status, "pass", c.detail);
});

test("an ENS finding the log does not contain fails", () => {
  const c = check(view({ r2m14: asset(log[1], "cracked_cell/0/continue") }), "ens-assets");
  assert.equal(c.status, "fail");
  assert.match(c.detail, /r2m14\.solar\.blackbox\.eth says "cracked_cell\/0\/continue"/);
});

test("a record re-written by a later mission is not a failure", () => {
  const c = check(view({ r2m14: asset(log[1], "soiling/0/continue", "0x" + "cd".repeat(32)) }), "ens-assets");
  assert.equal(c.status, "skip");
  assert.match(c.detail, /1 re-inspected by a later mission/);
});
