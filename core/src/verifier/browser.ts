/** Browser entry for web/verify.html: `npm run build:web` bundles this to web/verifier.bundle.js. */
import { loadFromChain, verifyMission } from "./core";
import { NETWORK_DEFAULTS } from "./networks";
import { EnsReader } from "../ens/reader";
import { ENS_NETWORKS, KEYS } from "../ens/names";

/** An ENS name (r2m14.solar.blackbox-demo.eth) to the mission that last inspected it: its blackbox.mission record. */
async function missionFromEns(name: string, ens: { network: string; rpc?: string; universalResolver?: string }) {
  const n = ENS_NETWORKS[ens.network];
  if (!n) throw new Error(`unknown ENS network ${ens.network}`);
  const r = new EnsReader(ens.rpc || n.rpc, n.chainId, ens.universalResolver || n.universalResolver);
  const mission = await r.text(name, KEYS.mission);
  if (!mission) throw new Error(`${name} has no ${KEYS.mission} record on ENS ${ens.network}`);
  return { mission, description: await r.text(name, KEYS.description) };
}

(globalThis as any).BlackboxVerifier = { loadFromChain, verifyMission, NETWORK_DEFAULTS, missionFromEns };
