"""The robot checks the TEE signer allowlist itself.

The core builds the manifest, and the core is the party the interlock does not
trust. If the robot took the manifest's `tee_signers` on faith, a dishonest core
could list its own key there and sign whatever answer it liked. So before it
flies, the robot checks every allowlisted signer against a source the core does
not control:

  chain   - 0G Compute's InferenceServing contract on 0G mainnet (16661), read
            with plain eth_call over the robot's own RPC. Each signer must be the
            effective TEE signer of a provider in the manifest, acknowledged on
            chain, TEE-verified, and serving the manifest's vision model. Same
            signer rule as the 0G SDK's processResponse().
  pinned  - a list fixed in the robot's own config (ROBOT_TEE_SIGNERS).
  off     - no check. Mock 0G only; the genesis entry records it.
"""
from __future__ import annotations

import json
import urllib.request
from typing import Dict, List, Optional

from eth_abi import decode, encode
from eth_utils import keccak

SERVING_CONTRACT = "0x47340d900bdFec2BD393c626E12ea0656F938d84"
SERVING_RPC = "https://evmrpc.0g.ai"
SERVING_CHAIN_ID = 16661
_GET_SERVICE = keccak(text="getService(address)")[:4]
_SERVICE_T = "(address,string,string,uint256,uint256,uint256,string,string,string,address,bool)"


class SignerCheckError(ValueError):
    pass


def effective_signer(tee_signer_address: str, additional_info: str) -> str:
    """Mirrors core/src/zg/services.ts effectiveSigner()."""
    try:
        info = json.loads(additional_info or "{}")
        centralized = info.get("ProviderType") == "centralized"
        if info.get("TargetSeparated") is True and not centralized and info.get("TargetTeeAddress"):
            return info["TargetTeeAddress"]
    except Exception:  # noqa: BLE001
        pass
    return tee_signer_address


class ServingReader:
    """Reads InferenceServing.getService(provider) with eth_call; no key, no SDK."""

    def __init__(self, rpc: str = SERVING_RPC, contract: str = SERVING_CONTRACT, timeout: float = 15.0):
        self.rpc, self.contract, self.timeout = rpc, contract, timeout

    def _call(self, method: str, params: list):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        req = urllib.request.Request(self.rpc, body, {"content-type": "application/json",
                                                       "user-agent": "blackbox-robot/1.0"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            j = json.load(r)
        if "error" in j:
            raise SignerCheckError(f"{method}: {j['error']}")
        return j["result"]

    def service(self, provider: str) -> dict:
        if int(self._call("eth_chainId", []), 16) != SERVING_CHAIN_ID:
            raise SignerCheckError(f"{self.rpc} is not 0G mainnet ({SERVING_CHAIN_ID})")
        data = "0x" + (_GET_SERVICE + encode(["address"], [provider])).hex()
        res = self._call("eth_call", [{"to": self.contract, "data": data}, "latest"])
        (s,) = decode([_SERVICE_T], bytes.fromhex(res[2:]))
        return {"provider": s[0], "url": s[2], "model": s[6], "verifiability": s[7],
                "additional_info": s[8], "signer": effective_signer(s[9], s[8]), "acknowledged": bool(s[10])}


class SignerCheck:
    def __init__(self, mode: str = "chain", pinned: Optional[List[str]] = None,
                 reader: Optional[ServingReader] = None):
        if mode not in ("chain", "pinned", "off"):
            raise ValueError(f"unknown signer check mode {mode!r}")
        if mode == "pinned" and not pinned:
            raise ValueError("pinned signer check needs ROBOT_TEE_SIGNERS")
        self.mode = mode
        self.pinned = {a.lower() for a in pinned or []}
        self.reader = reader or ServingReader()

    def check(self, manifest: dict) -> Dict:
        """Raises SignerCheckError unless every allowlisted signer checks out. Returns a record for the log."""
        signers = [s.lower() for s in manifest.get("policy", {}).get("tee_signers", [])]
        if self.mode == "off":
            return {"mode": "off", "signers": signers}
        if self.mode == "pinned":
            extra = [s for s in signers if s not in self.pinned]
            if extra:
                raise SignerCheckError(f"TEE signer {extra[0]} is not pinned in this robot's config")
            return {"mode": "pinned", "signers": signers}

        model = str(manifest.get("policy", {}).get("vision_model", "")).lower()
        providers = (manifest.get("compute") or {}).get("providers") or []
        found: Dict[str, dict] = {}
        for p in providers:
            addr = p.get("provider")
            if not isinstance(addr, str):
                continue
            try:
                svc = self.reader.service(addr)
            except SignerCheckError:
                raise
            except Exception as e:  # noqa: BLE001
                raise SignerCheckError(f"cannot read InferenceServing for {addr}: {e.__class__.__name__}: {e}")
            if not svc["acknowledged"] or "tee" not in svc["verifiability"].lower():
                continue
            if model and svc["model"].lower() != model:
                continue
            found[svc["signer"].lower()] = {"provider": svc["provider"], "verifiability": svc["verifiability"],
                                            "model": svc["model"]}
        for s in signers:
            if s not in found:
                raise SignerCheckError(
                    f"TEE signer {s} is not the acknowledged signer of any {model or 'TEE'} provider "
                    f"in InferenceServing {self.reader.contract} on 0G mainnet")
        return {"mode": "chain", "contract": self.reader.contract, "chain_id": SERVING_CHAIN_ID,
                "rpc": self.reader.rpc, "signers": [{"signer": s, **found[s]} for s in signers]}
