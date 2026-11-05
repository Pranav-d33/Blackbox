import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

from eth_account import Account  # noqa: E402

from blackbox_robot.adapter import Adapter  # noqa: E402
from blackbox_robot.crypto import RobotKey  # noqa: E402
from blackbox_robot.tee_registry import ServingReader, SignerCheck, SignerCheckError, effective_signer  # noqa: E402
from helpers import TEE, manifest  # noqa: E402

MID = "0x" + "ab" * 32
PROVIDER = "0x" + "22" * 20
CORE_KEY = Account.from_key("0x" + "99" * 32)  # a dishonest core's own key


class FakeReader(ServingReader):
    def __init__(self, records):
        super().__init__()
        self.records = records

    def service(self, provider):
        return self.records[provider.lower()]


def record(signer=TEE.address, acknowledged=True, verifiability="TeeML", model="0GM-1.0-35B-A3B"):
    return {"provider": PROVIDER, "url": "http://test", "model": model, "verifiability": verifiability,
            "additional_info": "{}", "signer": signer, "acknowledged": acknowledged}


def with_compute(m, signers):
    m["policy"]["tee_signers"] = signers
    m["policy"]["vision_model"] = "0gm-1.0-35b-a3b"
    m["compute"] = {"providers": [{"provider": PROVIDER, "signer": signers[0]}]}
    return m


class SignerCheckTest(unittest.TestCase):
    def check(self, rec, signers):
        return SignerCheck("chain", reader=FakeReader({PROVIDER: rec})).check(
            with_compute(manifest(MID, "0x0"), signers))

    def test_accepts_the_acknowledged_signer(self):
        out = self.check(record(), [TEE.address])
        self.assertEqual(out["mode"], "chain")
        self.assertEqual(out["signers"][0]["signer"], TEE.address.lower())

    def test_refuses_a_signer_the_core_slipped_in(self):
        with self.assertRaisesRegex(SignerCheckError, "not the acknowledged signer"):
            self.check(record(), [TEE.address, CORE_KEY.address])

    def test_refuses_unacknowledged_or_non_tee_or_other_model(self):
        for rec in (record(acknowledged=False), record(verifiability="none"), record(model="qwen3-vl-plus")):
            with self.assertRaises(SignerCheckError):
                self.check(rec, [TEE.address])

    def test_pinned(self):
        m = with_compute(manifest(MID, "0x0"), [CORE_KEY.address])
        with self.assertRaisesRegex(SignerCheckError, "not pinned"):
            SignerCheck("pinned", [TEE.address]).check(m)
        self.assertEqual(SignerCheck("pinned", [CORE_KEY.address]).check(m)["mode"], "pinned")

    def test_separated_target_signer(self):
        info = json.dumps({"TargetSeparated": True, "TargetTeeAddress": "0xabc"})
        self.assertEqual(effective_signer("0xdef", info), "0xabc")
        self.assertEqual(effective_signer("0xdef", "{}"), "0xdef")

    def test_adapter_refuses_the_manifest_before_takeoff(self):
        tmp = tempfile.mkdtemp()
        try:
            key = RobotKey.generate()
            ad = Adapter(key, "http://127.0.0.1:9", tmp, speed=60.0,
                         signer_check=SignerCheck("chain", reader=FakeReader({PROVIDER: record()})))
            bad = with_compute(manifest(MID, key.address), [CORE_KEY.address])
            with self.assertRaises(SignerCheckError):
                ad.prepare({"manifest_text": json.dumps(bad), "manifest_root": "0x" + "55" * 32})
            self.assertIsNone(ad.manifest)
            good = with_compute(manifest(MID, key.address), [TEE.address])
            ad.prepare({"manifest_text": json.dumps(good), "manifest_root": "0x" + "55" * 32})
            self.assertEqual(ad.log.entries[0]["body"]["tee_signer_check"]["mode"], "chain")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


@unittest.skipUnless(os.environ.get("BLACKBOX_LIVE"), "set BLACKBOX_LIVE=1 to read 0G mainnet")
class LiveServingTest(unittest.TestCase):
    def test_0gm_provider_has_an_acknowledged_tee_signer(self):
        svc = ServingReader().service("0xf4FB8d2bD856e672b5f9848b0eD235A20079B250")
        self.assertTrue(svc["acknowledged"])
        self.assertIn("tee", svc["verifiability"].lower())
        self.assertEqual(svc["model"].lower(), "0gm-1.0-35b-a3b")


if __name__ == "__main__":
    unittest.main()
