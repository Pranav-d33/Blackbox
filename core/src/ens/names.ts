/**
 * ENS names for a Blackbox fleet (browser-safe, shared with the verifier).
 *
 *   drone.<parent>              the robot key that signs every log entry
 *   operator.<parent>           the wallet that relays to 0G Chain and pays 0G Storage
 *   0g-tee.<parent>             the 0G TEE signer the robot accepts answers from
 *   registry.<parent>           BlackboxRegistry on 0G Chain (ENSIP-11 address for that chain)
 *   <asset>.<zone>.<parent>     one inspected asset: r2m14.solar.<parent> (PV module), x12y03.bridge.<parent> (1 m² deck square)
 *
 * Every subname is a record on the parent's ENSv2 Permissioned Resolver, served by wildcard
 * resolution through the Universal Resolver. No token per panel or square.
 */

export const AGENTS = { robot: "drone", operator: "operator", tee: "0g-tee", registry: "registry" } as const;
export type AgentRole = keyof typeof AGENTS;

/** Text record keys Blackbox writes. ENSIP-5 standard keys plus a `blackbox.` namespace. */
export const KEYS = {
  description: "description",
  url: "url",
  role: "blackbox.role",
  robotId: "blackbox.robot_id",
  model: "blackbox.model",
  signers: "blackbox.tee_signers",
  chain: "blackbox.chain",
  finding: "blackbox.finding",
  mission: "blackbox.mission",
  entry: "blackbox.entry",
  checked: "blackbox.checked",
} as const;

export const ASSET_KEYS = [KEYS.description, KEYS.finding, KEYS.mission, KEYS.entry, KEYS.checked, KEYS.url];

export interface EnsSection {
  /** ENS network: sepolia | mainnet | local (anvil, dev stand-in) */
  network: string;
  chain_id: number;
  universal_resolver: string;
  parent: string;
  zone: string | null;
  names: Record<AgentRole, string>;
}

export const agentNames = (parent: string): Record<AgentRole, string> =>
  Object.fromEntries(Object.entries(AGENTS).map(([role, label]) => [role, `${label}.${parent}`])) as Record<AgentRole, string>;

export const assetName = (label: string, zone: string, parent: string) => `${label}.${zone}.${parent}`;

/** ENSIP-11 coin type for an EVM chain, e.g. 0G Galileo (16602). */
export const evmCoinType = (chainId: number) => (0x80000000 | chainId) >>> 0;

/** `blackbox.finding` = label/severity/action, e.g. "cracked_cell/2/descend" or "safe_stop/-/safe_stop". */
export const finding = (label: string, severity: number | string, action: string) => `${label}/${severity}/${action}`;
export function parseFinding(v: string | null | undefined) {
  const m = /^([a-z_]+)\/([0-9-]+)\/([a-z_]+)$/.exec(v ?? "");
  return m ? { label: m[1], severity: m[2] === "-" ? null : Number(m[2]), action: m[3] } : null;
}

/** Public ENS app link for a name, when the network has one. */
export function ensAppUrl(network: string, name: string): string | null {
  if (network === "mainnet") return `https://app.ens.domains/${name}`;
  if (network === "sepolia") return `https://sepolia.app.ens.domains/${name}`;
  return null;
}

/** Network facts (docs.ens.domains/learn/deployments, checked Nov 2026). */
export const ENS_NETWORKS: Record<string, { chainId: number; rpc: string; universalResolver: string }> = {
  sepolia: { chainId: 11155111, rpc: "https://ethereum-sepolia-rpc.publicnode.com", universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" },
  mainnet: { chainId: 1, rpc: "https://ethereum-rpc.publicnode.com", universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" },
  local: { chainId: 31337, rpc: "http://127.0.0.1:8545", universalResolver: "" },
};
