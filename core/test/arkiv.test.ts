/** The asset register follows the robot's labels, and the verifier's fallback never changes a verdict. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allAssets, loadProfile, registerOf } from "../src/profile";
import { verifyMission } from "../src/verifier/core";

test("every asset label maps to one register group", () => {
  for (const id of ["solar-farm", "bridge-deck"]) {
    const p = loadProfile(id);
    const all = allAssets(p);
    assert.equal(new Set(all).size, all.length);
    for (const a of all) assert.ok(registerOf(p, a), `${id} ${a} has no register entry`);
  }
  assert.equal(allAssets(loadProfile("solar-farm")).length, 136);
  assert.equal(registerOf(loadProfile("solar-farm"), "r2m13")!.batch, "2024-B");
  assert.equal(registerOf(loadProfile("bridge-deck"), "x16y00")!.maker, "Konkan Infra");
});

test("blobs served by the Arkiv mirror are reported, never hidden", () => {
  const v = (sources: any) => verifyMission({ missionId: "0x" + "ab".repeat(32), entries: [], sources }).checks.find((c) => c.id === "availability")!;
  assert.equal(v({ zg: 5, mirror: 0, failed: [] }).status, "pass");
  const w = v({ zg: 4, mirror: 1, failed: ["0x1234…: 0G Storage download timeout"] });
  assert.equal(w.status, "warn");
  assert.match(w.detail, /1 of 5 blobs came from the Arkiv mirror/);
});
