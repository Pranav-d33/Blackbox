# Running Blackbox on 0G

Deployment, configuration and the open assumptions. The overview is in the [README](../README.md).

## Run on 0G testnet (Galileo)

Each step marked **MANUAL** needs you.

**1. Wallets (MANUAL).**

```bash
cp .env.example .env
```

```bash
npm run keys
```

Put `OPERATOR_PRIVATE_KEY` and `ROBOT_PRIVATE_KEY` in `.env`, then fund the **operator** address at https://faucet.0g.ai (0.1 0G/day; Storage fees and gas). The robot key needs no funds: its anchors are relayed.

**2. 0G Router key (MANUAL).** Create an `sk-…` key at https://pc.0g.ai, make a small **mainnet** deposit, and set `ZG_API_KEY`. The Router and its TEE providers are on mainnet even while Storage and Chain are on Galileo.

**3. Deploy `BlackboxRegistry` to Galileo (MANUAL).**

```bash
cd contracts && DEPLOYER_PRIVATE_KEY=<key> ROBOT_REGISTRY=0x291162e93D7A80Eb8F738882a28a7a8A5FBA73bb forge script script/Deploy.s.sol --rpc-url galileo --broadcast
```

Copy `blackboxRegistry` from `contracts/deployments/16602.json` into `.env` as `BLACKBOX_REGISTRY`. If the tx is rejected over fees, add `--legacy --with-gas-price 3000000000`.

Then verify it on chainscan (etherscan-compatible API; confirm the flags against the 0G docs):

```bash
forge verify-contract <BLACKBOX_REGISTRY> src/BlackboxRegistry.sol:BlackboxRegistry --chain-id 16602 --verifier etherscan --verifier-url https://chainscan-galileo.0g.ai/open/api --etherscan-api-key <key> --constructor-args $(cast abi-encode "constructor(address)" 0x291162e93D7A80Eb8F738882a28a7a8A5FBA73bb)
```

**4. Register the robot on zerobot.**

```bash
npm run setup:robot
```

This calls `registerRobot` and `addOperator(robot key)`. Copy the printed `ROBOT_ID=` into `.env`.

**5. Gate A probe against live 0G (MANUAL check).**

```bash
npm run probe -- --echo 20 --storage
```

Then run it for the solar farm profile too, which sends that profile's prompt with the crops in `robot/assets/probe-solar` (regenerate them with `cd robot && .venv/bin/python -m blackbox_robot.probe_images assets/probe-solar solar-farm`):

```bash
npm run probe -- --scenario solar-farm
```

It prints, for each probe crop: label accuracy, nonce echo, TEE signer, **which signature binding matched**, latency and a 1 KB storage round trip. Then:

