# The story: who checks the robot?

*No jargon version. For judges, sponsors and anyone who has not read the code.*

## The problem that already exists

Companies already send drones over solar farms, bridges and power lines, and software decides what the camera sees: *cracked, or just dirty?* That call decides whether a repair crew gets sent, a claim gets paid, or a bridge stays open.

And the only record of that call is a file on the drone company's own computer.

That is the whole problem. **The party being checked is the party holding the evidence.** If the drone missed a crack, the company that flew it is the only one who can say so, and the only one who can quietly fix the file.

## One example, start to finish

*(This is exactly what the demo shows.)*

**Night.** A drone flies a solar farm. It stops over two marks: one on module 13 in row 2, one on a module in row 3.

**What happens next, in plain words.**

1. The drone does not decide for itself. It asks an AI that runs in a sealed box, a computer nobody can open or tamper with, and the box stamps its answer with a signature.
2. Module 13: *cracked cell, send the repair crew.* The drone moves in for a closer look. Row 3: *just dirt, leave it for cleaning.* The drone moves on.
3. The drone refuses to act on any answer that is not stamped by that box. It has no "I'll just guess" mode. If it cannot reach the box, it flies home and writes down "no decision made".
4. Every decision is written into a log that cannot be edited without everyone seeing it, and a copy of its fingerprint is pinned somewhere public.
5. The decision is also saved as a row in Arkiv, a database anyone can search: module `r2m13`, cracked cell, severity 2, made by Helion PV, batch 2024-B, with a pointer to the proof.

**Months later**, a string of panels underperforms. The report said row 2 was clean.

- **The owner** opens module r2m13's history. It says *Cracked cell, severity 2*. No phone call, no asking the contractor.
- **The insurer** scans a QR code. The checker confirms the record is untouched, the answer came from the sealed box, and the drone acted on it. No account, no login.
- **The contractor** shows the same page to prove it flagged the crack and the owner never ordered the repair.
- **The module maker** can see when the crack was first recorded.

Nobody had to trust anybody. They checked.

## Then we try to cheat, live

On stage we attack our own system:

- Pretend the AI said "all clear" when it said "crack": **the drone refuses**.
- Change the answer but keep the stamp: **the drone refuses**.
- Edit the saved log afterwards: **the checker turns red and points at the exact line**.
- Unplug the AI: **the drone flies home and says it did not decide**. It never makes something up.

This is the proof. A good record is not one that looks right; it is one that is hard to fake.

## Why this needs web3

A normal company could build "a log with signatures". The trouble is who holds it. Whatever server it sits on belongs to someone in the deal, and that someone has a reason to edit it.

Web3 gives us three things nobody in the deal owns:

1. **A record no one party can rewrite.** Once the fingerprint is on a public chain with a timestamp, nobody can go back and change history.
2. **Names anyone can look up.** Not a vendor's private ID, but a name on a public registry.
3. **Checking without permission.** A stranger with a phone can verify the record. No account with us, no API key, no "please ask the contractor".

Our users do not trust each other: an owner, a contractor, an insurer, a regulator. That is exactly the situation public, neutral infrastructure was made for.

## Where each sponsor fits

| | What it does in the story | Why it matters here |
|---|---|---|
| **0G** | Everything the decision needs, in one place: the sealed AI that gives the stamped answer, the storage that keeps the evidence, the chain that pins the fingerprints | The AI is inside the loop, not bolted on. The drone cannot move without 0G's answer, and if 0G is gone it stops. |
| **Arkiv** | A searchable database next to 0G: every decision is a row you can filter by panel, maker, batch or severity | Without it the record is a pile of files that only engineers can open. With it, an owner, a maker or an insurer gets an answer in one query, and it still points back at the proof on 0G. |

Short version: **0G decides and proves. Arkiv makes it searchable. The chain makes it permanent.**

## It is not just solar panels

The same recorder runs a bridge deck in the demo. A new job is a short settings file (what the AI may answer, what the robot may do, how things are named), not a new product. That means the same idea fits:

- **Bridges:** `x12y03` is one square metre of deck. A structural engineer pulls up a square and sees its history across surveys.
- **Pipelines, power lines, wind turbines:** a weld, a span, a blade, each with its own name and its own checkable history.
- **Any robot where an AI call has consequences.**

## The impact

- **Operators** win disputes with evidence instead of arguments.
- **Owners and insurers** price and pay against a record they did not have to take on faith.
- **Regulators** get record-keeping that works without asking every vendor for a private export. The EU AI Act already requires record-keeping for high-risk AI.
- **People near the asset** (a bridge, a plant, a line) get a safer system that is checked by more than the company paid to run it.

We have seen this before. Aircraft carry flight recorders, not because airlines love them, but because when something goes wrong everyone needs one version of the truth. Blackbox is that, for the robots and AI that are now flying, driving and inspecting.

## The one-liner

> **Robots are starting to make calls that matter. Blackbox makes sure the call can be checked by anyone, and found by name.**

## What we are honest about

- It records and proves decisions. It does not make the AI right, and it does not prove what the camera saw.
- Arkiv is the searchable copy, not the proof: the checker always goes back to the signed record on 0G.
- Today the demo runs offline on a mock of 0G, and says so on screen. Arkiv runs on its public testnet. Live 0G runs are the next step.
