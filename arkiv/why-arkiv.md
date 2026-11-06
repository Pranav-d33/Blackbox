# Why Arkiv (judging: "capabilities unavailable elsewhere" and "features match the app")

Blackbox already stores a robot's decisions on 0G Storage and anchors them on 0G Chain. That makes them **provable**, but not **askable**: 0G Storage returns a file by its content root and nothing else. Nobody at a solar farm asks for a root. They ask:

- *What's the history of module r2m13?*
- *Which modules are still cracked?*
- *Are cracked cells concentrated in one maker's batch?* (that is a warranty claim)
- *Which inspector wrote each finding, and when?*

Each Arkiv feature maps to one of those needs:

| Arkiv feature | What it does in Blackbox | Without it |
|---|---|---|
| Indexed attributes and queries | per-asset history, defects by maker/batch, open defects, all in the browser | a separate database run by the operator, the party the log exists to check |
| Wallet ownership | the **site owner** owns the asset register, the **inspector** owns the findings, `.ownedBy()` tells them apart | one admin account that can rewrite both |
| Expiration | findings and mirrors stay hot for the working period (90 days) and expire; the proof stays on 0G forever | an ever-growing table, or manual deletion |
| A second, independent store | the verifier falls back to the Arkiv mirror when 0G Storage can't serve a blob, and re-checks it against 0G Chain | one storage outage blocks verification |

Arkiv does not replace 0G and is never trusted for the verdict: the robot's signatures and the anchors on 0G Chain decide. That is why the combination works: **0G proves it, Arkiv makes it searchable.**

Measured side by side on the same log entries: [benchmark.md](benchmark.md) (`npm run arkiv:bench`).
