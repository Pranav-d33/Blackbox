/**
 * Writes Blackbox's ENS records with the ENSv2 Permissioned Resolver setters
 * (DNS-encoded name, batched in one multicall per update). The operator's ENS key holds
 * the resolver roles; records are an address book that points at the robot-signed log.
 * They are not a trust root: the verifier checks every record against the log and the chain.
 */
import { Contract, Interface, JsonRpcProvider, Wallet, dnsEncode, getAddress } from "ethers";
import type { Config } from "../config";
import { SerialQueue } from "../lib/queue";
import { ASSET_KEYS, KEYS, type AgentRole, type EnsSection, agentNames, assetName, evmCoinType } from "./names";
import { EnsReader } from "./reader";

const RESOLVER = new Interface([
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function multicall(bytes[] data) returns (bytes[] results)",
]);

export interface AssetUpdate {
  label: string;
  description: string;
  finding: string;
  mission: string;
  entry: string;
  url: string;
}

export interface EnsAssetState {
  name: string;
  finding: string;
  description: string;
  tx: string | null;
  status: "queued" | "written" | "error";
  error?: string;
}

export class EnsWriter {
  readonly reader: EnsReader;
  private wallet: Wallet;
  private resolver: Contract;
  private queue = new SerialQueue();

  constructor(private cfg: NonNullable<Config["ens"]>) {
    const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true });
    this.wallet = new Wallet(cfg.key, provider);
    this.resolver = new Contract(cfg.resolver, RESOLVER, this.wallet);
    this.reader = new EnsReader(cfg.rpc, cfg.chainId, cfg.universalResolver);
  }

  get parent() {
    return this.cfg.parent;
  }

  /** What goes into the manifest: which ENS names this mission claims, fixed before takeoff. */
  section(zone: string | null): EnsSection {
    return { network: this.cfg.network, chain_id: this.cfg.chainId, universal_resolver: this.cfg.universalResolver, parent: this.cfg.parent, zone, names: agentNames(this.cfg.parent) };
  }

  private async send(calls: string[]): Promise<string | null> {
    if (!calls.length) return null;
    const tx = await this.resolver.multicall(calls);
    const rc = await tx.wait();
    if (rc?.status !== 1) throw new Error(`ENS multicall reverted (${tx.hash})`);
    return tx.hash as string;
  }

  /** Point the agent names at the current keys. Reads first and writes only what differs. */
  publishAgents(a: { robot: string; robotId: string; operator: string; teeSigners: string[]; model: string; registry: string | null; chain: { chainId: number; network: string } | null }) {
    return this.queue.run(async () => {
      const names = agentNames(this.cfg.parent);
      const want: { role: AgentRole; addr: string | null; coin?: { type: number; addr: string }; texts: Record<string, string> }[] = [
        { role: "robot", addr: a.robot, texts: { [KEYS.role]: "robot", [KEYS.robotId]: a.robotId, [KEYS.description]: "Blackbox inspection drone. Signs every log entry with this key." } },
        { role: "operator", addr: a.operator, texts: { [KEYS.role]: "operator", [KEYS.description]: "Relays robot-signed anchors to 0G Chain and pays 0G Storage. Cannot sign for the robot." } },
        { role: "tee", addr: a.teeSigners[0] ?? null, texts: { [KEYS.role]: "0g-tee-signer", [KEYS.model]: a.model, [KEYS.signers]: a.teeSigners.join(","), [KEYS.description]: "0G sealed inference signer. The robot moves only on answers this key signed." } },
      ];
      if (a.registry && a.chain)
        want.push({ role: "registry", addr: null, coin: { type: evmCoinType(a.chain.chainId), addr: a.registry }, texts: { [KEYS.role]: "registry", [KEYS.chain]: `0g-${a.chain.network}:${a.chain.chainId}`, [KEYS.description]: "BlackboxRegistry on 0G Chain: mission roots, anchors and closes." } });
      const calls: string[] = [];
      for (const w of want) {
        const name = names[w.role];
        const dns = dnsEncode(name, 255);
        const have = await this.reader.record(name, Object.keys(w.texts));
        if (w.addr && (!have.addr || getAddress(have.addr) !== getAddress(w.addr))) calls.push(RESOLVER.encodeFunctionData("setAddress", [dns, 60, w.addr]));
        if (w.coin) {
          const cur = await this.reader.addrFor(name, w.coin.type).catch(() => null);
          if (!cur || getAddress(cur) !== getAddress(w.coin.addr)) calls.push(RESOLVER.encodeFunctionData("setAddress", [dns, w.coin.type, w.coin.addr]));
        }
        for (const [k, v] of Object.entries(w.texts)) if (have.texts[k] !== v) calls.push(RESOLVER.encodeFunctionData("setText", [dns, k, v]));
      }
      // On a real ENS the agent records belong to the name owner (setup:ens); the core's key holds text roles only.
      if (calls.length && this.cfg.network !== "local")
        throw new Error(`${calls.length} agent record(s) on ENS differ from this mission's keys (e.g. a new TEE signer): rerun npm run setup:ens as the owner of ${this.cfg.parent}`);
      return { tx: await this.send(calls), writes: calls.length, names };
    });
  }

  /** One inspected asset: what 0G decided there, in which mission, and which robot-signed entry says so. */
  publishAsset(zone: string, u: AssetUpdate) {
    return this.queue.run(async () => {
      const dns = dnsEncode(assetName(u.label, zone, this.cfg.parent), 255);
      const texts: Record<string, string> = {
        [KEYS.description]: u.description,
        [KEYS.finding]: u.finding,
        [KEYS.mission]: u.mission,
        [KEYS.entry]: u.entry,
        [KEYS.checked]: new Date().toISOString(),
        [KEYS.url]: u.url,
      };
      // pointer mode: no readable finding on ENS, only where the robot-signed decision is
      const keys = this.cfg.records === "pointer" ? [KEYS.mission, KEYS.entry, KEYS.checked] : ASSET_KEYS;
      return this.send(keys.map((k) => RESOLVER.encodeFunctionData("setText", [dns, k, texts[k]])));
    });
  }
}
