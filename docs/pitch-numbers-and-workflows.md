# Pitch numbers and SDK workflows (DRAFT for review)

Status: draft. Every figure is either sourced (link) or marked **ASSUMPTION**. Nothing here is committed to the pitch yet.

## 1. How many panels are broken per survey

| Figure | Value | Source |
|---|---|---|
| Real drone survey, South India | 2,481 defective of 232,934 modules = **1.06%** (blocks range 0.22% to 1.96%) | [Remote Sensing 15(7):1914](https://www.mdpi.com/2072-4292/15/7/1914) |
| Median hotspot vs neighbour cell | about 20 °C hotter | same study |
| Defect classes seen | cell cracks, PID, bad interconnects, shorted bypass diodes, cracked glass, soiling | same study |
| Anomalies per MW per year, small C&I sites (<5 MW) | **264 "DC health issues" per MW** (different unit: sub-module items, not whole panels) | [Raptor Maps via pv magazine](https://pv-magazine-usa.com/2026/02/25/u-s-solar-assets-lose-average-5070-per-mw-from-power-losses/) |
| Average power loss, US fleet | 5.08% (about $5,070 per MW per year) | same |
| Human survey price | $300 to $500 per MW, one pilot 50 to 100 MW/day | [averroes.ai](https://averroes.ai/blog/how-much-does-drone-solar-panel-inspection-cost-2026) (vendor blog, weak source) |

Safe pitch line: **"About 1 panel in 100 is defective on a real survey, and it varies 10x between blocks of the same plant."** The 1.06% is one plant, one study; do not call it an industry average.

Caveats:
- 1.06% is thermal (IR) detection. Our drone uses RGB crops, so it sees cracks and soiling, not every hotspot.
- The 264/MW and 1.06% numbers are not comparable. Pick one unit and stay with it.
- I could not find a clean "average % broken" across the industry. IEA PVPS Task 13 reports failure types as shares of failures, not as a share of all panels.

## 2. Inference cost per survey

Key design fact: the model is only called on crops the on-board detector flags, never on every panel.

Assumptions (change these, the table follows):
- **ASSUMPTION** 1 MW is about 1,800 modules (550 W each). Older 330 W plants are about 3,000 per MW.
- **ASSUMPTION** the detector flags 3% of modules (real defects at 1.06% plus soiling and false positives, about 3x). **Measured in our sim:** 8 completed MuJoCo solar-farm runs flagged 16 crops over 136 modules each, about **1.5%** (`robot/data` logs). Marks are planted by the demo operator, so this is a demo figure, not a natural rate. At 1.5% every cost below roughly halves; 3% is the conservative case.
- **ASSUMPTION** one call is about 1,400 input tokens (crop plus the profile prompt, which is about 350 tokens in `scenarios/solar-farm.json`) and about 40 output tokens (the one-line JSON).
- **Real 0G Router prices** (model pages, read 2026-11-07):
  - [`qwen2.5-vl-72b-instruct`](https://pc.0g.ai/models/qwen2.5-vl-72b-instruct): **$0.045 in / $0.195 out per M tokens**, text+image input, 128k context. No image-specific price listed. The page states no TEE/verifiability info.
  - [`0gm-1.0-35b-a3b`](https://pc.0g.ai/models/0gm-1.0-35b-a3b): **$0.08 in / $0.48 out per M tokens**, PrivateTEE / E2EE / ZDR, `verify_tee` supported. The page does **not** list image input.
- I assumed an image costs about 1,000 input tokens. Check the real count from a response's `usage` field.

Per call: Qwen2.5-VL-72B = 1,400 x $0.045/M + 40 x $0.195/M = about **$0.00007**. 0GM-1.0 (if it accepts images) = about **$0.00013**.

| Scope | Crops sent | Qwen2.5-VL-72B | 0GM-1.0 | Human survey for comparison |
|---|---|---|---|---|
| 1 MW | about 54 | **about $0.004** | about $0.007 | $300 to $500 |
| 100 MW | about 5,400 | **about $0.38** | about $0.71 | $30k to $50k |
| The 232,934-module plant above | about 6,990 | **about $0.49** | about $0.92 | n/a |
| Naive: send every panel, 1 MW | 1,800 | about $0.13 | about $0.24 | n/a |

Takeaway: gating cuts inference about 30x, and inference is well under 0.01% of the cost of the human survey (under a dollar for 100 MW).

**Conflict to resolve before pitching:** "sealed" and "vision" are on different models in these two pages. The Qwen2.5-VL page lists images but no TEE; the 0GM-1.0 page lists TEE but no images. `README.md` already says to call it "route-attested" when R1 runs on the Qwen fallback. Confirm whether `X-0G-Provider-Trust-Mode: private` works for the Qwen route. Inference cost is not the business risk; flight time, hardware and false-negative liability are. Do not claim this replaces the whole survey price, only that the sealed-decision layer is negligible next to it.

Not included: 0G Storage and chain fees for evidence and commitments, and Arkiv writes. Testnet costs are measured in `arkiv/benchmark.md`; mainnet prices are not.

## 3. Workflows an SDK user could build

What exists today (verified in `robot/blackbox_robot/sdk.py` and `scenarios/solar-farm.json`): an integrator implements `Robot` and a `World`, and the mission profile supplies `labels`, `label_actions`, the `prompt`, and a confidence hold threshold. The sealed model sees an image and returns one JSON label. That is a **vision-to-label-to-action** loop.

Everything below except the first row is a **proposal, not built**. Label it as such on stage.

| # | Workflow | Model type | Profile change only? | Status |
|---|---|---|---|---|
| 1 | Solar crack vs soiling: descend for repair crew or continue | Vision | yes | **Built** |
| 2 | Bridge deck crack vs decoy (stain, joint) | Vision | yes | **Built** (`scenarios/bridge-deck.json`) |
| 3 | Warehouse pallet check: damaged / intact / unsure, then flag for human | Vision | yes (new labels and prompt) | Proposal |
| 4 | Operator voice command: "inspect row 3 again" becomes a signed, attested instruction | Speech-to-text, then text model constrained to the action vocabulary | no, needs a new input step | Proposal |
| 5 | Voice report back: the finding is read to the crew in their language | Text-to-speech on the signed result | no, output only | Proposal |
| 6 | Free-text incident triage: turn the crew's note ("panel B4 smells burnt") into a priority and an action | Text | partly: label/action vocabulary still applies | Proposal |
| 7 | Two-model check: cheap vision model first, larger model only when confidence is below the hold threshold | Vision, two tiers | yes (two profiles) | Proposal; ties to the existing hold-below-confidence rule |

Honest framing for the pitch: the SDK today constrains a model to a fixed vocabulary of labels and robot-approved actions, which is why the interlock can verify it. Voice and free text fit only if the transcript is also logged and the output is forced into the same vocabulary. Workflow 4 is the strongest demo idea, because it shows the attested chain from a spoken command to a robot action, but it needs new code and a speech model on 0G (I have not checked whether one is available there).

## 4. Open questions for you
1. Which model will the pitch cite (Qwen2.5-VL-72B for vision, or 0GM-1.0 for sealed)?
2. Flag rate: keep 3% (conservative) or quote the measured 1.5% from the sim?
3. Voice workflow is a flow diagram only: see docs/voice-workflow.md.
