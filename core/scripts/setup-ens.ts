/**
 * Give the fleet and its assets ENSv2 names: drone.<parent>, 0g-tee.<parent>, r2m14.solar.<parent>, x12y03.bridge.<parent> …
 *   npm run setup:ens
 *
 * ENS=local    anvil: the dev stand-in from contracts/script/DeployDevEns.s.sol (dev-local.sh runs this).
 * ENS=sepolia  the real ENSv2 deployment, end to end, paid in test stablecoins (no real ETH: Sepolia ETH for gas only):
 *   1. mint MockUSDC (public mint) for the registration fee
 *   2. deploy a Permissioned Resolver and a UserRegistry (the parent's Permissioned Registry) via ENS's VerifiableFactory
 *   3. register <label>.eth on the ETH Registrar (commit, wait 60 s, register) with that resolver and subregistry,
 *      or point an existing name you own at them
 *   4. in the UserRegistry: drone = an ERC-1155 name token owned by the robot key; operator = a token owned by the
 *      core's ENS writer key; 0g-tee, registry, solar, bridge = reserved entries routed to the resolver
 *   5. agent records (addresses, ENSIP-11 address of BlackboxRegistry on 0G Chain) and the default asset record
 *   6. Enhanced Access Control: the writer key (ENS_PRIVATE_KEY, default OPERATOR_PRIVATE_KEY) gets ROLE_SET_TEXT
 *      scoped to the asset text keys only, so the core can file findings but can never repoint an agent's address
 * Idempotent: rerun it after a key or TEE signer changes. Prints the ENS_* lines for .env.
 *
 * Keys: ENS_OWNER_PRIVATE_KEY owns the name (your wallet, needs a little Sepolia ETH); it is only used here.
 */
import { AbiCoder, Contract, Interface, JsonRpcProvider, Wallet, dnsEncode, getAddress, hexlify, id, keccak256, parseEther, randomBytes } from "ethers";
import { loadConfig } from "../src/config";
import { ASSET_KEYS, KEYS, agentNames, evmCoinType } from "../src/ens/names";
import { EnsReader } from "../src/ens/reader";

/** ENSv2 on Sepolia (docs.ens.domains/learn/deployments, checked Nov 2026). */
const SEPOLIA = {
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  mockUSDC: "0x240b0316df57887dbbe58b586508b19e633a14aa", // accepted by the rent price oracle, public mint()
};
// every role and its admin role (docs: Verifiable Factory, "Deploying a Resolver Proxy")
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
const DEFAULT_TEXT = "Blackbox asset. No inspection recorded on ENS yet.";
const YEAR = 365n * 24n * 3600n;
const ZERO = "0x0000000000000000000000000000000000000000";
const ZONES = ["solar", "bridge"];

