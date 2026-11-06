# Problem statement

**Nobody can check an AI inspection robot's decision, and nobody can find it by the name of the thing it inspected.**

Blackbox fixes both. 0G makes the decision checkable. ENS makes it findable.

## The problem, in two halves

AI robots now make calls that move money and risk: this cell is cracked, that mark is paint, this deck square needs a structural engineer. Two things are broken about how those calls are recorded.

**1. The record is unverifiable.** The only account of what the robot saw and decided sits in the operator's database. The operator has the most reason to edit it, and everyone else (asset owner, insurer, module maker, regulator) has to take it at its word. Even a signed log leaves three questions open: *which model made the call, was the answer made for this checkpoint, and did the robot act only on it?*

**2. The record is unaddressable.** Even an honest record is filed under a mission id and a hex hash. The crew standing in front of panel R2-M13 cannot ask "what did the drone decide about *this panel*?" An insurer cannot look up a claim by the asset. A regulator cannot follow one bridge square across years of surveys. The thing people care about (the asset) has no name in the record, and the record has no home under the asset.

Each half alone is half a solution. A verifiable record nobody can find does not get used. A findable record nobody can verify is a nicer-looking database.

## The solution, mapped to the problem

| Half | Fix | What it is |
|---|---|---|
| Unverifiable | **0G** | The robot moves only on an answer from 0G's sealed vision model, signed by an allowlisted TEE signer and echoing the robot's own nonce. Each decision is robot-signed, keccak256-chained, stored on 0G Storage, and the chain head is anchored on 0G Chain. |
| Unaddressable | **ENS (v2)** | Every asset has a name: `r2m13.solar.<site>.eth`, `x12y03.bridge.<site>.eth`. The agents do too: `drone.<site>.eth`, `0g-tee.<site>.eth`, `registry.<site>.eth`. Inspecting an asset writes its finding and a pointer to the signed entry into that name's records. |
| Glue | **The verifier** | It resolves the name through the ENSv2 Universal Resolver, then re-checks everything from 0G Chain and 0G Storage, then checks the two agree. **ENS is the address book, the chain is the proof.** |

**What is `0g-tee`?** TEE means *trusted execution environment*: a sealed enclave on the hardware (here Intel TDX) where 0G's vision model runs. Not even the machine's owner can look inside or change its answer. When the model answers, the enclave signs the answer with its own key. `0g-tee.<site>.eth` is the ENS name of that key, so "who vouches for this answer?" resolves to a name anyone can read, instead of a bare `0x…` address. Likewise `drone.<site>.eth` is the robot's signing key and `registry.<site>.eth` is the contract that anchors its logs.

The design rule that makes this honest: ENS is never trusted. If an ENS record says something the signed log does not, the verifier says so. If ENS is down, the log and chain checks still pass without it.

## Example 1: the crack that "wasn't there" (solar farm)

*Illustrative scenario, played out with the demo's own flow.*

An O&M contractor's drone surveys four rows of modules overnight. Its detector flags two marks on row 2. One is a cracked cell, the other is bird dirt. Months later a string underperforms. The report says row 2 was clean.

**Today.** Four parties each want a different answer, and all get the contractor's database. The owner asks "did it inspect module 13?", the insurer asks "what did it decide and when?", the maker asks "when did the crack appear?", the contractor asks "how do I prove I flagged it?". Nobody can verify anything and the contractor can't defend itself.

**With Blackbox.** Anyone types `r2m13.solar.<site>.eth`.

- ENS answers in the module's own name: *Cracked cell, severity 2. Send the repair crew*, plus the mission and the signed entry number.
- The verifier follows that pointer and shows the entry was signed by the robot key that `drone.<site>.eth` resolves to, that the answer was signed by the TEE signer `0g-tee.<site>.eth` resolves to, that the answer echoes the robot's nonce, and that the chain head containing it was anchored on 0G Chain at a block time.
- The soiled patch next to it reads *Soiling, leave for cleaning*. Same proof.

