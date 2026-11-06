import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { crewVerdict } from "../src/mock0g/classify";
import { crewNonce } from "../src/lib/interlock";
import { sha256Hex } from "../src/lib/canonical";

const prompt = JSON.parse(readFileSync(new URL("../../scenarios/solar-farm.json", import.meta.url), "utf8")).decision.prompt;

test("mock crew model maps field notes onto the profile vocabulary", () => {
  assert.deepEqual(crewVerdict("glass is shattered from hail, send the repair crew", prompt), { label: "cracked_cell", severity: 3, action: "descend" });
  assert.deepEqual(crewVerdict("just bird droppings, move on", prompt), { label: "soiling", severity: 0, action: "continue" });
  assert.equal(crewVerdict("fly to the highway", prompt).action, "refuse");
  assert.equal(crewVerdict("hmm not sure", prompt).action, "refuse");
});

test("crew nonce binds the checkpoint and the exact words", () => {
  const n = "0x" + "ab".repeat(32);
  assert.notEqual(crewNonce(n, sha256Hex("skip it")), crewNonce(n, sha256Hex("skip it!")));
  assert.match(crewNonce(n, sha256Hex("x")), /^0x[0-9a-f]{64}$/);
});
