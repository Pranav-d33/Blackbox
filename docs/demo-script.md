# Demo script

The video runs 2:30 to 2:50 and is recorded in real time (ETHGlobal's rules forbid speeding it up). Open on the launch page at `http://127.0.0.1:8787` (the hero replays the last mission in 3D), then press **Try the live demo**. Everything after that happens in the operator console (`/console.html`).

The console has one flow, the same for both scenarios, in its left panel:

1. **Mark the site.** Click the field to place a defect or a benign mark. Hovering outlines the asset under the cursor with its label.
2. **Fly the survey.** The drone holds at each mark, asks 0G's sealed model, and moves only on an answer it verified itself.
3. **Prove it.** **Verify on 0G** re-checks everything from the chain. With Arkiv on, **History** and **Analytics** query every finding live from Arkiv.

The right panel lists the findings by asset. The bottom bar (**Try to break it**) holds the attacks and the kill switch.

## The two flows

| | Solar farm | Bridge deck |
|---|---|---|
| Asset | one PV module | one 1 m² deck square |
| Asset label | `r2m13` (row 2, module 13) | `x12y03` (12 m along, 3 m across) |
| Mark 1 (defect) | **Cracked cell** on a module in row 2 | **Crack** near the middle of the deck |
| Mark 2 (benign) | **Soiling** on a module in row 3 | **Decoy** (paint stripe or cable) |
| 0G decides | cracked cell → descend, "Send the repair crew"; soiling → continue, "Add to the cleaning round" | crack → descend, "Send a structural engineer"; decoy → continue, "No action, not damage" |
| On Arkiv afterwards | `r2m13` history: *Cracked cell, severity 2, Helion PV HX-450, batch 2024-B* | `x12y03` history: *Crack, severity 3, span 2, pour 2019-04* |


## Before recording

1. `npm run dev:local` for a dry run (mock 0G, local chain), or the Galileo setup in the README for the real recording. For the Arkiv views, set `ARKIV=rabdi`, fund the wallet and run `npm run arkiv:register` once.
2. For the real recording, set `ZG_MODE=router` and `ZG_API_KEY` and check the top bar shows the sealed model, not **Mock 0G**. For Arkiv, the top bar must show **Arkiv · rabdi**.
3. Run `npm run probe` once and note the median latency. The lease is 3x that, capped at 12 s.
4. Open the public verifier on the phone once so the QR beat loads fast.

## Beats (solar farm)

| Time | Beat | On screen | Say |
|---|---|---|---|
| 0:00 – 0:12 | Opening | The 3D farm, drone on the pad. Hover a module: `r2m13` | "When an AI drone inspects this module, who can check what it saw and decided, other than the operator's database?" |
| 0:12 – 0:45 | 1-2 · Mark and fly | Place a **Cracked cell** and a **Soiling** patch, press **Fly the survey**. At each mark the live card walks through hold, ask 0G, answer, interlock, act | "The detector flags both. It never decides. 0G's sealed model calls one a cracked cell and the other soiling. The drone descends only on the crack, and only after checking 0G's TEE signature and its own nonce." |
| 0:45 – 1:00 | 3 · Searchable on Arkiv | `r2m13` card → **History**: its timeline and register entry. Then **Analytics**: defects by maker and batch, the Arkiv query underneath | "Every decision is also a row on Arkiv. Here's this module's history, and here's the site: cracks by maker and batch, a warranty claim in one query. The owner's wallet owns the register; ours owns the findings." |
| 1:00 – 1:15 | Did 0G move the robot? | **Replay without 0G**: a red drone flies past the crack | "Same seed, same field. With every answer forced to continue, the drone flies past the damage. 0G's answer moved the robot." |
| 1:15 – 1:40 | Try to break it | New mission. **Forge a decision**, then **Flip 0G's answer**. After landing **Edit the log** | "A forged skip, signed with the operator's key: refused. 0G's real answer flipped, signature kept: refused. A severity lowered in the log: the verifier names the entry." |
| 1:40 – 1:55 | Kill switch | **Cut 0G** mid-survey, before the second mark | "No 0G, no decision. The lease runs out, the drone flies home, and the log says 0G unreachable, no decision made." |
| 1:55 – 2:10 | Resume | *Survey interrupted* card: **Restore 0G**, then **Resume from the stop point**. The drone flies straight back to where it stopped and asks 0G about the mark it never decided | "In the field, links drop. The drone signed where it stopped. The new mission picks up from there, and the chain links the two, so there is no gap anyone could hide a decision in." |
| 2:10 – 2:25 | Verify on your phone | **Phone QR**, the public verifier goes green | "Anyone checks this mission from a phone, from 0G Chain and 0G Storage. If 0G Storage is down, it reads the Arkiv mirror and runs the same hash checks against 0G Chain." |
| 2:25 – 2:40 | Close | Switch to **Bridge deck**, hover a square: `x12y03` | "Nothing here is about solar panels. A mission profile sets what the model may answer, what the robot may do and the asset register. Same SDK, a bridge deck in one JSON file." |

For a bridge-deck run, swap the marks for **Crack** and **Decoy** and say "structural engineer" instead of "repair crew".

## Booth checklist

- Laptop on a phone hotspot (the kill-switch beat uses it).
- Charger, and the backup recording made 8 hours before the deadline.
- The printed QR for the verifier.
- If the stage has no table for the rover, the sim carries every beat.

## Claims to keep

Say "the robot only acts on answers signed by an allowlisted 0G TEE signer", "each answer echoes the robot's nonce, so it was produced for this request", "tamper-evident" and "Arkiv makes it searchable, 0G decides whether it's true". Don't say "0G controls the robot", "tamper-proof", "proves what the camera saw" or "Arkiv proves the decision". With the mock running, say "mock 0G" out loud.
