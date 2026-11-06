# Problem statement

**Nobody can check an AI inspection robot's decision, and nobody can ask questions of the record.**

Blackbox fixes both. 0G makes each decision checkable. Arkiv makes the record searchable.

## The problem, in two halves

AI robots now make calls that move money and risk: this cell is cracked, that mark is paint, this deck square needs a structural engineer. Two things are broken about how those calls are recorded.

**1. The record is unverifiable.** The only account of what the robot saw and decided sits in the operator's database. The operator has the most reason to edit it, and everyone else (asset owner, insurer, module maker, regulator) has to take it at its word. Even a signed log leaves three questions open: *which model made the call, was the answer made for this checkpoint, and did the robot act only on it?*

**2. The record can't be questioned.** Even an honest, signed record is a pile of files filed under mission ids and hashes. The questions people actually have are about the assets: *what is module r2m13's history? which modules are still cracked? do cracks cluster in one maker's batch?* (that last one is a warranty claim). Answering them today means asking the operator to run a report from their own database, which brings back problem 1.

Each half alone is half a solution. A verifiable record nobody can query does not get used. A queryable record nobody can verify is just another database.

## The solution, mapped to the problem

| Half | Fix | What it is |
|---|---|---|
| Unverifiable | **0G** | The robot moves only on an answer from 0G's sealed vision model, signed by an allowlisted TEE signer and echoing the robot's own nonce. Each decision is robot-signed, keccak256-chained, stored on 0G Storage, and the chain head is anchored on 0G Chain. |
| Can't be questioned | **Arkiv** | Each decision is also an Arkiv entity, queryable by asset, label, severity, mission and the panel's maker, model and batch from the site owner's asset register. The owner's wallet owns the register; the inspector's wallet owns the findings. |
| Glue | **The verifier** | It re-checks everything from 0G Chain and 0G Storage. If 0G Storage can't serve a blob, it reads the Arkiv mirror and runs the same hash checks against the anchors on 0G Chain. **Arkiv makes it searchable; 0G decides whether it's true.** |

**What is a TEE?** A *trusted execution environment*: a sealed enclave on the hardware (here Intel TDX) where 0G's vision model runs. Not even the machine's owner can look inside or change its answer. When the model answers, the enclave signs the answer with its own key, and 0G's InferenceServing contract lists which keys are real TEE signers.

The design rule that keeps this honest: Arkiv is never trusted for the verdict. A finding on Arkiv points at a robot-signed entry and its 0G Storage root; the verifier checks the entry, not the finding. If Arkiv is down, every 0G check still passes without it.

## Example 1: the crack that "wasn't there" (solar farm)

*Illustrative scenario, played out with the demo's own flow.*

An O&M contractor's drone surveys four rows of modules overnight. Its detector flags two marks on row 2. One is a cracked cell, the other is bird dirt. Months later a string underperforms. The report says row 2 was clean.

**Today.** Four parties each want a different answer, and all get the contractor's database. The owner asks "did it inspect module 13?", the insurer asks "what did it decide and when?", the maker asks "when did the crack appear, and is it my batch?", the contractor asks "how do I prove I flagged it?".

**With Blackbox.**

- The owner opens module r2m13's history, read straight from Arkiv: *Cracked cell, severity 2, send the repair crew*, the date, the mission, and the signed entry number.
- The verifier follows that entry: signed by the robot key, the answer signed by an allowlisted 0G TEE signer, the nonce echoed, the chain head anchored on 0G Chain at a block time.
- The maker runs one query: cracked cells by batch. If they cluster in `HX-450 / 2024-B`, that's a warranty conversation backed by records nobody had to take on trust.

The contractor can defend the record, and the owner can check it, from the same data.

## Example 2: one square metre of a bridge deck

*Illustrative scenario.*

Square `x12y03` (12 m along, 3 m across) is part of span 2, pour `2019-04` in the owner's register. Each survey adds a finding for it on Arkiv. A structural engineer pulls the square's history across surveys and sees when the crack first appeared and how its severity changed. A survey cut short by a lost link and resumed later still forms one chain of custody: the resumed mission names its parent's closing head, and the verifier checks it on 0G Chain.

## Example 3: 0G Storage is down during an audit

The insurer verifies a mission while 0G Storage's gateway is unreachable. The verifier reads the manifest and every log entry from the Arkiv mirror, keyed by the same 0G roots, and runs every check on those bytes against the anchors on 0G Chain. The report passes and says plainly "5 of 5 blobs came from the Arkiv mirror". If the mirror had a single byte changed, the hash checks would fail and name the entry.

## Proofs

Every claim here has either a test or a demo beat that you can run. Nothing below depends on our server being honest.

| Claim | How to see it | Where |
|---|---|---|
| The robot refuses a forged "continue" | *Forge a decision*: "signer 0x… is not on the manifest allowlist" | `robot/blackbox_robot/interlock.py` |
| A real signature cannot be paired with a flipped answer | *Flip 0G's answer*: "TEE signature does not cover this answer" | `core/src/lib/interlock.ts`, `core/test/crosslang.test.ts` |
| Editing the log is caught and the entry named | *Edit the log*: "Entry #2 (decision) was changed after the robot signed it" | `core/src/verifier/core.ts` |
| 0G's answer is what moved the robot | *Replay without 0G*: same seed, forced "continue", a second drone flies past the defect | `robot/blackbox_robot/replay.py` |
| No answer means no action | *Cut 0G*: "0G unreachable, no decision made", then a safe stop | `robot/blackbox_robot/adapter.py` |
| A cut mission resumes with one chain of custody | *Resume survey*; the verifier checks the parent head on 0G Chain | `robot/tests/test_sdk.py::test_resume_from_safe_stop` |
| Every asset maps to one register entry | `npm --prefix core test` | `core/test/arkiv.test.ts` |
| Blobs served by the Arkiv mirror are reported, never hidden | same | `core/test/arkiv.test.ts` |
| Crops on 0G Storage are ciphertext, the mission key opens them | same | `core/test/privacy.test.ts` |
| The same code runs a second task | `bridge-deck` and `solar-farm` are two profiles | `scenarios/*.json`, `robot/tests/test_sdk.py` |

