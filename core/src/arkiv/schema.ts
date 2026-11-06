/**
 * Arkiv entities (browser-safe, shared by the core, the console and the verifier). See arkiv/schema.md.
 *
 * 0G keeps the permanent proof: the robot-signed log on 0G Storage, anchored on 0G Chain. Arkiv is the
 * working database next to it: queryable by attribute, owned by the wallet that wrote it, and expiring
 * on its own (max ~91 days on Rabdi, extendable). Nothing on Arkiv is trusted by the verifier: every
 * blob read from the mirror is re-checked against the hashes anchored on 0G Chain.
 */
import { bytes, defineSchema, i32, str, u64 } from "@arkiv-network/sdk/schema";

/** One decision on one asset: the row behind per-panel history and site analytics. Written by the inspector. */
export const Finding = defineSchema("blackbox.finding", {
  site: str().indexed(), // the mission profile id: solar-farm, bridge-deck
  asset: str().indexed(), // robot-signed asset label: r2m13 (row 2, module 13), x12y03 (1 m² deck square)
  label: str().indexed(), // 0G's answer, or "safe_stop"
  severity: i32().indexed(), // -1 when no decision was made
  action: str().indexed(), // descend | continue | safe_stop, or a human's action after a hold
  source: str().indexed(), // 0g | human | safe_stop
  mission: str().indexed(),
  seq: u64().indexed(), // the entry in the robot-signed log
  at: u64().indexed(), // unix seconds
  maker: str().indexed(), // denormalized from the asset register, so one query answers "cracks by maker"
  model: str().indexed(),
  batch: str().indexed(),
  detail: bytes(), // JSON: entry hash, 0G Storage root, request id, TEE signer, reason, outcome
});

/** The site's asset register: who made each module, which pour each deck square is. Written by the site owner. */
export const Asset = defineSchema("blackbox.asset", {
  site: str().indexed(),
  asset: str().indexed(),
  maker: str().indexed(),
  model: str().indexed(),
  batch: str().indexed(),
  installed: i32().indexed(), // year
  warranty_until: i32().indexed(), // year
  detail: bytes(),
});

/** A copy of one blob uploaded to 0G Storage (manifest, log entry, index), keyed by its 0G root. The backup. */
export const Blob = defineSchema("blackbox.blob", {
  root: str().indexed(), // the 0G Storage merkle root the chain anchors point at
  kind: str().indexed(), // manifest | entry | index
  mission: str().indexed(),
  seq: i32().indexed(), // entry seq, or -1
  content: bytes(),
});

/** One row per mission, patched as it moves: the fleet board. Written by the inspector. */
export const Mission = defineSchema("blackbox.mission", {
  mission: str().indexed(),
  site: str().indexed(),
  status: str().indexed(), // flying | ended | closed | error
  robot: str().indexed(),
  decisions: i32().indexed(),
  safe_stops: i32().indexed(),
  started: u64().indexed(),
  parent: str().indexed(), // the mission this one resumed, or ""
  detail: bytes(), // JSON: register tx, anchors, close tx, trajectory hash
});

export const SCHEMAS = { Finding, Asset, Blob, Mission };
