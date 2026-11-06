# Deploying the live backend (Railway or Render)

The static pages on Vercel (landing replay, public verifier) need nothing. The **control pane and the simulation** need the core (Node) and the robot (Python, MuJoCo) running, so they go in one container built from the `Dockerfile`. The core serves the console and the API; the robot listens on `127.0.0.1` inside the container and is never exposed.

## Secrets (set in the host's dashboard, never in git)

| Variable | Value |
|---|---|
| `ZG_API_KEY` | `sk-...` from pc.0g.ai (small mainnet deposit) |
| `OPERATOR_PRIVATE_KEY`, `ROBOT_PRIVATE_KEY` | funded on Galileo; the robot key is the one registered by `npm run setup:robot` |
| `BLACKBOX_REGISTRY`, `ROBOT_ID` | from `contracts/deployments` and `npm run setup:robot` |
| `CHAIN=galileo`, `STORAGE=0g`, `ZG_MODE=router`, `ROBOT_TEE_SIGNERS_FROM=chain` | as in `.env.example` |
| `ARKIV=rabdi`, `ARKIV_PRIVATE_KEY` (and `ARKIV_OWNER_PRIVATE_KEY` if you use the register) | optional |
| `PUBLIC_VERIFIER_URL` | the deployed verifier URL, so the QR code works on phones |
| `ADMIN_TOKEN` | a long random string; lets you bypass the public limits |

`PUBLIC_MODE=1` is already set in the image. Copy values from your local `.env`; do not commit it.

## Railway
1. New project, deploy from the GitHub repo. `railway.json` selects the Dockerfile and health-checks `/api/config`.
2. Add a **volume** mounted at `/data` (mission logs, 0G blob cache). Without it, history is lost on every redeploy.
3. Paste the secrets above as variables. Generate a public domain. Open it: the console is the site root's `/console.html`.

## Render
1. New Blueprint from the repo; `render.yaml` creates a Docker web service with a 1 GB disk at `/data`.
2. Fill every `sync: false` secret in the dashboard. The disk needs a paid instance.

## What public mode does (`core/src/guard.ts`)
- `/api/checkpoint` and `/api/entries` (robot to core) answer only to loopback, so nobody outside can inject entries.
- One flight at a time; a visitor waits 90 s between flights; 40 flights a day across everyone; 8 marks per flight.
- Marks, e-stop, human answers, counterfactual and the break-it buttons are only for the visitor who started the current flight. Everyone can watch.
- Each IP has a request budget; replay and verify are limited to 6 a minute.
- The IP is the first `x-forwarded-for` hop, which both hosts set. It is a brake, not authentication.

## Cost to watch
Every public flight spends your 0G Compute credits (one call per flagged module, a fraction of a cent each; see `pitch-numbers-and-workflows.md`) and Galileo gas for the mission anchor and close. At the default cap of 40 flights a day that is bounded; lower `PUBLIC_DAILY_FLIGHTS` before sharing the link widely.

## Linking from Vercel
The landing page on Vercel stays static. Add a link to `https://<your-backend-domain>/console.html`, or make the backend the site and skip Vercel for the console. Landing's "live console" button appears only when `/api/config` answers on the same origin.
