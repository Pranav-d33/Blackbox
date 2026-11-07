# Demo video script (about 3:00)

Recorded in real time. Solar farm scenario. "Say" lines are the voiceover; keep them plain.

---

## Part 1 · The demo: a solar farm inspection (0:00 – 1:15)

**0:00 – 0:12 · The problem**
*On screen:* launch page, then **Try the live demo**. The 3D solar farm, drone on the pad. Hover a panel: `r2m13`.
> "Solar farms are inspected by drones. Today most just take pictures and someone reviews them later. The next step is drones that decide for themselves: is this a crack, do I go closer, do I call the repair crew. Once a drone decides on its own, someone will ask: what did it see, and why did it decide that? Today the only answer is the operator's own database."

**0:12 – 0:25 · Mark the site**
*On screen:* place a **Cracked cell** on a row 2 panel and **Soiling** on a row 3 panel.
> "I'll plant two problems: a real crack, and some dirt that only looks like one."

**0:25 – 0:50 · Fly the survey**
*On screen:* **Fly the survey**. Live card: hold → ask 0G → answer → interlock → act. Drone descends on the crack, flies on past the soiling.
> "The drone's own detector flags both, but it doesn't decide. At each mark the drone stops and asks 0G's sealed AI model. 0G says: crack, send the repair crew. Dirt, add it to the cleaning round. The drone only moves after checking the answer is really signed by 0G and made for this exact stop."

**0:50 – 1:00 · Did 0G actually move the drone?**
*On screen:* **Replay, 0G forced to "continue"**. A red drone flies past the crack.
> "Same flight, but 0G's answers swapped for 'keep going'. The drone misses the crack. So 0G's answer is what moved the robot."

**1:00 – 1:15 · Try to break it**
*On screen:* **Forge "continue"**, **Tamper answer**, **Edit log**, then **Cut 0G link**.
> "A fake 'skip it' command: refused. 0G's real answer flipped: refused. A severity lowered in the log: the checker names the exact entry. And if 0G is cut off, the drone flies home and writes 'no decision made'. It never guesses."

---

## Part 2 · Why web3 here (1:15 – 1:35)

*On screen:* scan the **QR**, public verifier turns green on a phone.
> "Four parties care about this record: the farm owner, the insurer, the panel maker and the contractor. They don't trust each other, and the one flying the drone has the most reason to edit it.
> A public chain gives them one record nobody can quietly rewrite, with a timestamp, that anyone can check from a phone with no login and no permission from the operator."

Points to land:
- Parties that don't trust each other → shared record none of them controls.
- Tamper-evident and timestamped, not just "a log file".
- Checkable by a stranger from a QR code.

---

## Part 3 · Why 0G and why Arkiv (1:35 – 2:05)

**Why 0G**
> "We need three things inside the control loop: an AI we can verify, storage for the log, and a chain to lock it in. 0G gives all three in one network. Its sealed model runs in a secure enclave and signs every answer. That signature is what the drone checks before it moves. No 0G, no decision."

**Why Arkiv**
*On screen:* `r2m13` → **History**, then **Analytics** (defects by maker and batch).
> "0G proves the record. But nobody at a solar farm asks for a storage hash. They ask: what's the history of this panel? Are cracks clustering in one maker's batch? That's a warranty claim. Arkiv makes every finding searchable like a database, owned by the wallet that wrote it, and it expires after the working period. 0G says what's true, Arkiv makes it easy to ask."

---

## Part 4 · Under the hood (2:05 – 2:45)

**0G** (show the decision card fields, then the verifier)
> - "Every stop calls 0G's sealed vision model in a TEE. The robot checks the TEE signer against an allowlist and that the answer echoes its own nonce."
> - "Every event is a signed, hash-chained entry on 0G Storage, with the 0G request ID."
> - "The mission is registered on 0G Chain before takeoff and anchored every two decisions."
> - "The physics is MuJoCo with a Skydio X2 drone, and any mission replays from its seed to the same trajectory hash."
> - "Robots are identified through 0G's zerobot registry."

**Arkiv** (show the Analytics query)
> - "Four entity types: findings, the site owner's asset register, missions, and a mirror of every 0G upload."
> - "Two wallets: the owner owns the register, the inspector owns the findings."
> - "If 0G Storage can't serve a file, the verifier reads the Arkiv mirror and still checks every hash against 0G Chain. Arkiv is never trusted for the verdict."

**The SDK** (switch the top bar to **Bridge deck**, hover `x12y03`)
> "Nothing here is about solar. What the robot inspects, what the AI may answer and what the robot may do live in one JSON mission profile. Same code, a bridge deck crack survey.
> The same loop takes other inputs too: the crew can answer a hold in plain text, and it goes through the same checks. Next could be warehouse damage checks, a spoken command like 'inspect row 3 again' turned into a signed instruction, or a cheap model first and a bigger one only when it's unsure."

---

## Close (2:45 – 3:00)

> "Blackbox. 0G decides, Blackbox proves it, Arkiv makes it searchable. For any robot whose decisions someone else needs to trust."

---

## Notes

- If recording on mock 0G, say "mock 0G" out loud.
- Say "tamper-evident", never "tamper-proof". Don't say "0G controls the robot" or "Arkiv proves the decision".
- Warehouse, voice command and two-model check are ideas, not built. Say "next could be".
- Qualification hits, covered without naming them: 0G call in the decision loop (Part 1), log on 0G Storage with request IDs, replayable MuJoCo sim, safe stop (Part 4); Arkiv: why Arkiv, how it's used, schema and wallets (Parts 3–4).
