# Blackbox: the narrative

**0G decides. Blackbox proves it.**

## One line

A flight recorder for AI inspection robots: the drone moves only on decisions signed by 0G's sealed model, every decision is filed on 0G and made searchable on Arkiv, and anyone can check the record without trusting the operator.

## The problem

Drones already inspect solar farms, bridges, pipelines and power lines, and AI already decides what they see: this cell is cracked, that mark is paint. Those calls move money and risk. A missed crack becomes a fire, a failed bridge joint, a denied insurance claim.

Today the only record of what the drone saw and decided sits in the operator's own database. The asset owner, the insurer, the module maker and the regulator all have to take it at its word, and the operator is the party with the most reason to edit it.

## The idea

Make the record something nobody in the deal can quietly rewrite, and make it readable by the people who use the asset.

1. **0G decides.** At every checkpoint the drone holds and sends its camera crop to 0G's own vision model running sealed in a TEE. It moves only if the answer is signed by an allowlisted 0G TEE signer and echoes its own nonce. Anything else is refused and logged.
2. **0G proves.** Every decision is robot-signed, hash-chained and stored on 0G Storage. The chain head is anchored on 0G Chain every two decisions. The flight replays from its seed to the same trajectory hash.
3. **Arkiv makes it searchable.** Every decision is also a row on Arkiv: query a module's history, the open defects, or cracks by maker and batch from the owner's asset register. The owner's wallet owns the register; the inspector's wallet owns the findings.
4. **Anyone checks it.** Scan a QR code: the public verifier re-checks everything from 0G Chain and 0G Storage in the browser. If 0G Storage can't serve a blob, it reads the Arkiv mirror and runs the same checks against 0G Chain. Arkiv makes it searchable; 0G decides whether it's true.

## The demo, in three steps

**Mark the site → Fly the survey → Prove it.** Same flow for a solar farm (cracked cell vs soiling) and a bridge deck (crack vs paint or cable). Details: [demo-script.md](demo-script.md).

Then try to break it: forge a decision (refused), flip 0G's answer (refused), edit the log (the verifier names the entry), cut 0G (the drone flies home: "0G unreachable, no decision made").

## Field reality: disconnects happen

Robots in the field lose connectivity. Blackbox never fakes a decision to keep going. It safe-stops, flies home, and signs where it stopped into the last log entry. When 0G is back, **Resume** starts a new mission from that exact point with the same seed and marks, and asks 0G again only about what was never decided. The new mission's manifest names the parent's closing chain head, and the verifier checks the link on 0G Chain. Two missions, one unbroken chain of custody.

## Privacy

Public verifiability without publishing the weak points of critical infrastructure. The camera crop is seen only inside 0G's enclave, and it is stored on 0G encrypted with a per-mission key the operator hands to an auditor. What stays public is what proves the decision: hashes, answers, signatures, anchors. Findings on Arkiv carry labels and assets, never crops, and expire after the working period. Full table: [privacy.md](privacy.md).

## Why 0G, why Arkiv, why a chain

- **0G** gives the three things the loop needs in one network: sealed inference with a signature the robot can check before it moves, storage for evidence, and a chain for commitments. All three are inside the control loop, not bolted on for logging. [why-0g.md](why-0g.md)
- **Arkiv** turns the record into something people can question: indexed attributes for per-asset history and analytics, wallet ownership so the owner's register and the inspector's findings stay separate, and expiration so the working set stays bounded while 0G keeps the proof forever. [arkiv/why-arkiv.md](../arkiv/why-arkiv.md)
- **A chain**, because the parties don't trust each other and the one running the robot has the most reason to edit the record. Flight recorders spread by mandate, and the EU AI Act's record-keeping duty for high-risk AI (Article 12) points the same way.

## Who pays

Whoever requires it: an asset owner writing it into an O&M contract, an insurer pricing inspections that come with a verifiable record, a regulator. Later, a payment can release on its own when an inspection's record verifies.

## It is an SDK

Nothing is about solar panels. A mission profile (`scenarios/*.json`) sets the world, the labels 0G may answer, the actions the robot may take, and the asset register. Any robot that implements a small `Robot` interface (`step`, `resolve`, `emergency_stop`) runs under the same recorder.

## What we claim, and what we don't

We say the robot only acts on answers signed by an allowlisted 0G TEE signer, each answer was produced for its request, the record is tamper-evident, and anything read from Arkiv is re-checked against 0G Chain. We don't say 0G controls the robot, the record is tamper-proof, it proves what the camera saw, or Arkiv proves anything on its own.
