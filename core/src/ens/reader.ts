/**
 * Reads ENS through the ENSv2 Universal Resolver (browser-safe). One call per record:
 * resolve(dnsEncode(name), text(node, key)) returns (bytes result, address resolver).
 * CCIP-Read (ERC-3668) is on, so names whose resolver answers offchain also work.
 */
import { AbiCoder, Interface, JsonRpcProvider, dnsEncode, namehash } from "ethers";

const UR = new Interface([
  "function resolve(bytes name, bytes data) view returns (bytes result, address resolver)",
  "error ResolverNotFound(bytes name)",
  "error ResolverNotContract(bytes name, address resolver)",
  "error UnsupportedResolverProfile(bytes4 selector)",
  "error ResolverError(bytes errorData)",
]);
const PROFILES = new Interface([
  "function addr(bytes32 node) view returns (address)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
  "function text(bytes32 node, string key) view returns (string)",
]);

export interface EnsRecord {
  name: string;
  resolver: string | null;
  addr: string | null;
  texts: Record<string, string>;
  error?: string;
}

export class EnsReader {
  readonly provider: JsonRpcProvider;
  constructor(
    rpc: string,
    readonly chainId: number,
    readonly universalResolver: string,
  ) {
    this.provider = new JsonRpcProvider(rpc, chainId, { staticNetwork: true });
  }

  private async call(name: string, data: string): Promise<{ result: string; resolver: string } | null> {
    try {
      const ret = await this.provider.call({ to: this.universalResolver, data: UR.encodeFunctionData("resolve", [dnsEncode(name, 255), data]), enableCcipRead: true });
      const [result, resolver] = UR.decodeFunctionResult("resolve", ret);
      return { result, resolver };
    } catch (e: any) {
      // ResolverNotFound / an unset record: the name simply has no answer
      const parsed = e?.data ? UR.parseError(e.data) : null;
      if (parsed?.name === "ResolverNotFound") return null;
      throw e;
    }
  }

  async addr(name: string): Promise<string | null> {
    const r = await this.call(name, PROFILES.encodeFunctionData("addr(bytes32)", [namehash(name)]));
    if (!r) return null;
    const [a] = PROFILES.decodeFunctionResult("addr(bytes32)", r.result);
    return a === "0x0000000000000000000000000000000000000000" ? null : a;
  }

  async addrFor(name: string, coinType: number): Promise<string | null> {
    const r = await this.call(name, PROFILES.encodeFunctionData("addr(bytes32,uint256)", [namehash(name), coinType]));
    if (!r) return null;
    const [b] = PROFILES.decodeFunctionResult("addr(bytes32,uint256)", r.result);
    return b === "0x" ? null : AbiCoder.defaultAbiCoder().decode(["address"], "0x" + b.slice(2).padStart(64, "0"))[0];
  }

  async text(name: string, key: string): Promise<string | null> {
    const r = await this.call(name, PROFILES.encodeFunctionData("text", [namehash(name), key]));
    if (!r) return null;
    const [t] = PROFILES.decodeFunctionResult("text", r.result);
    return t || null;
  }

  /** The address and the given text records of a name, never throwing: errors go in `.error`. */
  async record(name: string, keys: readonly string[]): Promise<EnsRecord> {
    const out: EnsRecord = { name, resolver: null, addr: null, texts: {} };
    try {
      const first = await this.call(name, PROFILES.encodeFunctionData("addr(bytes32)", [namehash(name)]));
      if (!first) return { ...out, error: "no resolver for this name" };
      out.resolver = first.resolver;
      const [a] = PROFILES.decodeFunctionResult("addr(bytes32)", first.result);
      out.addr = a === "0x0000000000000000000000000000000000000000" ? null : a;
      const vals = await Promise.all(keys.map((k) => this.text(name, k)));
      keys.forEach((k, i) => vals[i] && (out.texts[k] = vals[i]!));
    } catch (e) {
      out.error = (e as Error).message.slice(0, 160);
    }
    return out;
  }
}
