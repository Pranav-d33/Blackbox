# Privacy model

Blackbox makes a robot's decisions checkable by strangers. That only works if the evidence is public, and inspection evidence is sensitive: it shows where critical infrastructure is weak. So the line is drawn per piece of data, and the manifest records where it was drawn for each mission (`manifest.privacy`, anchored on 0G Chain with the mission).

| Data | Where it goes | Who can read it | Why |
|---|---|---|---|
| Camera crop sent to 0G | 0G Compute, `X-0G-Provider-Trust-Mode: private` | only the TEE enclave (Intel TDX); not the provider's operator, not the Router | sealed inference: the model sees the image, the people running it don't |
| Camera crop as evidence | 0G Storage, **AES-256-GCM** (`CROP_PRIVACY=encrypted`, the default) | whoever the operator gives the mission key to | the image of a cracked bridge is not for everyone; an auditor can decrypt it and check `keccak256(png) = obs_hash` |
| `obs_hash`, nonce, answer, TEE signature, request id | 0G Storage, plain | anyone | this *is* the proof; without it nothing can be verified |
| Pose, target position, asset label | 0G Storage, plain | anyone | needed to replay the flight and to bind a decision to an asset |
| Mission root, anchors, close, trajectory hash | 0G Chain | anyone | the commitment nobody can quietly rewrite |
| Findings, asset register, 0G Storage mirror | Arkiv (Rabdi) | anyone | the queryable working copy: labels, severities, assets, maker and batch; expires after `ARKIV_RETENTION_DAYS` (default 90). Camera crops are never mirrored |
| Robot private key | the robot only | nobody else | it signs every entry; the core cannot sign for it |
| Crop master key (`CROP_KEY`, or `core/data/crop.key`) | the operator's core | the operator | never uploaded; per-mission keys are derived with HKDF-SHA256 |

## Releasing a mission to an auditor

```bash
curl http://127.0.0.1:8787/api/missions/0x<mission>/crop-key
```

returns `{ key, key_id }` for that mission only. `key_id` is also in the manifest, so the auditor can confirm they were given the right key. A per-mission key reveals that mission's crops and nothing else. The core binds to `127.0.0.1` by default; keep it that way, or put this route behind your own auth.

## What stays visible

Being publicly verifiable means some things are public by design: that a mission happened, when, which robot flew it, how many decisions it made, the labels and severities 0G answered, and which assets they were about. If even that is too much for a site, run with `ARKIV=none` and give the mission id only to the parties who need it. The chain still proves the record was not changed, but nobody can find the mission without being told.

Not in scope today: encrypting the log entries themselves (the verifier would then need the key too), and zero-knowledge proofs over the log. Both fit the same manifest field when needed.
