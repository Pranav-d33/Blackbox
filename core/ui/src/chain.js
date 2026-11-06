// Reads BlackboxRegistry straight from the 0G chain RPC in the browser: no Blackbox server in the loop.
const GET_MISSION = "0x8bccfc43"; // getMission(bytes32)
const ANCHOR_COUNT = "0x4cad6a99"; // anchorCount(bytes32)
const FIELDS = ["robotId", "robot", "operator", "seedHash", "manifestRoot", "genesisHash", "head", "indexRoot", "trajectoryHash", "count", "startedAt", "closedAt"];
const ZERO = "0x" + "0".repeat(64);

async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

export async function readMissionOnChain({ rpc: url, registry, missionId }) {
  const arg = missionId.replace(/^0x/, "");
  const [block, ret, anchors] = await Promise.all([
    rpc(url, "eth_blockNumber", []),
    rpc(url, "eth_call", [{ to: registry, data: GET_MISSION + arg }, "latest"]),
    rpc(url, "eth_call", [{ to: registry, data: ANCHOR_COUNT + arg }, "latest"]),
  ]);
  const body = ret.slice(2);
  const w = FIELDS.map((_, i) => body.slice(i * 64, i * 64 + 64));
  const o = Object.fromEntries(FIELDS.map((f, i) => [f, "0x" + w[i]]));
  const num = (x) => Number(BigInt(x));
  return {
    block: Number(BigInt(block)),
    registered: o.robot !== ZERO && BigInt(o.robot) !== 0n,
    robot: "0x" + w[1].slice(24),
    operator: "0x" + w[2].slice(24),
    manifestRoot: o.manifestRoot,
    head: o.head,
    indexRoot: o.indexRoot,
    trajectoryHash: o.trajectoryHash,
    count: num(o.count),
    startedAt: num(o.startedAt),
    closedAt: num(o.closedAt),
    anchors: Number(BigInt(anchors)),
    readAt: Date.now(),
  };
}
