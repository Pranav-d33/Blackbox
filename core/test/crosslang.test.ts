/** TypeScript and Python must agree byte-for-byte: encodings, nonces, interlock, entry hashes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getBytes, hashMessage, recoverAddress } from "ethers";
import { REPO_ROOT } from "../src/config";
import { canonicalJson, entryHash, goJson } from "../src/lib/canonical";
import { checkpointNonce, verifyBundle } from "../src/lib/interlock";
import { classify, toAnswer } from "../src/mock0g/classify";
import { SYSTEM_PROMPT } from "../src/zg/decide";
import { verifyMission } from "../src/verifier/core";

const venvPy = join(REPO_ROOT, "robot", ".venv", "bin", "python");
const py = existsSync(venvPy) ? venvPy : "python3";
const V = JSON.parse(execFileSync(py, [join(REPO_ROOT, "robot", "tests", "gen_vectors.py")], { maxBuffer: 64 << 20 }).toString("utf8"));
const policy = { tee_signers: [V.tee], tee_binding: "auto", nonce_hex_len: 64 };

test("canonical JSON matches Python", () => {
  for (const [v, want] of V.canonical) assert.equal(canonicalJson(v), want);
});

test("Go-style JSON matches Python", () => {
  for (const [v, want] of V.go) assert.equal(goJson(v), want);
});

test("nonce matches Python", () => {
  assert.equal(checkpointNonce(V.nonce.mission, V.nonce.obs, V.nonce.k), V.nonce.nonce);
});

test("interlock agrees with the robot", () => {
  const n = V.nonce.nonce;
  const good = verifyBundle(V.bundles.good, policy, n);
  assert.equal(good.accepted, true, good.reason);
  assert.equal(good.binding, "go");
  assert.match(verifyBundle(V.bundles.forged, policy, n).reason, /not on the manifest allowlist/);
  assert.match(verifyBundle(V.bundles.tampered, policy, n).reason, /does not cover this answer/);
});

test("entry hashes and robot signatures match Python", () => {
  V.entries.forEach((e: any, i: number) => {
    assert.equal(entryHash(e), V.entry_hashes[i]);
    assert.equal(entryHash(e), e.hash);
    assert.equal(recoverAddress(hashMessage(getBytes(e.hash)), e.robot_sig), V.robot);
  });
});

test("verifier names a tampered entry", () => {
  const entries = JSON.parse(JSON.stringify(V.entries));
  const ok = verifyMission({ missionId: V.nonce.mission, entries });
  assert.equal(ok.checks.find((c) => c.id === "hashes")!.status, "pass");
  entries[1].body.answer.severity = 0;
  const bad = verifyMission({ missionId: V.nonce.mission, entries });
  assert.equal(bad.ok, false);
  assert.match(bad.firstFailure!, /Entry #1/);
});

test("verifier checks the allowlist against 0G's InferenceServing, not the manifest's word", () => {
  const entries = JSON.parse(JSON.stringify(V.entries));
  const signer: string = V.tee;
  entries[0].body.manifest = { seed: 1, policy: { tee_signers: [signer], vision_model: "0gm-1.0-35b-a3b" } };
  const svc = (s: string) => [{ provider: "0x" + "22".repeat(20), model: "0GM-1.0-35B-A3B", verifiability: "TeeML", signer: s, acknowledged: true }];
  const tee = (r: ReturnType<typeof verifyMission>) => r.checks.find((c) => c.id === "tee-registry")!;
  assert.equal(tee(verifyMission({ missionId: V.nonce.mission, entries })).status, "skip");
  assert.equal(tee(verifyMission({ missionId: V.nonce.mission, entries, services: svc(signer) })).status, "pass");
  const planted = verifyMission({ missionId: V.nonce.mission, entries, services: svc("0x" + "99".repeat(20)) });
  assert.equal(tee(planted).status, "fail");
  assert.match(tee(planted).detail, /not the acknowledged TEE signer/);
});

test("mock classifier separates cracks from decoys on rendered crops", () => {
  for (const [name, b64] of Object.entries<string>(V.crops)) {
    const got = toAnswer(classify(Buffer.from(b64, "base64")), SYSTEM_PROMPT);
    assert.equal(got.label, name.split("-")[0], `${name} -> ${JSON.stringify(got)}`);
  }
});
