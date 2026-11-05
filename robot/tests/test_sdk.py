import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

from blackbox_robot.crypto import checkpoint_nonce, expected_echo  # noqa: E402
from blackbox_robot.interlock import verify_bundle  # noqa: E402
from blackbox_robot.mission import MissionSim  # noqa: E402
from blackbox_robot.physics import available_backends  # noqa: E402
from blackbox_robot.sdk import Robot, check_policy_fits, make_world  # noqa: E402
from blackbox_robot.solar_world import SolarWorld  # noqa: E402
from blackbox_robot.world import World  # noqa: E402
from helpers import TEE, make_bundle, manifest  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SCENARIOS = os.path.join(HERE, "..", "..", "scenarios")
MID = "0x" + "ab" * 32


def profile(name):
    with open(os.path.join(SCENARIOS, f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


def solar_policy():
    p = profile("solar-farm")
    pol = manifest(MID, "0x" + "55" * 20)["policy"]
    pol.update(labels=p["decision"]["labels"], actions=p["decision"]["actions"],
               severity_max=p["decision"]["severity_max"])
    return pol


def signed(label, action, severity=2, policy=None):
    nonce = checkpoint_nonce(MID, "0x" + "cd" * 32, 0)
    want = expected_echo(nonce, 64)
    b = make_bundle(MID, 0, {"nonce": want, "label": label, "severity": severity, "action": action})
    return verify_bundle(b, policy or manifest(MID, "0x" + "55" * 20)["policy"], nonce)


class ProfileVocabularyTest(unittest.TestCase):
    def test_solar_label_accepted_under_solar_profile(self):
        r = signed("cracked_cell", "descend", policy=solar_policy())
        self.assertTrue(r["accepted"], r["reason"])

    def test_solar_label_refused_under_default_profile(self):
        r = signed("cracked_cell", "descend")
        self.assertFalse(r["accepted"])
        self.assertIn("label", r["reason"])

    def test_deck_label_refused_under_solar_profile(self):
        r = signed("crack", "descend", policy=solar_policy())
        self.assertFalse(r["accepted"])

    def test_severity_bound_comes_from_profile(self):
        pol = dict(solar_policy(), severity_max=1)
        self.assertFalse(signed("cracked_cell", "descend", severity=2, policy=pol)["accepted"])

    def test_profile_cannot_grant_actions_the_robot_lacks(self):
        with self.assertRaises(ValueError):
            check_policy_fits({"actions": ["descend", "fly_away"]}, MissionSim.ACTIONS)
        check_policy_fits(solar_policy(), MissionSim.ACTIONS)


class WorldRegistryTest(unittest.TestCase):
    def test_manifest_names_the_world(self):
        p = profile("solar-farm")
        w = make_world(dict(p["sim"], world=p["world"]), 1)
        self.assertIsInstance(w, SolarWorld)
        self.assertEqual(len(w.rows_mm()), p["world"]["rows"])

    def test_old_manifests_get_the_concrete_deck(self):
        self.assertIs(type(make_world({"deck_mm": [24000, 8000]}, 1)), World)

    def test_unknown_world_is_an_error(self):
        with self.assertRaises(ValueError):
            make_world({"deck_mm": [1000, 1000], "world": {"kind": "moon"}}, 1)

    def test_solar_detector_flags_defects_not_the_clean_field(self):
        w = SolarWorld(36000, 16000, 3)
        flagged = lambda: sum(1 for row in w.anomaly for v in row if v >= 10)  # noqa: E731
        self.assertEqual(flagged(), 0)
        w.add_defect("cracked_cell", 9000, 2000, 0)
        n = flagged()
        self.assertGreater(n, 0)
        w.add_defect("soiling", 20000, 6000, 0)
        self.assertGreater(flagged(), n)


@unittest.skipUnless("mujoco" in available_backends(), "mujoco not installed")
class MuJoCoDroneTest(unittest.TestCase):
    def fly(self):
        p = profile("solar-farm")
        sim = MissionSim(MID, 11, dict(p["sim"], world=p["world"], backend="mujoco"))
        self.assertIsInstance(sim, Robot)
        sim.place("cracked_cell", 8000, 2000, 0)
        sim.place("soiling", 20000, 6000, 0)
        sim.start()
        tilt = 0.0
        while True:
            ev = sim.step()
            q = sim.body.attitude()
            tilt = max(tilt, abs(q[1]) + abs(q[2]))
            if ev and ev["type"] == "checkpoint":
                sim.resolve("descend" if ev["target_mm"][0] < 14000 else "continue")
            if ev and ev["type"] == "done":
                sim.close()
                return ev, sim.inspected, tilt

    def test_survey_is_deterministic_and_tilts_to_fly(self):
        a, inspected, tilt = self.fly()
        b, _, _ = self.fly()
        self.assertEqual(a["final"], "landed")
        self.assertEqual(a["trajectory_hash"], b["trajectory_hash"])
        self.assertEqual(len(inspected), 1)
        self.assertGreater(tilt, 0.05)  # rotor thrust, not a pushed box


if __name__ == "__main__":
    unittest.main()
