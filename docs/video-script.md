# Demo video script (about 3:00)

Style: close to ASD-STE100 (Simplified Technical English). Short sentences, active voice, one idea per sentence, the same word for the same thing every time. Lines in quotes are the voiceover. Recorded in real time, solar farm scenario.

---

## 1. The demo (0:00 - 1:15)

**0:00 - 0:15 · Open**
*Screen:* launch page. Click **Try the live demo**. The 3D solar farm shows, with the drone on the pad. Hover a panel: `r2m13`.

"On a large solar farm, about 1 panel in 100 is damaged. This damage costs a US solar farm about $5,000 per megawatt each year. Drones now find this damage and decide what to do. This is Blackbox. Blackbox records each decision that the drone makes. Anyone can check that record later."

**0:15 - 0:25 · Mark the site**
*Screen:* put a **Cracked cell** in row 2. Put **Soiling** in row 3.

"We add two problems. Here is a cracked cell. Here is some dirt. The dirt looks almost the same as a crack."

**0:25 - 0:50 · Fly**
*Screen:* click **Fly the survey**. Follow the live card. The drone goes down at the crack. The drone flies past the dirt.

"The drone camera finds both problems. The drone stops at each problem. It sends the image to the 0G AI model. For the crack, 0G says: send the repair crew. For the dirt, 0G says: add it to the cleaning list. Before the drone moves, it checks two things. The answer must come from 0G. The answer must be for this stop."

**0:50 - 1:00 · The 0G answer moves the drone**
*Screen:* click **Replay, 0G forced to "continue"**. A red drone flies past the crack.

"Now we fly the same mission again. This time we change each 0G answer to 'continue'. The red drone flies past the crack. The 0G answer is what moves the drone."

**1:00 - 1:15 · Try to break it**
*Screen:* click **Forge "continue"**, then **Tamper answer**, then **Edit log**, then **Cut 0G link**.

"We send a false command. The drone refuses it. We change the 0G answer. The drone refuses it. We change the log. Blackbox finds the change and shows the line. Now we cut the link to 0G. The drone flies home. The log says: no decision made."

---

## 2. Why a blockchain (1:15 - 1:35)

*Screen:* scan the **QR** with a phone. The verifier shows green.

"Four companies need this record. They are the farm owner, the insurer, the panel maker and the inspection contractor. If the contractor keeps the log, the contractor can change it. On a public blockchain, no one can change it. Anyone can check it with a phone. You do not need a login. You do not need permission."

---

## 3. Why 0G and Arkiv (1:35 - 2:05)

**0G**

"During the flight, the drone needs three things. It needs an AI that we can check. It needs storage for the log. It needs a blockchain to lock the log. 0G gives all three in one network. The 0G model runs in a secure enclave and signs each answer. The cost is low. The drone asks 0G only about the 1.5% of panels that the camera finds. That costs about one third of a cent per megawatt. A human drone survey costs $300 to $500 per megawatt."

**Arkiv**
*Screen:* click `r2m13`, then **History**, then **Analytics**. Show damage by maker and batch.

"0G keeps the proof. But a site manager does not search by file hash. The manager asks: what happened to this panel? Do the cracks come from one maker's batch? That is a warranty claim. Arkiv makes each finding easy to search. In our test, Arkiv writes 10 times faster than 0G Storage. It reads 8 times faster. 0G keeps the proof. Arkiv gives the search."

---

## 4. Under the hood (2:05 - 2:45)

*Screen:* open a decision card. Then open the verifier.

**0G**

"Each decision goes to the 0G sealed vision model. The model runs in an Intel TDX enclave. The drone checks the signer and a one-time code before it moves.
The robot signs each event. Each event links to the event before it. Blackbox stores the events on 0G Storage, each with its 0G request ID.
Before takeoff, Blackbox registers the mission on 0G Chain. After each two decisions, it locks the log on 0G Chain.
The flight uses real physics. A Skydio X2 drone flies in MuJoCo at 240 updates per second. Each mission replays to the same path.
The 0G zerobot registry gives each robot its identity."

**Arkiv**
*Screen:* show the Analytics query.

"Blackbox writes four record types to Arkiv. They are findings, missions, the asset list and a backup copy of each 0G file. The asset list gives the maker and batch of all 136 panels.
The owner wallet owns the asset list. The inspector wallet owns the findings.
If 0G Storage is down, the verifier reads the Arkiv backup. It still checks each hash against 0G Chain."

**The SDK**
*Screen:* select **Bridge deck** in the top bar. Hover `x12y03`.

"Blackbox is not only for solar. One JSON file sets what the drone inspects. It sets what the AI can answer. It sets what the drone can do. Here, the same code inspects a bridge deck for cracks. The crew can also reply in text. The text goes through the same checks. Warehouse checks or voice commands need only a new mission file."

---

## Close (2:45 - 3:00)

*Screen:* back to the solar farm. The drone is on the pad. The verifier shows green.

"Blackbox. 0G decides. Blackbox proves it. Arkiv makes it easy to search."

---

## Notes

- If you record with mock 0G, say "mock 0G" on camera.
- Do not say "tamper-proof", "0G controls the robot" or "Arkiv proves the decision".
- Warehouse checks and voice commands are not built. Do not demo them.
- Sources for the numbers:
  - 1 panel in 100 damaged: 2,481 of 232,934 modules, Remote Sensing 15(7):1914, 2023.
  - $5,070 per MW per year: Raptor Maps via pv magazine, Feb 2026.
  - 1.5% and $0.0035 per MW: our 8 sim runs (`docs/pitch-numbers-and-workflows.md`).
  - $300-500 per MW human survey: a vendor blog (weak source).
  - Arkiv write 7 s vs 76 s, read 0.36 s vs 2.8 s: `arkiv/benchmark.md`.
