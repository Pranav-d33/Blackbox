# Narrative: 0G and Arkiv

One page for the pitch and for each sponsor's judges. Figures are sourced or marked **assumption**; full workings in [pitch-numbers-and-workflows.md](pitch-numbers-and-workflows.md).

---

## Part 1: 0G (Physical AI: Agents with a Body)

### Why web3

An inspection drone calls a solar panel clean. Months later it fails. The owner, the insurer, the panel maker and the contractor all need to know what the drone saw and decided, and today all four get the contractor's own database. The party that runs the drone is the party with the most reason to edit the record.

A robot-signed hash chain makes a log tamper-evident, and that part needs no blockchain. What it cannot prove:

- which model made the decision,
- that the answer was produced for this checkpoint and not replayed,
- that the robot did only what that answer said.

A public chain gives parties who don't trust each other a timestamped commitment none of them can quietly rewrite, readable by a stranger's phone from a QR code, with no account and no permission from the operator. It also gives the robot an identity (zerobot `RobotRegistry`) and leaves room for automatic consequences, such as releasing payment only when an inspection's record verifies.

### Why 0G specifically

Other stacks give you a chain, or storage, or inference. 0G gives all three in one network, and Blackbox needs all three *inside the control loop*:

| Layer | Job in Blackbox | Without it |
|---|---|---|
| 0G Compute (sealed, TEE) | decides every checkpoint; the TEE signature is what the robot checks before it moves | the operator's own model, unverifiable |
| 0G Storage | the manifest and every signed log entry, by content root | the log lives on the operator's server |
| 0G Chain | mission registered before takeoff, anchored every 2 decisions, closed with the trajectory hash | no public commitment, no timestamp |

No 0G, no decision: if 0G is unreachable the drone safe-stops and logs "0G unreachable, no decision made". 0G is load-bearing, not a logging sink.

### The numbers: broken panels and the cost of deciding on 0G

| Fact | Value | Source |
|---|---|---|
| Defective modules on a real drone survey | 2,481 of 232,934 = **1.06%**, varying 0.22% to 1.96% between blocks | [Remote Sensing 15(7):1914](https://www.mdpi.com/2072-4292/15/7/1914) |
| Average yield loss, US fleet | 5.08%, about **$5,070 per MW per year** | [Raptor Maps via pv magazine](https://pv-magazine-usa.com/2026/02/25/u-s-solar-assets-lose-average-5070-per-mw-from-power-losses/) |
| Human drone survey price | **$300 to $500 per MW** | averroes.ai (vendor blog, weak source) |
| Flag rate in our MuJoCo runs | about **1.5%** of modules | `robot/data` logs (demo operator plants the marks) |

**The cost idea.** Blackbox only calls 0G on crops the on-board detector flags, never on every panel. Assumptions: 1 MW ≈ 1,800 modules, detector flags **1.5%**, the rate measured over 8 MuJoCo solar-farm runs (16 crops over 136 modules each; 1.06% real defects plus soiling and false positives fits that), about 1,400 input and 40 output tokens per call. Prices from the 0G Router model pages (read 2026-11-07).

| Scope | Calls | Sealed 0GM-1.0 ($0.08 / $0.48 per M) | Qwen2.5-VL-72B ($0.045 / $0.195 per M) | Human survey |
|---|---|---|---|---|
| 1 MW | ~27 | **~$0.0035** | ~$0.0019 | $300 to $500 |
| 100 MW | ~2,700 | **~$0.35** | ~$0.19 | $30k to $50k |
| The 232,934-module plant | ~3,490 | **~$0.46** | ~$0.25 | n/a |
| Naive, every panel, 1 MW | 1,800 | ~$0.24 | ~$0.13 | n/a |

Pitch line: **"About 1 panel in 100 is broken. We only ask 0G about the few the camera flags, so making every decision verifiable costs about 35 cents for 100 MW, against a $30k survey."**

Say honestly: inference is not the business risk; flight time, hardware and missed defects are. We don't claim to replace the survey price, only that the verifiable layer is negligible next to it. Storage and chain fees are not in these figures.

### Beyond the camera: text and voice

The same sealed call and interlock take a crew's typed note or spoken command ("go down and look at r3m14") and map it to one allowed action. The transcript hash and the signed answer go into the same log, so "who told it to descend?" has an answer. See [voice-workflow.md](voice-workflow.md) and `/workflows.html`. Status: built (text, and voice via the browser's speech recognition); the verifier checks crew decisions like vision ones.

---

## Part 2: Arkiv (Build on Arkiv, from scratch)

### Why Arkiv, when we already have 0G

0G makes the record **provable**. It doesn't make it **askable**: 0G Storage returns a file by its content root and nothing else. The people at a solar farm ask:

- What's the history of module r2m13?
- Which modules are still cracked?
- Do cracked cells cluster in one maker's batch? (that is a warranty claim)
- Which inspector wrote each finding, and when?

The usual answer is a Postgres table run by the operator, which puts the record back in the hands of the party it exists to check. Arkiv gives queryable data with wallet ownership, on a chain, without an operator in the middle.

| Arkiv feature | Use in Blackbox | Swap to Postgres and you lose |
|---|---|---|
| Indexed attributes + queries | per-asset history, open defects, defects by maker/batch, from the browser | a database the operator controls |
| Wallet ownership | site owner owns the asset register, inspector owns the findings | one admin who can rewrite both |
| Expiration | findings stay hot for 90 days, then expire; the proof stays on 0G | an ever-growing table, or manual deletes |
| Independent second store | verifier falls back to the Arkiv mirror when 0G Storage can't serve a blob, re-checking hashes against 0G Chain | a single storage outage blocks verification |

**Division of labour: 0G proves it, Arkiv makes it searchable.** Arkiv is never trusted for the verdict.

### Relevance to the prize

Prize: **Build on Arkiv (from scratch)**, $3,000 / $1,000. Judged 25% each:

| Criterion | Our answer | File |
|---|---|---|
| Arkiv feedback | real friction hit while building | [arkiv/friction.md](../arkiv/friction.md) |
| Reach | owner, insurer, maker, contractor; ~7,000 findings/year for one 136-module farm inspected weekly; repair-crew and insurer views next | [arkiv/reach.md](../arkiv/reach.md) |
| Why Arkiv | the Postgres comparison above | [arkiv/why-arkiv.md](../arkiv/why-arkiv.md) |
| How you use Arkiv | 4 entity types (`finding`, `asset`, `blob`, `mission`), two owning wallets, expiry, mirror fallback; measured against 0G Storage (batch write 7 s vs 76 s, read 0.36 s vs 2.8 s) | [arkiv/schema.md](../arkiv/schema.md), [arkiv/benchmark.md](../arkiv/benchmark.md) |

Required items: testnet integration (Rabdi, chain 7794095), wallet addresses and a sample query (README, Arkiv section), `schema.md`, `friction.md`. License: MIT ([LICENSE](../LICENSE)).

Possible add-on: **Arkiv + Swarm bonus ($500)**, storing the encrypted camera crops on Swarm and pointing to them from `blackbox.finding`. Not built.
