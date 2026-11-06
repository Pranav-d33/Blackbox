/**
 * Mint test stablecoins on Sepolia to the ENS key, to pay an ENSv2 name registration.
 *   npm run ens:faucet
 * The ENSv2 deployment's MockUSDC and the docs' test USDC both have a public mint(). Needs a little Sepolia ETH for gas.
 */
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { loadConfig } from "../src/config";
import { ENS_NETWORKS } from "../src/ens/names";

const TOKENS = [
  { name: "MockUSDC (ENSv2 deployment)", address: "0x240b0316df57887dbbe58b586508b19e633a14aa", decimals: 6 },
  { name: "test USDC (ENS docs)", address: "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e", decimals: 6 },
];

const cfg = loadConfig();
const key = cfg.ens?.key || process.env.ENS_PRIVATE_KEY || process.env.OPERATOR_PRIVATE_KEY;
if (!key) throw new Error("set ENS_PRIVATE_KEY or OPERATOR_PRIVATE_KEY");
const s = ENS_NETWORKS.sepolia;
const provider = new JsonRpcProvider(process.env.ENS_RPC_URL || s.rpc, s.chainId, { staticNetwork: true });
const w = new Wallet(key, provider);
const eth = Number(await provider.getBalance(w.address)) / 1e18;
console.log(`ENS key  ${w.address}  ${eth} Sepolia ETH`);
if (eth === 0) throw new Error("no Sepolia ETH for gas: fund this address from a Sepolia faucet first");
for (const t of TOKENS) {
  const c = new Contract(t.address, ["function mint(address to, uint256 amount)", "function balanceOf(address) view returns (uint256)"], w);
  const tx = await c.mint(w.address, 100n * 10n ** BigInt(t.decimals));
  await tx.wait();
  console.log(`minted 100 ${t.name}  balance ${Number(await c.balanceOf(w.address)) / 10 ** t.decimals}  tx ${tx.hash}`);
}
console.log("\nNow register your name at https://sepolia.app.ens.domains with this wallet, paying in USDC.");