Run the whole suite with `npm test` (contracts, robot, core). The measured 0G Storage vs Arkiv comparison is in `arkiv/benchmark.md` (`npm run arkiv:bench`).

## Why the relevance grows

- **Mandates are coming.** Flight recorders exist because aviation required them, not because airlines wanted them. The EU AI Act's record-keeping duty for high-risk AI (Article 12) points the same direction for AI that runs infrastructure.
- **Assets outlast missions.** A solar module or a deck square lives for decades. Missions, operators, vendors and models change. A record keyed by the asset, queryable by anyone, is the one thing that stays useful across all of them.
- **The record can have consequences.** Once a record verifies by itself, a payment, a warranty claim or a repair ticket can release on it without a person vouching for the operator.
- **It is an SDK.** A mission profile sets the world, the labels, the actions, how assets are labelled and the asset register. A pipeline, a power line or a warehouse robot is a new JSON file and a `Robot` class.

## The SDK: one recorder, any robot

Solar panels and bridge decks are two demos of one idea: **any robot whose AI makes a consequential call can have its decisions made checkable and searchable.** Nothing in the recorder is specific to either.

| You provide | Blackbox provides |
|---|---|
| A mission profile, `scenarios/<task>.json`: the world, the labels the model may answer, the actions the robot may take, the prompt, how assets are labelled, the asset register | The sealed 0G call, the TEE-signature interlock, the signed hash-chained log, 0G Storage and Chain anchoring, safe stop, resume, replay |
| A `Robot` class with `step`, `resolve` and `emergency_stop` | A public verifier, queryable findings and analytics on Arkiv, privacy (encrypted crops), the 3D console |

The profile goes into the manifest on 0G Storage, and the interlock refuses any label or action it does not list. A new task cannot widen what the robot is allowed to do beyond what was signed into the record.

**Proof that it generalizes.** `solar-farm` and `bridge-deck` already run on the same code with different worlds, labels (*cracked cell / soiling* vs *crack / decoy*), actions, severity bounds and registers (by row vs by span). `robot/tests/test_sdk.py` checks that a label valid under one profile is refused under another, and that a profile cannot grant an action the robot lacks. A real rover driver (Pi + camera) plugs into the same API.

**Where the same pattern applies.** The shape is always *a robot holds, an AI classifies, an action follows, and someone else later needs proof*. These are plausible profiles, not shipped ones:

| Task | Asset | The decision | Who needs the proof |
|---|---|---|---|
| Pipeline or tank inspection | weld 114 on pipeline 7 | corrosion: monitor / shut valve | regulator, insurer |
| Power-line and tower inspection | span 22 on line 9 | vegetation or damaged insulator: ticket / de-energize | utility, safety board |
| Wind turbine blades | turbine 14, blade B | leading-edge erosion: repair window | owner, warranty provider |
| Warehouse or hospital robots | shelf A4, site 2 | pick / quarantine a flagged item | auditor, customer |
| Agricultural spraying | plot 31 | spray / skip, with a quantity | certifier, buyer |

Each is a JSON profile, a prompt and a `Robot` class, not a new system.

**The impact.**

- **For operators**, a record that holds up under dispute, and so a contract they can win on: "here is the proof we flagged it".
- **For asset owners, makers and insurers**, one query returns an asset's full history, or defects by maker and batch, across vendors, models and years. Inspections can be priced and claims settled against a record nobody had to take on trust.
- **For regulators**, a way to meet record-keeping duties (EU AI Act Article 12 for high-risk AI) without asking every vendor for a private export.
- **For the AI industry**, a cheap default: a robot that cannot act without a signed answer, and fails closed when it cannot get one. That turns "we log it" into "it can only have happened this way".

The claim is not that Blackbox solves robot safety. It is that the missing piece in many deployments is *a record the other side can check and question*, and that this piece can be built once, as an SDK, rather than rebuilt per robot.

## What we claim, and what we don't

We say the robot acts only on answers signed by an allowlisted 0G TEE signer, each answer was produced for its request, the record is tamper-evident, and the verifier re-checks anything read from Arkiv against 0G Chain.

We don't say 0G controls the robot, that the record is tamper-proof, that it proves what the camera saw, or that Arkiv proves anything on its own.

## Status, honestly

- Everything runs offline on mock 0G (`npm run dev:local`), and the console labels it. Arkiv needs network and a funded Rabdi wallet (`ARKIV=rabdi`).
- Real 0G Router calls wait on a funded wallet. The first check is `npm run probe -- --scenario solar-farm`.
- The Arkiv reads were run against Rabdi; the first funded write run fills in the wallet addresses and `arkiv/benchmark.md`.
- The three examples above are illustrative scenarios, not recorded incidents.
