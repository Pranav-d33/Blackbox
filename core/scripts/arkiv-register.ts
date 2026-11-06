/**
 * Publish a site's asset register to Arkiv from the site owner's wallet: one blackbox.asset entity per
 * PV module (136) or deck square (192), with its maker, model, batch and warranty.
 *   npm run arkiv:register -- --scenario solar-farm
 *
 * The owner, not the inspector, owns these entities: an inspector can read the register to tag its
 * findings, but cannot change who made a panel. ARKIV_OWNER_PRIVATE_KEY is that wallet. If it is not set,
 * a fresh owner key is generated, added to .env and funded with a little tGLM from the inspector's wallet.
 * Idempotent: assets already registered by this owner are skipped.
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { i32 } from "@arkiv-network/sdk/schema";
import { formatEther, http, parseEther, stringToBytes, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { REPO_ROOT, loadConfig } from "../src/config";
import { allAssets, loadProfile, registerOf } from "../src/profile";
import { Asset } from "../src/arkiv/schema";
import { arkivPublic } from "../src/arkiv/read";

const cfg = loadConfig();
const a = cfg.arkiv;
if (!a) throw new Error("set ARKIV=rabdi in .env");
const arg = (k: string) => process.argv.find((x, i) => process.argv[i - 1] === `--${k}`);
const ids = arg("scenario") ? [arg("scenario")!] : ["solar-farm", "bridge-deck"];
const chain = rabdi({ accessKey: a.accessKey });
const pub = arkivPublic(a.accessKey);
const writer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(a.key as Hex) });

let ownerKey = process.env.ARKIV_OWNER_PRIVATE_KEY as Hex | undefined;
if (!ownerKey) {
  ownerKey = generatePrivateKey();
  appendFileSync(resolve(REPO_ROOT, process.env.BLACKBOX_ENV ?? ".env"), `\n# the site owner's wallet on Arkiv (owns the asset register), made by npm run arkiv:register\nARKIV_OWNER_PRIVATE_KEY=${ownerKey}\n`);
  console.log("generated a site-owner key and added ARKIV_OWNER_PRIVATE_KEY to .env");
}
const owner = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(ownerKey) });
const bal = async (x: Hex) => Number(formatEther(await pub.getBalance({ address: x })));
console.log(`inspector (core) ${writer.account.address}  ${await bal(writer.account.address)} tGLM`);
console.log(`site owner       ${owner.account.address}  ${await bal(owner.account.address)} tGLM`);
if (owner.account.address !== writer.account.address && (await bal(owner.account.address)) < 0.01) {
  if ((await bal(writer.account.address)) < 0.05) throw new Error(`fund ${writer.account.address} at https://hub.arkiv.network/faucet first`);
  const tx = await writer.sendTransaction({ to: owner.account.address, value: parseEther("0.02") });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`funded the owner with 0.02 tGLM  ${tx}`);
}

for (const id of ids) {
  const p = loadProfile(id);
  if (!p.register) throw new Error(`${id} has no register in its profile`);
  const have = new Set<string>();
  for (let n = 0; ; n += 100) {
    const r = await pub.select({ asset: true }).from(Asset).ownedBy(owner.account.address).where(eq("site", id)).limit(100).offset(n).fetch();
    r.entities.forEach((e: any) => have.add(e.asset.value ?? e.asset));
    if (r.entities.length + r.skipped < 100) break;
  }
  const todo = allAssets(p).filter((x) => !have.has(x));
  console.log(`\n${id}: ${have.size} registered, ${todo.length} to write`);
  for (let i = 0; i < todo.length; i += 40) {
    const creates = todo.slice(i, i + 40).map((asset) => {
      const g = registerOf(p, asset)!;
      return {
        schema: Asset,
        values: { site: id, asset, maker: g.maker, model: g.model, batch: g.batch, installed: i32(g.installed), warranty_until: i32(g.warranty_until), detail: stringToBytes(JSON.stringify({ unit: p.assets?.unit ?? "asset", note: p.register!.note ?? "" })) },
        expiration: ExpirationTime.fromDays(Math.min(91, a.retentionDays)),
      };
    });
    const t0 = Date.now();
    const r = await owner.executeBatch({ creates } as any);
    const rc = await pub.waitForTransactionReceipt({ hash: r.txHash });
    console.log(`  ${creates.length} assets  gas ${rc.gasUsed}  ${Date.now() - t0} ms  ${r.txHash}`);
  }
}
const q = pub.select({ asset: true, maker: true, batch: true }).from(Asset).where(eq("site", ids[0])).limit(3);
console.log(`\nexample query  ${q.toString()}`);
console.log((await q.fetch()).entities.map((e: any) => `  ${e.asset.value} ${e.maker.value} ${e.batch.value}`).join("\n"));