The contractor can now defend the record and the owner can now check it, with the same link.

## Example 2: one square metre of a bridge deck

*Illustrative scenario.*

The deck is addressed as `x12y03.bridge.<site>.eth` (12 m along, 3 m across). Each survey writes that name's records again. A structural engineer asks about one square and gets its latest finding. The mission pointer takes them to every survey that touched it. The resumed-mission chain (parent head named in the child manifest, checked on 0G Chain) means a survey that was cut short by a lost link still forms one unbroken chain of custody.

Ten thousand squares or panels cost nothing until they are inspected, because they are records on one Permissioned Resolver under wildcard resolution, not a token each.

## Example 3: the audit of the audit

The verifier checks the agents too. In one pass it confirms:

- `drone.<site>.eth` resolves to the robot key that actually signed the log.
- `0g-tee.<site>.eth` resolves to the TEE signer that actually signed the answers.
- The `drone` name token in the ENSv2 registry is held by the robot key itself (`registry.droneOwner` in `core/src/verifier/core.ts`), so a swapped name is caught.
- `registry.<site>.eth` carries the `BlackboxRegistry` address for chain 16602 (ENSIP-11).

So the question "who is this robot, and who vouches for its answers?" also has a typeable answer.

## Proofs

Every claim here has either a test or a demo beat that you can run. Nothing below depends on our server being honest.

| Claim | How to see it | Where |
|---|---|---|
| The robot refuses a forged "continue" | Beat 3a, *Forge "continue"*: "signer 0x… is not on the manifest allowlist" | `robot/blackbox_robot/interlock.py` |
| A real signature cannot be paired with a flipped answer | Beat 3b, *Tamper answer*: "TEE signature does not cover this answer" | `core/src/lib/interlock.ts`, `core/test/crosslang.test.ts` |
| Editing the log is caught and the entry named | Beat 3c, *Edit log*: "Entry #2 (decision) was changed after the robot signed it" | `core/src/verifier/core.ts` |
| 0G's answer is what moved the robot | Beat 2, split screen: same seed, forced "continue", a second drone flies past the defect | `robot/blackbox_robot/replay.py` |
| No answer means no action | Beat 4, *Cut 0G link*: "0G unreachable, no decision made", then a safe stop | `robot/blackbox_robot/adapter.py` |
| A cut mission resumes with one chain of custody | Beat 4b, *Resume*; the verifier checks the parent head on 0G Chain | `robot/tests/test_sdk.py::test_resume_from_safe_stop` |
| ENS names follow `<asset>.<zone>.<parent>` | `npm --prefix core test` | `core/test/ens.test.ts` |
| A record that matches the signed log passes | same | `core/test/ens.test.ts` |
| **An ENS finding the log does not contain fails** | same: the verifier reports it instead of trusting ENS | `core/test/ens.test.ts` |
| A record rewritten by a later mission is not a false alarm | same | `core/test/ens.test.ts` |
| The ENS resolver and name registry behave like ENSv2 | `forge test` | `contracts/test/DevEnsV2.t.sol` |
| The same code runs a second task | `bridge-deck` and `solar-farm` are two profiles | `scenarios/*.json`, `robot/tests/test_sdk.py` |

Run the whole suite with `npm test` (contracts, robot, core).

## Why the relevance grows

- **Mandates are coming.** Flight recorders exist because aviation required them, not because airlines wanted them. The EU AI Act's record-keeping duty for high-risk AI (Article 12) points the same direction for AI that runs infrastructure.
- **Named assets outlast missions.** A solar module or a deck square lives for decades. Missions, operators, vendors and models change. A name under the asset is the one stable key across all of them.
- **The record can have consequences.** Once a record verifies by itself, a payment, a warranty claim or a repair ticket can release on it without a person vouching for the operator.
- **It is an SDK.** A mission profile sets the world, the labels, the actions and the ENS zone. A pipeline, a power line or a warehouse robot is a new JSON file and a `Robot` class.

