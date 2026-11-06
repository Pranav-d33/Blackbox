# Pitch script: problem, proof, SDK

About 3:00 spoken, around 420 words of narration. Read it aloud once with a timer. Cut from the "Say" column, never from the "Show" column. The beat-by-beat demo flow is in [demo-script.md](demo-script.md); this script is the story around it.

Two rules. Say every ENS name out loud as a name, never a hash. When a line says **(proof)**, the screen must show the thing, not just you saying it.

---

## 0:00 – 0:25 · The morning after

**Show:** the launch page, then the 3D farm. Hover module 13 in row 2: `r2m13.solar.blackbox-demo.eth`.

**Say:**
"A drone flew this solar farm overnight. It flagged a mark on a module in row two, and an AI called it. Months later a string underperforms, and the report says row two was clean. Four people now need to know what that drone decided: the owner, the insurer, the module maker, and the contractor who has to defend itself. All four get the same thing, the contractor's own database. And the contractor is the one person who can edit it."

## 0:25 – 0:50 · Two problems, not one

**Show:** a split title card, left "Can't verify", right "Can't find".

**Say:**
"That is two problems. One: you can't *verify* the decision. Which model made it, was the answer made for this checkpoint, did the robot actually act on it? A signed log doesn't answer those. Two: you can't *find* it. Even an honest record is filed under a mission id. Nobody standing at panel thirteen can ask what the drone decided about *this panel*. Fix one without the other and you get a record nobody uses, or a nicer database."

## 0:50 – 1:20 · Fix 1: 0G makes it checkable

**Show:** console. Place a **Cracked cell** in row 2 and a **Soiling** patch in row 3, press **Fly the survey**. Let the live card run: hold, ask 0G, answer, interlock, act.

**Say:**
"At each mark the drone holds still and sends the crop to 0G's own vision model, running sealed in a hardware enclave. The answer comes back signed by that enclave. The drone moves only if the signature is from a signer on its allowlist, and the answer echoes the drone's own nonce. It descends on the crack. It leaves the soiling. That decision goes into a signed, chained log on 0G Storage, and the chain head is anchored on 0G Chain."

**(proof)** The card shows `request_id`, TEE signer ✔, nonce binding, and the 0G Storage root.

## 1:20 – 1:45 · Fix 2: ENS makes it findable

**Show:** right panel. `r2m13.solar…` reads *Cracked cell, severity 2. Send the repair crew · on ENS ✓*. Click it to open the record sheet. Then show `drone`, `0g-tee` and `registry` names.

**Say:**
"Now the finding lives under the module's own ENS name. A repair crew types `r2m13.solar.blackbox-demo.eth` and reads the call, with a pointer to the signed entry. The robot has a name too, `drone`. And `0g-tee` is the name of the enclave's signing key, so 'who vouches for this answer' is a name anyone can read, not a hex address."

## 1:45 – 2:25 · Proof: try to break it

**Show:** **Try to break it** bar, one attack per sentence, red result each time.

**Say:**
"Don't take my word. Forge a 'continue' with the operator's key: refused, signer not on the allowlist. Flip 0G's real answer but keep its real signature: refused, the signature doesn't cover that answer. Lower a severity in the log: the verifier turns red and names entry two. Cut 0G mid-flight: the drone flies home and the log says 'no decision made.' It never guesses."

**(proof)** Four red results on screen, with the exact refusal messages. Then **Replay without 0G**: the red drone flies past the crack. "0G's answer is what moved the robot."

## 2:25 – 2:40 · Proof: the check needs nobody's trust

**Show:** phone QR, or type `r2m13.solar.blackbox-demo.eth` into the public verifier. Checks go green. Then, if you have time, point at the ENS-versus-log check.

**Say:**
"Type the panel's name. The verifier resolves it through ENS, then re-checks everything from 0G Chain and Storage, in the browser, and checks that ENS agrees with the signed log. If ENS ever says something the log doesn't, it fails, and we have a test for exactly that. ENS is the address book. The chain is the proof."

## 2:40 – 3:00 · The SDK: it isn't about panels

**Show:** switch the top bar to **Bridge deck**; hover a square: `x12y03.bridge…`. Then show `scenarios/solar-farm.json` next to `scenarios/bridge-deck.json`.

**Say:**
"Nothing here is about solar panels. A mission profile, one JSON file, sets what the model may answer, what the robot may do, and how assets are named. Solar and bridge are two files on the same code. A pipeline weld, a power-line span, a turbine blade: another file and a small robot class. Operators get a record that holds up in a dispute. Owners and insurers get one lookup by the asset's name, across years and vendors. And because the record verifies on its own, payments and repair orders can release on it. Flight recorders spread because they were required. This is that, for AI that acts."

---

## The one example to memorize

The row-two crack. Every audience gets it in ten seconds: *report says clean, drone says cracked, who is right?* Open with it, return to it at the verifier, and end the SDK beat by asking the same question about a pipeline weld.

## Questions you will be asked

**Why not just a signed log in a database?** A signed log catches edits. It doesn't tell you which model answered, that the answer was made for this checkpoint, or that the robot only did what the answer said. The TEE signature, the nonce and the interlock add those. The chain adds a time nobody can move.

**What is ENS doing that a database lookup can't?** It gives a name that outlives missions, operators and vendors, resolved the same way by every ENS app. Ten thousand panels cost nothing until inspected, because they are records under wildcard resolution on one resolver, not a token each. And it's never trusted: the verifier checks it against the log.

**Is 0G controlling the robot?** No. The robot acts only on answers signed by an allowlisted TEE signer. If there is no valid answer it safe-stops. The robot decides to act, never 0G.

**Is this running on real 0G?** Say it plainly: offline it runs on mock 0G and a dev ENS, and the console labels both. Real 0G and Sepolia ENS runs are listed in the README under "Not yet verified against live 0G". Update this line before you present if that has changed.

**What is a TEE?** A sealed enclave in the hardware that runs the model. Not even the machine's owner can see inside or change an answer. It signs what it answers.

**Why would an operator install something that can be used against them?** They won't volunteer. The buyer is whoever requires it: an owner in the O&M contract, an insurer pricing inspections, a regulator. Aircraft flight recorders spread by mandate, and the EU AI Act's record-keeping duty for high-risk AI (Article 12) points the same way.

## Say / don't say

Say: "the robot only acts on answers signed by an allowlisted 0G TEE signer", "tamper-evident", "ENS is the address book, the chain is the proof."

Don't say: "0G controls the robot", "tamper-proof", "proves what the camera saw", "ENS proves the decision." With the mock running, say "mock 0G". With `ENS=local`, say "dev ENS".