- set `LEASE_MS` to the printed value (3× the median latency, capped at 12 s);
- set `TEE_BINDING` to the binding that matched (`go` or `raw`). If **none** matched, read [Not yet verified](#not-yet-verified-against-live-0g) before the demo;
- if fewer than 4 of 5 cracks are flagged, or a decoy is not rejected, add real crack photos (`BLACKBOX_TEXTURE_DIR`), and keep `qwen3-vl-plus` as the fallback.

**6. Run.** Use three terminals.

```bash
npm run core
```

```bash
npm run robot
```

Open http://127.0.0.1:8787/console.html, pick a scenario, place a defect and a benign mark, and press **Start mission**. Ledger rows link to storagescan and chainscan.

**7. Public verifier on Vercel (MANUAL).**

```bash
npm --prefix core run build:web && cd core/web && npx vercel deploy --prod
```

`vercel.json` serves `verify.html` at `/`. Set `PUBLIC_VERIFIER_URL=https://<your-app>.vercel.app/verify.html` so the console's QR code works on a phone. The page needs no backend: it reads Galileo RPC plus the indexer gateway directly.

**8. Command-line verify and replay.**

```bash
npm run verify -- --mission 0x<missionId>
```

```bash
npm run replay -- --core http://127.0.0.1:8787 --mission 0x<missionId>
```


## Manual values checklist

| Value | Where | How to get it | Needed for |
|---|---|---|---|
| `OPERATOR_PRIVATE_KEY` | `.env` | `npm run keys`, then fund at faucet.0g.ai | Storage fees, registry txs, zerobot robot owner |
| `ROBOT_PRIVATE_KEY` | `.env` (robot machine only) | `npm run keys` | robot signatures (no funds) |
| `DEPLOYER_PRIVATE_KEY` | shell / `.env` | can equal the operator key | `forge script` |
| `ZG_API_KEY` | `.env` | pc.0g.ai → API keys (`sk-…`) + mainnet deposit | every 0G Compute call |
| `BLACKBOX_REGISTRY` | `.env` + [addresses table](../README.md#deployment-addresses) | step 3 | chain anchoring, verifier |
| `ROBOT_ID` | `.env` | step 4 | registerMission |
| `LEASE_MS`, `TEE_BINDING` | `.env` | step 5 (`npm run probe`) | safe-stop lease, interlock |
| `ZG_ROUTER_ENDPOINTS` 2nd entry | `.env` | **testnet Router URL: not documented; ask at the 0G booth** | R17 failover |
| `PUBLIC_VERIFIER_URL` | `.env` | step 7 | QR code |
| `ARKIV=rabdi`, tGLM on the inspector wallet | `.env` | https://hub.arkiv.network/faucet, then `npm run arkiv:register` | queryable findings, analytics, the 0G Storage mirror |
| `CHAINSCAN_API_KEY` | shell | chainscan account | contract verification |
| Real crack textures | `BLACKBOX_TEXTURE_DIR/crack/*.png`, `/decoy/*.png` | e.g. a CC-BY concrete-crack dataset (credit it below) | Gate A accuracy on 0GM |
| Rover pins | `ROVER_*` env (see `robot/blackbox_robot/rover.py`) | your wiring | hardware lane |


## Going to mainnet

Everything is config. Nothing in the code is testnet-specific.

1. `CHAIN=mainnet` (chain 16661). Storage switches to `https://indexer-storage-turbo.0g.ai` (set `STORAGE_NETWORK=mainnet`).
2. **Robot identity:** zerobot is not deployed on mainnet yet. Either deploy zerobot's own contracts (Hardhat scripts in their repo, Apache-2.0), or let `Deploy.s.sol` deploy our ABI-compatible `SimpleRobotRegistry` by leaving `ROBOT_REGISTRY` unset:

   ```bash
   cd contracts && DEPLOYER_PRIVATE_KEY=<key> forge script script/Deploy.s.sol --rpc-url mainnet --broadcast
   ```

3. Set `RPC_URL` to a third-party RPC; the 0G docs call `evmrpc` development-only.
4. Use a dedicated operator wallet with real 0G for Storage fees and gas. Keep `ROBOT_PRIVATE_KEY` only on the robot, ideally in a secure element or HSM.
5. Redeploy the verifier with `?network=mainnet&registry=<mainnet registry>`.
6. Compute is unchanged: the Router and the TEE signer lookup are already mainnet.


## Unsealed fallback (only when no TEE vision provider is healthy)

`0gm-1.0-35b-a3b` is the only TEE vision model on the Router, and it has one provider. When `GET /v1/providers` reports that provider `is_healthy: false`, a Private key cannot reach any image-capable model. Setting `ZG_ATTESTATION=none` (with a Standard-trust key, `ZG_TRUST_MODE=standard` and another vision model such as `qwen3-vl-plus`) lets the demo still run on 0G's Router, Storage and Chain.

It is explicit everywhere, never a silent downgrade:

- The manifest records `policy.attestation = "none"`, so it is anchored with the mission.
- The robot still parses and nonce-checks every answer, but prints a warning at takeoff and skips the TEE signature, signer and binding checks.
- The console badge reads *unsealed, not TEE-attested*, and the verifier shows `WARN` (not `PASS`) on the signer, binding and registry checks, with the reason.
- The default is `ZG_ATTESTATION=tee`. The sealed claims in this README hold only for `tee` runs.

## Not yet verified against live 0G

These were researched from the 0G docs and SDK source but **not exercised with a real `sk-` key** while building. The probe (step 5) checks all of them.

| Assumption | Why it matters | Fallback |
|---|---|---|
| **Signature binding through the Router.** The broker signs `sha256(upstream request):sha256(response bytes)`. The Router adds `x_0g_trace`; we assume it re-marshals Go-style, so removing `x_0g_*` and re-marshalling rebuilds the signed bytes (`go`). `raw` covers pass-through | If neither matches, the robot (correctly) refuses every answer and safe-stops | Call the provider directly (Direct mode via `@0gfoundation/0g-compute-ts-sdk` `getRequestHeaders`), where the response bytes are the signed bytes |
| `0gm-1.0-35b-a3b` accepts an OpenAI `image_url` data URI | The vision call | Try the `anthropic` message format (both are listed as supported) |
| The Router passes `ZG-Res-Key`; otherwise the body id is `chatcmpl-<chatKey>` | Signature lookup | We try header, then stripped body id, then the raw body id |
| Signatures are kept about 20 minutes, in memory, on the broker | The verifier needs them later | We fetch right after each answer and store `{text, signature}` in the entry |
| `/v1/decisions` response schema is undocumented | R16 hold | The parser searches for a probability. If none is found it never holds and records the raw response |
| Testnet Router URL for R17 failover | Second endpoint | Ask at the booth. Failover code is ready (`ZG_ROUTER_ENDPOINTS`) |
| Indexer `GET /file?root=` returns raw bytes for existing files (it returned `{"code":101}` for unknown roots) | Browser verifier | Point the verifier's *Storage source* at a public core (`/api/storage/:root`, SDK download) |
| storagescan URL format `/tx/<hash>` | Links only | Cosmetic |

