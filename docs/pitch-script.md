# Pitch script: problem, proof, SDK

About 3:00 spoken, around 420 words of narration. Read it aloud once with a timer. Cut from the "Say" column, never from the "Show" column. The beat-by-beat demo flow is in [demo-script.md](demo-script.md); this script is the story around it.

Two rules. Say every asset as a place ("row two, module thirteen"), never a hash. When a line says **(proof)**, the screen must show the thing, not just you saying it.

---

## 0:00 – 0:25 · The morning after

**Show:** the launch page, then the 3D farm. Hover module 13 in row 2: the outline reads `r2m13`.

**Say:**
"A drone flew this solar farm overnight. It flagged a mark on a module in row two, and an AI called it. Months later a string underperforms, and the report says row two was clean. Four people now need to know what that drone decided: the owner, the insurer, the module maker, and the contractor who has to defend itself. All four get the same thing, the contractor's own database. And the contractor is the one person who can edit it."

## 0:25 – 0:50 · Two problems, not one

**Show:** a split title card, left "Can't verify", right "Can't ask".

**Say:**
"That is two problems. One: you can't *verify* the decision. Which model made it, was the answer made for this checkpoint, did the robot actually act on it? A signed log doesn't answer those. Two: you can't *ask* it anything. Even an honest record is a pile of files under mission ids. Nobody can ask for panel thirteen's history, or whether cracks cluster in one maker's batch, without going back to the contractor's database. Fix one without the other and you get a record nobody uses, or just another database."

## 0:50 – 1:20 · Fix 1: 0G makes it checkable

**Show:** console. Place a **Cracked cell** in row 2 and a **Soiling** patch in row 3, press **Fly the survey**. Let the live card run: hold, ask 0G, answer, interlock, act.

**Say:**
"At each mark the drone holds still and sends the crop to 0G's own vision model, running sealed in a hardware enclave. The answer comes back signed by that enclave. The drone moves only if the signature is from a signer on its allowlist, and the answer echoes the drone's own nonce. It descends on the crack. It leaves the soiling. That decision goes into a signed, chained log on 0G Storage, and the chain head is anchored on 0G Chain."

**(proof)** The card shows `request_id`, TEE signer ✔, nonce binding, and the 0G Storage root.

## 1:20 – 1:45 · Fix 2: Arkiv makes it searchable

**Show:** right panel, the `r2m13` card: *Cracked cell, severity 2. Send the repair crew*. Click **History**: the module's timeline and its register entry (Helion PV HX-450, batch 2024-B). Then **Analytics**: defects by maker and batch, with the Arkiv query printed underneath.

**Say:**
"Every decision is also a row on Arkiv, a queryable database next to 0G. Here is module thirteen's whole history, read from Arkiv in my browser, with its maker and batch from the owner's own register. And here's the site: open defects, and cracks by maker and batch. That last one is a warranty claim. The owner's wallet owns the register; the inspector's wallet owns the findings."

**(proof)** The Arkiv query string under each view; paste it into the explorer.

## 1:45 – 2:25 · Proof: try to break it

**Show:** **Try to break it** bar, one attack per sentence, red result each time.

**Say:**
"Don't take my word. Forge a 'continue' with the operator's key: refused, signer not on the allowlist. Flip 0G's real answer but keep its real signature: refused, the signature doesn't cover that answer. Lower a severity in the log: the verifier turns red and names entry two. Cut 0G mid-flight: the drone flies home and the log says 'no decision made.' It never guesses."

**(proof)** Four red results on screen, with the exact refusal messages. Then **Replay without 0G**: the red drone flies past the crack. "0G's answer is what moved the robot."

## 2:25 – 2:40 · Proof: the check needs nobody's trust

**Show:** phone QR into the public verifier. Checks go green. If you can, block 0G Storage's gateway first: the report still passes and says "N of N blobs came from the Arkiv mirror".

**Say:**
"Anyone can check this from a phone, against 0G Chain and 0G Storage, in the browser. And if 0G Storage is down, the verifier reads the Arkiv mirror instead and runs every hash check against the anchors on 0G Chain. A changed byte fails. Arkiv makes it searchable; 0G decides whether it's true."

## 2:40 – 3:00 · The SDK: it isn't about panels

**Show:** switch the top bar to **Bridge deck**; hover a square: `x12y03`. Then show `scenarios/solar-farm.json` next to `scenarios/bridge-deck.json`.

**Say:**
"Nothing here is about solar panels. A mission profile, one JSON file, sets what the model may answer, what the robot may do, and how assets are labelled and registered. Solar and bridge are two files on the same code. A pipeline weld, a power-line span, a turbine blade: another file and a small robot class. Operators get a record that holds up in a dispute. Owners, makers and insurers get one query per question, across years and vendors. And because the record verifies on its own, payments and repair orders can release on it. Flight recorders spread because they were required. This is that, for AI that acts."

---

## The one example to memorize

The row-two crack. Every audience gets it in ten seconds: *report says clean, drone says cracked, who is right?* Open with it, return to it at the verifier, and end the SDK beat by asking the same question about a pipeline weld.

## Questions you will be asked

**Why not just a signed log in a database?** A signed log catches edits. It doesn't tell you which model answered, that the answer was made for this checkpoint, or that the robot only did what the answer said. The TEE signature, the nonce and the interlock add those. The chain adds a time nobody can move.

**Why Arkiv, and not the operator's own database?** Because that database is run by the party the record exists to check. On Arkiv the owner's wallet owns the asset register and the inspector's wallet owns its findings, anyone can run the same query, and entities expire on a schedule instead of piling up. It's never trusted for the verdict: every finding points at a robot-signed entry that the verifier checks against 0G Chain.

**Is Arkiv cheaper than 0G?** They do different jobs, and both run on testnets here, so we compare latency, gas and what each can answer, not dollars: `arkiv/benchmark.md`. 0G Storage is the permanent archive; Arkiv is the working database and the backup.

**Is 0G controlling the robot?** No. The robot acts only on answers signed by an allowlisted TEE signer. If there is no valid answer it safe-stops. The robot decides to act, never 0G.

**Is this running on real 0G?** Say it plainly: offline it runs on mock 0G, and the console labels it. Arkiv runs on its Rabdi testnet. Real 0G runs are listed in the README under "Not yet verified against live 0G". Update this line before you present if that has changed.

**What is a TEE?** A sealed enclave in the hardware that runs the model. Not even the machine's owner can see inside or change an answer. It signs what it answers.

**Why would an operator install something that can be used against them?** They won't volunteer. The buyer is whoever requires it: an owner in the O&M contract, an insurer pricing inspections, a regulator. Aircraft flight recorders spread by mandate, and the EU AI Act's record-keeping duty for high-risk AI (Article 12) points the same way.

## Say / don't say

Say: "the robot only acts on answers signed by an allowlisted 0G TEE signer", "tamper-evident", "Arkiv makes it searchable, 0G decides whether it's true."

Don't say: "0G controls the robot", "tamper-proof", "proves what the camera saw", "Arkiv proves the decision", "Arkiv is cheaper" (unmeasured on mainnet). With the mock running, say "mock 0G".
