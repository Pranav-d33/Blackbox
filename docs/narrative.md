# Blackbox: the narrative

**0G decides. Blackbox proves it.**

## One line

A flight recorder for AI inspection robots: the drone moves only on decisions signed by 0G's sealed model, every decision is filed on 0G under the ENS name of the thing it inspected, and anyone can check the record without trusting the operator.

## The problem

Drones already inspect solar farms, bridges, pipelines and power lines, and AI already decides what they see: this cell is cracked, that mark is paint. Those calls move money and risk. A missed crack becomes a fire, a failed bridge joint, a denied insurance claim.

Today the only record of what the drone saw and decided sits in the operator's own database. The asset owner, the insurer, the module maker and the regulator all have to take it at its word, and the operator is the party with the most reason to edit it.

## The idea

Make the record something nobody in the deal can quietly rewrite, and make it readable by the people who use the asset.

1. **0G decides.** At every checkpoint the drone holds and sends its camera crop to 0G's own vision model running sealed in a TEE. It moves only if the answer is signed by an allowlisted 0G TEE signer and echoes its own nonce. Anything else is refused and logged.
2. **0G proves.** Every decision is robot-signed, hash-chained and stored on 0G Storage. The chain head is anchored on 0G Chain every two decisions. The flight replays from its seed to the same trajectory hash.
3. **ENS names it.** Every module on the farm and every square metre of the bridge has an ENS name. After the flight, `r2m13.solar.<site>.eth` says *Cracked cell, severity 2. Send the repair crew*, and points at the signed entry that says so. The drone and the 0G signer have names too.
4. **Anyone checks it.** Scan a QR code or type a panel's name. The public verifier resolves it through ENS, then re-checks everything from 0G Chain and 0G Storage in the browser. ENS is the address book, the chain is the proof, and the verifier checks they agree.

## The demo, in three steps

**Mark the site → Fly the survey → Prove it.** Same flow for a solar farm (cracked cell vs soiling) and a bridge deck (crack vs paint or cable). Details: [demo-script.md](demo-script.md).

Then try to break it: forge a decision (refused), flip 0G's answer (refused), edit the log (the verifier names the entry), cut 0G (the drone flies home: "0G unreachable, no decision made").

## Field reality: disconnects happen

Robots in the field lose connectivity. Blackbox never fakes a decision to keep going. It safe-stops, flies home, and signs where it stopped into the last log entry. When 0G is back, **Resume** starts a new mission from that exact point with the same seed and marks, and asks 0G again only about what was never decided. The new mission's manifest names the parent's closing chain head, and the verifier checks the link on 0G Chain. Two missions, one unbroken chain of custody.

## Privacy

Public verifiability without publishing the weak points of critical infrastructure. The camera crop is seen only inside 0G's enclave, and it is stored on 0G encrypted with a per-mission key the operator hands to an auditor. What stays public is what proves the decision: hashes, answers, signatures, anchors. ENS can carry the readable finding or only a pointer. Full table: [privacy.md](privacy.md).

## Why 0G, why ENS, why a chain

- **0G** gives the three things the loop needs in one network: sealed inference with a signature the robot can check before it moves, storage for evidence, and a chain for commitments. All three are inside the control loop, not bolted on for logging. [why-0g.md](why-0g.md)
- **ENS (v2)** gives every asset and agent a name a crew, an owner or an insurer can type. Subnames are records on one Permissioned Resolver under wildcard resolution, so ten thousand panels cost nothing until they are inspected, and resolution goes through the Universal Resolver like any ENS app.
- **A chain**, because the parties don't trust each other and the one running the robot has the most reason to edit the record. Flight recorders spread by mandate, and the EU AI Act's record-keeping duty for high-risk AI (Article 12) points the same way.

## Who pays

Whoever requires it: an asset owner writing it into an O&M contract, an insurer pricing inspections that come with a verifiable record, a regulator. Later, a payment can release on its own when an inspection's record verifies.

## It is an SDK

Nothing is about solar panels. A mission profile (`scenarios/*.json`) sets the world, the labels 0G may answer, the actions the robot may take, and how assets are named on ENS. Any robot that implements a small `Robot` interface (`step`, `resolve`, `emergency_stop`) runs under the same recorder.

## What we claim, and what we don't

We say the robot only acts on answers signed by an allowlisted 0G TEE signer, each answer was produced for its request, the record is tamper-evident, and ENS agrees with the signed log or the verifier says so. We don't say 0G controls the robot, the record is tamper-proof, it proves what the camera saw, or ENS proves anything on its own.
