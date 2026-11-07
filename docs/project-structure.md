# Project structure

```
.
├── README.md                    you are here
├── .env.example                 every setting; values you must fill are marked  <-- SET ME
├── package.json                 root scripts: setup, dev:local, test, robot, core, verify, probe, replay
├── scripts/dev-local.sh         one command: anvil + contracts + mock 0G + core + robot (offline)
├── scenarios/                   mission profiles: solar-farm.json, bridge-deck.json (incl. the asset register)
├── docs/                        why-0g.md (the narrative), demo-script.md (video and booth)
│
├── contracts/                   Foundry, solc 0.8.27, evm cancun
│   ├── src/BlackboxRegistry.sol      register / anchor / close missions; robot-signed (EIP-191), relayable; zerobot isOperator()
│   ├── src/SimpleRobotRegistry.sol   zerobot-compatible stand-in for anvil / mainnet (zerobot is Galileo-only today)
│   ├── src/interfaces/IRobotRegistry.sol  zerobot RobotRegistry subset (struct copied verbatim)
│   ├── script/Deploy.s.sol           deploys, writes deployments/<chainId>.json
│   └── test/BlackboxRegistry.t.sol   10 tests: happy path, forged signer, replayed digest, stale count, revoked operator…
│
├── robot/                       Python 3.9+ (3.11 recommended); the only process with the robot key
│   ├── blackbox_robot/
│   │   ├── sdk.py               Robot interface, world registry, profile vocabulary checks, 3D texture
│   │   ├── world.py             seeded concrete deck, 5 crack + 2 decoy variants, camera crops, anomaly map
│   │   ├── solar_world.py       solar farm: PV module rows, 3 cracked-cell + 2 soiling variants
│   │   ├── mujoco_drone.py      Skydio X2 quadrotor: SE(3) attitude control, rotor mixing
│   │   ├── models/skydio_x2/    MJCF model and mesh from MuJoCo Menagerie (Apache-2.0)
│   │   ├── physics.py           backends: mujoco (default), pybullet, dependency-free "native"
│   │   ├── mission.py           deterministic lawnmower survey, checkpoints, outcomes, trajectory hash
│   │   ├── interlock.py         verify before actuate (parse, nonce, TEE signer, signature binding)
│   │   ├── episode_log.py       canonical JSON + keccak256 chain + robot EIP-191 signatures
│   │   ├── adapter.py           HTTP service: lease watchdog, safe stop, outbox, anchor signing
│   │   ├── replay.py            replay CLI + counterfactual ("force continue")
│   │   ├── rover.py             real-hardware twin (Pi, gpiozero, picamera2), UNTESTED on hardware
│   │   └── probe_images.py      writes the Gate A probe crops
│   ├── assets/probe/            crack-*.png, decoy-*.png used by `npm run probe`
│   └── tests/                   unittest: interlock, adapter flow, lease safe stop, replay; cross-language vectors
│
└── core/                        TypeScript (Node 20+), run with tsx
    ├── src/server.ts            HTTP: console, robot-facing API, demo controls, verifier API
    ├── src/mission.ts           manifest (with the profile), registerMission, checkpoint relay, writer queue, anchors, close, demo hooks
    ├── src/profile.ts           mission profile loader and validation
    ├── src/zg/router.ts         0G Router client (trust mode, failover, kill switch)
    ├── src/zg/services.ts       InferenceServing.getService() reader + /v1/proxy/signature fetch
    ├── src/zg/decide.ts         prompt contract, vision call, bundle, R16 decision model
    ├── src/storage/index.ts     0G Storage (MemData + Indexer) and local dev store
    ├── src/arkiv/               Arkiv: entity schemas, batched writer, browser-safe reads (history, analytics, mirror)
    ├── src/chain/               BlackboxRegistry + RobotRegistry ABIs and client
    ├── src/lib/                 canonical/Go JSON, interlock mirror, serial queue
    ├── src/verifier/            isomorphic verifier (core.ts), CLI, browser bundle entry
    ├── src/mock0g/              DEV-ONLY Router + broker emulator (never a fallback)
    ├── scripts/                 probe-0g.ts (Gate A), setup-robot.ts (zerobot), arkiv-register.ts, arkiv-bench.ts, keys.ts
    ├── test/crosslang.test.ts   Python and TypeScript must agree byte-for-byte
    ├── ui/                      operator console source (React + Tailwind, Vite): `npm run build:console` builds it into web/
    └── web/                     launch page, built console (console.html), 3D scene (scene3d.js), public verifier (verify.html)
                                 vendor/: three.js, qrcode, the X2 mesh (served locally, works offline)
```

