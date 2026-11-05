"""Blackbox robot SDK: what a robot integration plugs into.

A robot joins Blackbox by implementing `Robot` (motion stays on the device) and,
for a simulated robot, a `World` the camera reads from. Everything mission
specific - which labels the sealed model may answer, which robot actions it may
choose, the prompt - comes from the mission profile inside the manifest, which
is uploaded to 0G Storage and registered on 0G Chain before takeoff. The robot
loads its policy by that root; nothing about the task is hardcoded here.
"""
from __future__ import annotations

import io
from typing import Callable, Dict, List, Optional, Protocol, Sequence, Tuple, runtime_checkable

from PIL import Image

from .interlock import vocabulary
from .world import World


@runtime_checkable
class Robot(Protocol):
    """The adapter drives a robot through these calls only.

    `step()` advances one control tick and returns None, a checkpoint event
    ({"type": "checkpoint", "k", "nonce", "obs_hash", "png", ...}) when the robot
    holds for a decision, or {"type": "done", ...} at the end. `resolve()` applies
    an interlock-approved action, or "safe_stop".
    """

    ACTIONS: Sequence[str]
    backend: str
    phase: str
    step_idx: int
    samples: list

    @property
    def running(self) -> bool: ...
    @property
    def t_ms(self) -> int: ...
    def start(self) -> None: ...
    def place(self, kind: str, x_mm: int, y_mm: int, variant: int = 0) -> dict: ...
    def step(self) -> Optional[dict]: ...
    def resolve(self, outcome: str) -> None: ...
    def emergency_stop(self) -> None: ...
    def trajectory_hash(self) -> str: ...
    def state(self) -> dict: ...
    def close(self) -> None: ...


# ------------------------------------------------------------------- worlds
WorldFactory = Callable[[int, int, int, Optional[str], dict], World]
WORLDS: Dict[str, WorldFactory] = {}


def register_world(kind: str, factory: WorldFactory) -> None:
    WORLDS[kind] = factory


def _concrete(w: int, h: int, seed: int, tex: Optional[str], _geo: dict) -> World:
    return World(w, h, seed, tex)


def _solar(w: int, h: int, seed: int, tex: Optional[str], geo: dict) -> World:
    from .solar_world import SolarWorld

    return SolarWorld(w, h, seed, tex, geo)


register_world("concrete-deck", _concrete)
register_world("solar-farm", _solar)


def make_world(sim_cfg: dict, seed: int, texture_dir: Optional[str] = None) -> World:
    """World named by the manifest (`sim.world.kind`); manifests without one get the concrete deck."""
    spec = dict(sim_cfg.get("world") or {})
    kind = spec.pop("kind", "concrete-deck")
    spec.pop("kinds", None)
    if kind not in WORLDS:
        raise ValueError(f"unknown world {kind!r} (known: {sorted(WORLDS)})")
    w, h = sim_cfg["deck_mm"]
    return WORLDS[kind](w, h, seed, texture_dir, spec)


def world_kinds(world: World) -> List[str]:
    from .solar_world import KINDS as SOLAR, SolarWorld

    return list(SOLAR) if isinstance(world, SolarWorld) else ["crack", "decoy"]


def world_meta(world: World, sim_cfg: dict) -> dict:
    spec = sim_cfg.get("world") or {}
    meta = getattr(world, "meta", lambda: {})()
    return dict(meta, kind=spec.get("kind", "concrete-deck"), deck_mm=[world.deck_w_mm, world.deck_h_mm],
                kinds=world_kinds(world))


def world_texture_jpg(world: World, max_px: int = 4096) -> bytes:
    """Unblurred top-down texture for the 3D view (the camera never sees this file)."""
    s = min(1.0, max_px / max(world.w_px, world.h_px))
    size = (max(1, int(world.w_px * s)), max(1, int(world.h_px * s)))
    img = world.img.resize(size, Image.BOX) if s < 1.0 else world.img.copy()
    marks = world.marks.resize(size, Image.BOX) if s < 1.0 else world.marks.copy()
    marks.putalpha(marks.getchannel("A").point(lambda v: min(255, v * 2)))
    img.paste(marks, (0, 0), marks)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


# --------------------------------------------------------------- vocabulary
def check_policy_fits(policy: dict, robot_actions: Sequence[str]) -> None:
    """A profile may only let the model choose actions this robot can perform."""
    _, actions, _ = vocabulary(policy)
    extra = [a for a in actions if a not in robot_actions]
    if extra:
        raise ValueError(f"profile actions {extra} are not actions of this robot ({list(robot_actions)})")