## The SDK: one recorder, any robot

Solar panels and bridge decks are two demos of one idea: **any robot whose AI makes a consequential call can have its decisions made checkable and findable.** Nothing in the recorder is specific to either.

**What you write, and what you get for free**

| You provide | Blackbox provides |
|---|---|
| A mission profile, `scenarios/<task>.json`: the world, the labels the model may answer, the actions the robot may take, the prompt, the ENS zone and how assets are named | The sealed 0G call, the TEE-signature interlock, the signed hash-chained log, 0G Storage and Chain anchoring, safe stop, resume, replay |
| A `Robot` class with `step`, `resolve` and `emergency_stop` | A public verifier, ENS names for every asset and agent, privacy (encrypted crops), the 3D console |

The profile goes into the manifest on 0G Storage, and the interlock refuses any label or action it does not list. A new task cannot widen what the robot is allowed to do beyond what was signed into the record.

**Proof that it generalizes.** `solar-farm` and `bridge-deck` already run on the same code with different worlds, labels (*cracked cell / soiling* vs *crack / decoy*), actions, severity bounds and ENS zones (`solar`, `bridge`). `robot/tests/test_sdk.py` checks that a label valid under one profile is refused under another, and that a profile cannot grant an action the robot lacks. A real rover driver (Pi + camera) plugs into the same API.

**Where the same pattern applies.** The shape is always *a robot holds, an AI classifies, an action follows, and someone else later needs proof*. These are plausible profiles, not shipped ones:

| Task | Asset name | The decision | Who needs the proof |
|---|---|---|---|
| Pipeline or tank inspection | `weld-114.pipeline-7.<op>.eth` | corrosion: monitor / shut valve | regulator, insurer |
| Power-line and tower inspection | `span-22.line-9.<op>.eth` | vegetation or damaged insulator: ticket / de-energize | utility, safety board |
| Wind turbine blades | `t14-blade-b.windfarm.<op>.eth` | leading-edge erosion: repair window | owner, warranty provider |
| Warehouse or hospital robots | `shelf-a4.dc-2.<op>.eth` | pick / quarantine a flagged item | auditor, customer |
| Agricultural spraying | `plot-31.farm.<op>.eth` | spray / skip, with a quantity | certifier, buyer |

Each is a JSON profile, a prompt and a `Robot` class, not a new system.

**The impact.**

- **For operators**, a record that holds up under dispute, and so a contract they can win on: "here is the proof we flagged it".
- **For asset owners and insurers**, one lookup by the asset's name returns the full history across vendors, models and years. Inspections can be priced and claims settled against a record nobody had to take on trust.
- **For regulators**, a way to meet record-keeping duties (EU AI Act Article 12 for high-risk AI) without asking every vendor for a private export.
- **For the AI industry**, a cheap default: a robot that cannot act without a signed answer, and fails closed when it cannot get one. That turns "we log it" into "it can only have happened this way".
- **For what comes next**, because the record verifies on its own, payments, warranty claims and repair orders can release on it automatically.

The claim is not that Blackbox solves robot safety. It is that the missing piece in many deployments is *a record the other side can check*, and that this piece can be built once, as an SDK, rather than rebuilt per robot.

## What we claim, and what we don't

We say the robot acts only on answers signed by an allowlisted 0G TEE signer, each answer was produced for its request, the record is tamper-evident, and ENS agrees with the signed log or the verifier says so.

We don't say 0G controls the robot, that the record is tamper-proof, that it proves what the camera saw, or that ENS proves anything on its own.

## Status, honestly

- Everything runs offline on mock 0G and a dev ENS on anvil (`npm run dev:local`). The console labels both.
- Real 0G Router calls wait on a funded wallet. The first check is `npm run probe -- --scenario solar-farm`.
- The ENS reader was checked against ENS's own ENSv2 readiness names on mainnet. A full Sepolia run with a registered parent name is not done yet, and the README says so.
- The two examples above are illustrative scenarios, not recorded incidents.