const RESOLVER = new Interface([
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function multicall(bytes[] data) returns (bytes[])",
  "function grantSetterRoles(bytes setter, address account)",
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
]);
const FACTORY = ["function deployProxy(address implementation, uint256 salt, bytes data)", "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)"];
const REGISTRY = [
  "function getOwner(uint256 anyId) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function getStatus(uint256 anyId) view returns (uint8)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setParent(address parent, string label)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
];
const REGISTRAR = [
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
];
const ERC20 = ["function mint(address to, uint256 amount)", "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];

const cfg = loadConfig();
const e = cfg.ens;
if (!e) throw new Error("ENS=none: set ENS=local or ENS=sepolia");
if (!e.parent) throw new Error("ENS_PARENT is not set (e.g. blackbox-demo.eth)");
const provider = new JsonRpcProvider(e.rpc, e.chainId, { staticNetwork: true });
const ownerKey = process.env.ENS_OWNER_PRIVATE_KEY || e.key;
if (!ownerKey) throw new Error("set ENS_OWNER_PRIVATE_KEY (the wallet that owns the name)");
const owner = new Wallet(ownerKey, provider);
const writer = e.key ? new Wallet(e.key, provider) : owner;
const reader = new EnsReader(e.rpc, e.chainId, e.universalResolver);
const eth = async (a: string) => Number(await provider.getBalance(a)) / 1e18;
const send = async (what: string, p: Promise<any>) => {
  const tx = await p;
  const rc = await tx.wait();
  if (rc?.status !== 1) throw new Error(`${what} reverted (${tx.hash})`);
  console.log(`  ${what.padEnd(34)} ${tx.hash}`);
  return rc;
};

console.log(`ENS network        ${e.network} (${e.chainId})${e.rpc !== "https://ethereum-sepolia-rpc.publicnode.com" ? `  rpc ${e.rpc}` : ""}`);
console.log(`parent name        ${e.parent}`);
console.log(`owner (setup only) ${owner.address}  ${await eth(owner.address)} ETH`);
console.log(`writer (the core)  ${writer.address}  ${await eth(writer.address)} ETH`);

let resolver = e.resolver;
if (e.network === "local") {
  if (!resolver) throw new Error("no dev ENS deployment: run contracts/script/DeployDevEns.s.sol (dev-local.sh does)");
  const ur = new Contract(e.universalResolver, ["function setResolver(bytes name, address resolver)"], owner);
  await send(`setResolver ${e.parent} (dev)`, ur.setResolver(dnsEncode(e.parent, 255), resolver));
  const r = new Contract(resolver, RESOLVER, owner);
  if ((await reader.text(`never-inspected.solar.${e.parent}`, KEYS.description).catch(() => null)) !== DEFAULT_TEXT) await send("default record", r.setText("0x00", KEYS.description, DEFAULT_TEXT));
} else {
  if (e.network !== "sepolia") throw new Error("only ENS=local and ENS=sepolia are scripted");
  const labels = e.parent.split(".");
  if (labels.length !== 2 || labels[1] !== "eth") throw new Error("ENS_PARENT must be a .eth second-level name, e.g. blackbox-demo.eth");
  const label = labels[0];
  const labelhash = BigInt(id(label));
  if ((await eth(owner.address)) < 0.003) throw new Error(`the owner ${owner.address} needs a little Sepolia ETH for gas`);
  const ethReg = new Contract(SEPOLIA.ethRegistry, REGISTRY, owner);
  const registrar = new Contract(SEPOLIA.ethRegistrar, REGISTRAR, owner);
  const factory = new Contract(SEPOLIA.verifiableFactory, FACTORY, owner);
  const deploy = async (what: string, impl: string, salt: bigint, init: string) => {
    // idempotent: the address is CREATE2(owner, salt), so a rerun finds the proxy it deployed before
    const head = await provider.getBlockNumber();
    for (let to = head; to > head - 200000; to -= 10000) {
      const logs = await factory.queryFilter(factory.filters.ProxyDeployed(owner.address), Math.max(0, to - 9999), to).catch(() => []);
      const hit = logs.map((l: any) => l.args).find((a: any) => a && BigInt(a.salt) === salt && getAddress(a.implementation) === getAddress(impl));
      if (hit) {
        console.log(`  ${what.padEnd(34)} ${hit.proxyAddress} (deployed before)`);
        return hit.proxyAddress as string;
      }
    }
    const rc = await send(`deploy ${what}`, factory.deployProxy(impl, salt, init));
    const log = rc.logs.map((l: any) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((l: any) => l?.name === "ProxyDeployed");
    return log.args.proxyAddress as string;
  };
  const salt = (tag: string, x: string) => BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32", "uint256"], [id(tag), x, 1n])));

  const available: boolean = await registrar.isAvailable(label);
  const cur = available ? ZERO : getAddress(await ethReg.getOwner(labelhash));
  if (!available && cur !== owner.address) throw new Error(`${e.parent} is owned by ${cur}, not ${owner.address}. Pick another ENS_PARENT or set ENS_OWNER_PRIVATE_KEY`);

  console.log("\n1. contracts");
  if (!resolver) resolver = await deploy("Permissioned Resolver", SEPOLIA.permissionedResolverImpl, salt("BlackboxResolver", id(e.parent)), RESOLVER.encodeFunctionData("initialize", [[{ account: owner.address, roleBitmap: ALL_ROLES }], []]));
  else console.log(`  Permissioned Resolver              ${resolver} (ENS_RESOLVER)`);
  let sub = process.env.ENS_SUBREGISTRY || (available ? ZERO : await ethReg.getSubregistry(label));
  if (sub === ZERO) sub = await deploy("UserRegistry", SEPOLIA.userRegistryImpl, salt("UserRegistry", id(e.parent)), new Interface(["function initialize((address account, uint256 roleBitmap)[] grants)"]).encodeFunctionData("initialize", [[{ account: owner.address, roleBitmap: ALL_ROLES }]]));
  else console.log(`  UserRegistry                       ${sub}`);

  console.log(`\n2. ${e.parent}`);
  if (available) {
    const usdc = new Contract(SEPOLIA.mockUSDC, ERC20, owner);
    const [base, premium] = await registrar.getRegisterPrice(label, YEAR, SEPOLIA.mockUSDC);
    const cost = base + premium;
    if ((await usdc.balanceOf(owner.address)) < cost) await send("mint test USDC (MockUSDC)", usdc.mint(owner.address, cost * 2n));
    if ((await usdc.allowance(owner.address, SEPOLIA.ethRegistrar)) < cost) await send(`approve ${Number(cost) / 1e6} USDC`, usdc.approve(SEPOLIA.ethRegistrar, cost));
    const secret = hexlify(randomBytes(32));
    const ref = "0x" + "00".repeat(32);
    const c = await registrar.makeCommitment(label, owner.address, secret, sub, resolver, YEAR, ref);
    await send("commit", registrar.commit(c));
    const wait = Number(await registrar.MIN_COMMITMENT_AGE()) + 5;
    console.log(`  waiting ${wait} s (commit-reveal)…`);
    const t0 = (await provider.getBlock("latest"))!.timestamp;
    while ((await provider.getBlock("latest"))!.timestamp < t0 + wait) {
      await new Promise((r) => setTimeout(r, 5000));
      if (/127\.0\.0\.1|localhost/.test(e.rpc)) await provider.send("evm_mine", []).catch(() => {}); // an anvil fork mines only on demand
    }
    await send(`register ${e.parent} (1 year, USDC)`, registrar.register(label, owner.address, secret, sub, resolver, YEAR, SEPOLIA.mockUSDC, ref));
  } else {
    if (getAddress(await ethReg.getResolver(label)) !== getAddress(resolver)) await send("setResolver", ethReg.setResolver(labelhash, resolver));
    if (getAddress(await ethReg.getSubregistry(label)) !== getAddress(sub)) await send("setSubregistry", ethReg.setSubregistry(labelhash, sub));
    console.log("  already registered to you");
  }
  const userReg = new Contract(sub, REGISTRY, owner);
  await send("setParent (canonical name)", userReg.setParent(SEPOLIA.ethRegistry, label)).catch((x) => console.log(`  setParent skipped: ${x.shortMessage ?? x.message}`));

  // 3. subnames in the parent's own Permissioned Registry
  console.log("\n3. subnames (UserRegistry)");
  const expiry = await ethReg.getExpiry(labelhash);
  const robot = process.env.ROBOT_PRIVATE_KEY ? new Wallet(process.env.ROBOT_PRIVATE_KEY).address : null;
  const entries: [string, string | null][] = [["drone", robot], ["operator", writer.address], ["0g-tee", null], ["registry", null], ...ZONES.map((z) => [z, null] as [string, null])];
  for (const [l, who] of entries) {
    if (Number(await userReg.getStatus(BigInt(id(l)))) !== 0) {
      console.log(`  ${`${l}.${e.parent}`.padEnd(34)} already ${who ? `owned by ${await userReg.getOwner(BigInt(id(l)))}` : "reserved"}`);
      continue;
    }
    // owned names get no roles over their entry: the parent keeps control of resolver and subregistry
    await send(`${l}.${e.parent} ${who ? "token -> " + who.slice(0, 10) : "reserved"}`, userReg.register(l, who ?? ZERO, ZERO, resolver, 0n, expiry));
  }
}

// 4. agent records, written by the owner (the core's writer key cannot set addresses)
console.log("\n4. agent records");
const r = new Contract(resolver!, RESOLVER, owner);
const names = agentNames(e.parent);
const robotAddr = process.env.ROBOT_PRIVATE_KEY ? new Wallet(process.env.ROBOT_PRIVATE_KEY).address : null;
let tee: string[] = [];
try {
  const { RouterClient } = await import("../src/zg/router");
  const { ServiceDirectory } = await import("../src/zg/services");
  const { ZgDecider } = await import("../src/zg/decide");
  tee = (await new ZgDecider(cfg, new RouterClient(cfg.zg, { down: false }), new ServiceDirectory(cfg.zg)).allowlist()).signers;
} catch (x) {
  console.log(`  0G TEE signers not read (${(x as Error).message.slice(0, 80)}): 0g-tee address left as is`);
}
const want: [string, string | null, Record<string, string>][] = [
  [names.robot, robotAddr, { [KEYS.role]: "robot", [KEYS.robotId]: cfg.chain.robotId, [KEYS.description]: "Blackbox inspection drone. Signs every log entry with this key." }],
  [names.operator, writer.address, { [KEYS.role]: "operator", [KEYS.description]: "Relays robot-signed anchors to 0G Chain and files findings on ENS. Cannot sign for the robot." }],
  [names.tee, tee[0] ?? null, { [KEYS.role]: "0g-tee-signer", [KEYS.model]: cfg.zg.visionModel, ...(tee.length ? { [KEYS.signers]: tee.join(",") } : {}), [KEYS.description]: "0G sealed inference signer. The robot moves only on answers this key signed." }],
  [names.registry, null, { [KEYS.role]: "registry", [KEYS.chain]: `0g-${cfg.chain.network.name}:${cfg.chain.network.chainId}`, [KEYS.description]: "BlackboxRegistry on 0G Chain: mission roots, anchors and closes." }],
];
const calls: string[] = [];
for (const [name, addr, texts] of want) {
  const dns = dnsEncode(name, 255);
  const have = await reader.record(name, Object.keys(texts));
  if (addr && (!have.addr || getAddress(have.addr) !== getAddress(addr))) calls.push(RESOLVER.encodeFunctionData("setAddress", [dns, 60, addr]));
  for (const [k, v] of Object.entries(texts)) if (v && have.texts[k] !== v) calls.push(RESOLVER.encodeFunctionData("setText", [dns, k, v]));
}
if (cfg.chain.enabled && cfg.chain.registry) {
  const coin = evmCoinType(cfg.chain.network.chainId);
  const cur = await reader.addrFor(names.registry, coin).catch(() => null);
  if (!cur || getAddress(cur) !== getAddress(cfg.chain.registry)) calls.push(RESOLVER.encodeFunctionData("setAddress", [dnsEncode(names.registry, 255), coin, cfg.chain.registry]));
}
if ((await reader.text(`never-inspected.solar.${e.parent}`, KEYS.description).catch(() => null)) !== DEFAULT_TEXT) calls.push(RESOLVER.encodeFunctionData("setText", ["0x00", KEYS.description, DEFAULT_TEXT]));
if (calls.length) await send(`${calls.length} record writes (multicall)`, r.multicall(calls));
else console.log("  up to date");

// 5. EAC: the writer may set only the asset text keys
if (e.network !== "local" && writer.address !== owner.address) {
  console.log("\n5. Enhanced Access Control");
  const grants = ASSET_KEYS.map((k) => RESOLVER.encodeFunctionData("grantSetterRoles", [RESOLVER.encodeFunctionData("setText", ["0x00", k, ""]), writer.address]));
  await send(`writer: ROLE_SET_TEXT on ${ASSET_KEYS.length} keys`, r.multicall(grants));
  if ((await eth(writer.address)) < 0.002) await send("gas for the writer (0.01 ETH)", owner.sendTransaction({ to: writer.address, value: parseEther("0.01") }));
}

console.log(`\ncheck  ${names.robot} -> ${await reader.addr(names.robot)}`);
console.log(`check  never-inspected.solar.${e.parent} -> "${await reader.text(`never-inspected.solar.${e.parent}`, KEYS.description)}"`);
console.log(`\nAdd to .env:\nENS=${e.network}\nENS_PARENT=${e.parent}\nENS_RESOLVER=${resolver}`);
