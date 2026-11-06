/**
 * Camera crops show critical infrastructure. They are evidence, so they go to 0G Storage, but encrypted:
 * AES-256-GCM under a per-mission key derived from CROP_KEY (HKDF-SHA256, info = mission id).
 * The log keeps obs_hash = keccak256(plain PNG), so whoever is given the mission key can decrypt a crop
 * and check it is exactly what the robot sent to 0G. Nobody else learns what the camera saw.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { keccakHex } from "./lib/canonical";

const MAGIC = Buffer.from("BBXC1"); // Blackbox crop, v1

/** CROP_KEY from the environment, else one generated once and kept in the core's data dir (never uploaded). */
export function cropMasterKey(fromEnv: string, dataDir: string): Buffer {
  if (fromEnv) return Buffer.from(fromEnv.replace(/^0x/, ""), "hex");
  const f = join(dataDir, "crop.key");
  if (!existsSync(f)) {
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(f, "utf8").trim(), "hex");
}

export const missionCropKey = (master: Buffer, missionId: string) => Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), Buffer.from(`blackbox-crop:${missionId.toLowerCase()}`), 32));

/** A public fingerprint of the mission key, for the manifest: lets an auditor confirm they were given the right key. */
export const keyId = (key: Buffer) => keccakHex(new Uint8Array(Buffer.concat([Buffer.from("blackbox-crop-key"), key])));

export function encryptCrop(key: Buffer, png: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(png), c.final()]);
  return Buffer.concat([MAGIC, iv, body, c.getAuthTag()]);
}

export function decryptCrop(key: Buffer, blob: Buffer): Buffer {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not an encrypted Blackbox crop");
  const iv = blob.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = blob.subarray(blob.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(MAGIC.length + 12, blob.length - 16)), d.final()]);
}
