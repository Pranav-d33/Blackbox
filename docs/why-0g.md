# Who checks the drone?

**0G decides. Blackbox proves it.**

An inspection drone flies four rows of PV modules and makes calls that cost money: this cell is cracked, send the repair crew; that patch is dust, leave it for cleaning. Today the only record of those calls lives on the operator's own server. Blackbox lets anyone check them.

## The morning after the inspection

A contractor's drone surveys the plant overnight. Its camera flags marks on the modules, and a model decides what each one is. A cracked cell can grow into a hotspot and lose yield, so it gets a close-up and a repair ticket. Soiling only needs the cleaning crew. The contractor sends a report and gets paid.

Months later a string underperforms, and the cause is a cracked module that the report says was clean. Now four parties need to know what the drone saw and decided that night:

| Party | What they need |
|---|---|
| Asset owner | Paid for an inspection and wants to know it happened as reported |
| Insurer | Is asked to cover the loss and wants evidence it can rely on |
| Module maker | Faces a warranty claim and wants to know when the crack appeared |
| O&M contractor | Has to defend its record without being trusted on its own word |

All of them have to take the contractor's database at its word. Anyone with access to that database can edit it, and nobody else can tell.

## What each kind of record can prove

A robot-signed hash chain with a timestamp already makes a log tamper-evident. That part alone does not need a blockchain. The gap is everything around the log: which model made the call, whether its answer was made for this checkpoint, and whether the robot only did what that answer said.

| Question someone asks later | Operator database | Signed log | Blackbox on 0G |
|---|---|---|---|
| Was an entry changed after the fact? | no way to tell | yes | yes, against anchors on 0G Chain |
| Which model made this decision? | operator says so | operator says so | TEE signature from a signer registered on 0G |
| Was the answer produced for this checkpoint? | no | no | the answer echoes the robot's nonce |
| Did the robot act only on that answer? | no | no | the robot refuses anything else, and logs the refusal |
| Can a stranger check it without an account? | no | only if handed the file | public verifier reads 0G Chain and 0G Storage |
| What happens when the AI is unreachable? | often a silent fallback | not recorded | safe stop, logged as "0G unreachable, no decision made" |

## Why 0G: three layers, each doing real work

0G (Zero Gravity) puts verifiable AI compute, decentralized storage and a chain in one network. Blackbox uses all three inside the control loop, not only for logging.

**0G Compute** (`0gm-1.0-35b-a3b`, TeeML). At every checkpoint the drone holds still and sends its camera crop to 0G's own vision model, running sealed in an Intel TDX enclave. The answer comes back with a TEE signature. The robot checks that the signer is on its allowlist, that the signature covers these exact response bytes, and that its nonce was echoed. Only then does it move. See `robot/blackbox_robot/interlock.py`.

**0G Storage** (one entry per decision). Each decision goes to 0G Storage under its content root: the crop hash, the answer, `x_0g_trace.request_id`, the chat id and the TEE signature, all signed by the robot's own key and chained by keccak256. So does the mission manifest: the seed, thresholds, model, signer allowlist and the mission profile (labels, actions, prompt).

**0G Chain** (`BlackboxRegistry` on Galileo, chain 16602). Before takeoff the mission is registered with the manifest root and the robot's zerobot identity. Every two decisions the robot signs the current chain head and it is anchored on chain. At landing the mission closes with its trajectory hash, so the flight can be replayed from its seed and compared.

**It fails closed.** If 0G cannot be reached before the lease runs out, the drone flies home and the record says no decision was made. There is no cached answer and no local stand-in model, so a missing decision can never pass for a real one.

## Why a blockchain at all

The parties in this story do not trust each other, and the one who runs the drone is the one with the most reason to edit the record. A chain gives them a commitment none of them can quietly rewrite. It is timestamped and publicly readable, so a phone can check it from a QR code without an account or the operator's permission.

It also gives the robot an identity: `BlackboxRegistry` checks that the signing robot is an operator in 0G's zerobot `RobotRegistry` before it accepts an anchor. And it leaves room for consequences that run on their own later, such as releasing payment for an inspection only when its record verifies.

That creates a tension. The operator installs Blackbox, and an independent record can be used against them. So the buyer is whoever requires it: an asset owner writing it into an O&M contract, an insurer pricing it in, or a regulator. Aircraft flight recorders spread by mandate, not because airlines asked for them. The EU AI Act's record-keeping duty for high-risk AI (Article 12) points the same way.

## One recorder, any robot, any task

Nothing about solar panels is hardcoded. A mission profile (`scenarios/*.json`) is a small task pack: the world, the labels the model may answer, the actions it may choose and the prompt. It goes into the manifest, so the robot loads its policy from 0G Storage by root hash, and its interlock refuses any label or action the profile does not list. The bridge-deck crack survey and the solar farm survey are two profiles on the same code.

```python
from blackbox_robot.sdk import Robot

class MyRobot(Robot):
    ACTIONS = ("descend", "continue")

    def step(self):          # your control loop; when a decision is needed:
        return {"type": "checkpoint", "png": frame, ...}

    def resolve(self, action):
        ...                  # only ever an action 0G signed, or "safe_stop"
```

## What we say, and what we don't

We say:
- The robot only acts on answers signed by an allowlisted 0G TEE signer.
- Each answer echoes the robot's nonce, so it was produced for this request.
- The record is tamper-evident: any change after anchoring is detectable.
- Sealed inference on 0GM-1.0, when the run uses it.

We don't say:
- "0G controls the robot." Motion stays on the device.
- "Tamper-proof." It is tamper-evident.
- "It proves what the camera saw." A dishonest core could still send a different image.
