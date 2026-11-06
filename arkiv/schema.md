# Arkiv schema

Blackbox writes four entity types to Arkiv (Rabdi testnet, chain `7794095`). Definitions: [`core/src/arkiv/schema.ts`](../core/src/arkiv/schema.ts). Writer: [`core/src/arkiv/write.ts`](../core/src/arkiv/write.ts). Reads: [`core/src/arkiv/read.ts`](../core/src/arkiv/read.ts).

The split: **0G holds the proof** (the robot-signed log on 0G Storage, anchored on 0G Chain, permanent). **Arkiv holds the working data** (queryable, owned by the wallet that wrote it, expiring on its own). Nothing on Arkiv is trusted by the verifier.

## `blackbox.finding`: one decision on one asset

Written by the **inspector** (the core's Arkiv key) the moment the robot logs a decision, a human decision after a hold, or a safe stop.

| Attribute | Type | Indexed | Meaning |
|---|---|---|---|
| `site` | str | yes | mission profile id: `solar-farm`, `bridge-deck` |
| `asset` | str | yes | robot-signed asset label: `r2m13` (row 2, module 13), `x12y03` (1 m² deck square at 12 m, 3 m) |
| `label` | str | yes | 0G's answer (`cracked_cell`, `soiling`, `crack`, `decoy`, `unsure`) or `safe_stop` |
| `severity` | i32 | yes | 0..3, or -1 when no decision was made |
| `action` | str | yes | `descend`, `continue`, `safe_stop` |
| `source` | str | yes | `0g`, `human` (after a calibrated hold), `safe_stop` |
| `mission` | str | yes | mission id (bytes32 hex), as registered on BlackboxRegistry |
| `seq` | u64 | yes | the entry number in the robot-signed log |
| `at` | u64 | yes | unix seconds |
| `maker`, `model`, `batch` | str | yes | copied from the asset register, so one query answers "defects by maker" (Arkiv has no joins) |
| `detail` | bytes | no | JSON: entry hash, 0G Storage root, `x_0g_trace.request_id`, TEE signer, reason, outcome text |

Expiration: `ARKIV_RETENTION_DAYS` (default 90, Rabdi max ~91). The finding stays queryable for the working period; the proof behind it stays on 0G forever.

## `blackbox.asset`: the site's asset register

Written by the **site owner's wallet** with `npm run arkiv:register`: 136 PV modules or 192 deck squares, each with `site`, `asset`, `maker`, `model`, `batch`, `installed` (i32 year), `warranty_until` (i32 year), `detail`. Makers and contractors are fictional.

Ownership is the point: the inspector reads the register to tag its findings but cannot rewrite who made a panel. `.ownedBy(owner)` separates the two.

## `blackbox.blob`: the 0G Storage mirror

Every blob the core uploads to 0G Storage (manifest, each log entry, each anchor index) is also written here, keyed by its **0G Storage root**: `root` (str, indexed), `kind` (str), `mission` (str), `seq` (i32), `content` (bytes, up to 120 KB; camera crops are not mirrored).

When 0G Storage cannot serve a root, the verifier reads `blackbox.blob where root = …` instead, then runs every hash check on those bytes against the anchors on 0G Chain. A wrong mirror fails verification; the report always says how many blobs came from the mirror.

## `blackbox.mission`: the fleet board

Created at takeoff, patched at close (same entity key): `mission`, `site`, `status`, `robot`, `decisions`, `safe_stops`, `started` (u64), `parent` (the mission a resumed survey continues), `detail` (register and close tx hashes, anchor count, manifest root).

## Queries the product runs

```
arkiv.schema = str('blackbox.finding') AND site = str('solar-farm') AND asset = str('r2m13') ORDER BY at:u64 DESC
arkiv.schema = str('blackbox.finding') AND site = str('solar-farm') ORDER BY at:u64 DESC
arkiv.schema = str('blackbox.asset') AND site = str('solar-farm') AND asset = str('r2m13')
arkiv.schema = str('blackbox.blob') AND root = str('0x…')
```

The console prints the exact query under each Arkiv view.
