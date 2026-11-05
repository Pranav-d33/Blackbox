# Solar farm demo script

The video runs 2:30 to 2:50 and is recorded in real time (ETHGlobal's rules forbid speeding it up). Open on the launch page at `http://127.0.0.1:8787` (the hero replays a solar mission in 3D), then press **Try the live demo**. Everything after that happens in the operator console (`/console.html`) with the **Solar farm O&M survey** scenario selected. The beats are numbered in the console's left column in the same order.

## Before recording

1. `npm run dev:local` for a dry run (mock 0G, local chain), or the Galileo setup in the README for the real recording.
2. For the real recording, set `ZG_MODE=router` and `ZG_API_KEY` (an `sk-` key from pc.0g.ai with a small mainnet deposit) and check the top bar says **0G Compute · 0gm-1.0-35b-a3b · sealed**. The yellow MOCK bar must be gone.
3. Run `npm run probe` once and note the median latency. The lease is 3x that, capped at 12 s.
4. Open the public verifier on the phone once so the QR beat loads fast.

## Beats

| Time | Beat | On screen | Say |
|---|---|---|---|
| 0:00 – 0:12 | Opening | The 3D field, drone on the pad | "When an AI-driven drone misses a cracked module, who can check what it saw and decided, other than the operator's own database?" |
| 0:12 – 0:45 | 1 · 0G decides the path | Place two **Cracked cell** marks and one **Soiling** patch, press **Start mission**. At each mark the drone holds; the live card walks through: robot holds, sealed call, 0G answer, interlock, robot acts | "The detector flags all three. It never decides. 0G's sealed model calls the crack a cracked cell and the dust soiling. The drone descends only on the crack, and only after checking 0G's TEE signature and its own nonce." |
| 0:45 – 1:05 | 2 · Did 0G move the robot? | **Replay, 0G forced to "continue"**: two drones, red one flies past every crack | "Same seed, same field. Only 0G's answers differ. With every answer forced to continue, the drone flies straight past the damage. 0G's answer moved the robot." |
| 1:05 – 1:30 | 3 · Dishonest operator | New mission. Press **Forge "continue"**, then **Tamper answer**. Then **Edit log** after landing | "The operator forges a skip, signed with their own key: refused, not on the allowlist. They flip 0G's real answer but keep its signature: refused, the signature doesn't cover it. They lower a severity in the log: the verifier names the entry." |
| 1:30 – 1:50 | 4 · Kill switch | **Cut 0G link** mid-survey (or turn off the hotspot) | "No 0G, no decision. The lease runs out, the drone flies home, and the log says 0G unreachable, no decision made. There is no cached answer and no local stand-in." |
| 1:50 – 2:15 | 5 · Verify on your phone | **QR**, scan it, the verifier goes green: robot signatures, TEE signers, nonces, anchors, manifest, replay | "Anyone can check this mission from a phone, from 0G Chain and 0G Storage, without our server." |
| 2:15 – 2:35 | Close | **SDK** tab: the profile's labels and actions, the Robot interface | "Nothing here is about solar panels. A mission profile on 0G Storage sets what the model may answer and what the robot may do. Any robot that implements three calls can run under it." |

## Booth checklist

- Laptop on a phone hotspot (the kill-switch beat uses it).
- Charger, and the backup recording made 8 hours before the deadline.
- The printed QR for the verifier.
- If the stage has no table for the rover, the sim carries every beat.

## Claims to keep

Say "the robot only acts on answers signed by an allowlisted 0G TEE signer", "each answer echoes the robot's nonce, so it was produced for this request" and "tamper-evident". Don't say "0G controls the robot", "tamper-proof" or "proves what the camera saw". With the mock running, say "mock 0G" out loud.
