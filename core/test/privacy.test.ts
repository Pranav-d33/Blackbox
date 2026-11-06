/** Crops on 0G Storage are ciphertext; the mission key decrypts them back to the exact bytes the log hashed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptCrop, encryptCrop, keyId, missionCropKey } from "../src/privacy";

const master = randomBytes(32);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(2000)]);

test("per-mission keys differ and round-trip", () => {
  const a = missionCropKey(master, "0x" + "ab".repeat(32));
  const b = missionCropKey(master, "0x" + "cd".repeat(32));
  assert.notDeepEqual(a, b);
  assert.notEqual(keyId(a), keyId(b));
  const blob = encryptCrop(a, png);
  assert.ok(!blob.includes(png.subarray(0, 64)), "ciphertext must not contain the PNG");
  assert.deepEqual(decryptCrop(a, blob), png);
});

test("the wrong key or a flipped byte is refused", () => {
  const a = missionCropKey(master, "0x01");
  const blob = encryptCrop(a, png);
  assert.throws(() => decryptCrop(missionCropKey(master, "0x02"), blob));
  blob[40] ^= 1;
  assert.throws(() => decryptCrop(a, blob));
});
