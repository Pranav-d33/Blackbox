"""Write a scenario's defect and benign crops for the Gate A probe.

    python -m blackbox_robot.probe_images assets/probe                       # bridge deck
    python -m blackbox_robot.probe_images assets/probe-solar solar-farm      # solar farm

Files are named <label>-<variant>.png, so the probe knows the right answer.
"""
from __future__ import annotations

import os
import sys

from .world import CRACK_VARIANTS, DECOY_VARIANTS, World


def main(out: str, scenario: str = "bridge-deck") -> None:
    os.makedirs(out, exist_ok=True)
    tex = os.environ.get("BLACKBOX_TEXTURE_DIR") or None
    if scenario == "solar-farm":
        from .solar_world import N_VARIANTS, SolarWorld

        w = SolarWorld(36000, 16000, 42, tex)
        items = [(k, v) for k in ("cracked_cell", "soiling") for v in range(N_VARIANTS[k])]
        spot = lambda i: (3000 + i * 5000, 2000)  # noqa: E731 - centre of the first row
    else:
        w = World(24000, 8000, 42, tex)
        items = [("crack", v) for v in range(len(CRACK_VARIANTS))] + [("decoy", v) for v in range(len(DECOY_VARIANTS))]
        spot = lambda i: (2000 + i * 3000, 4000)  # noqa: E731
    for i, (kind, v) in enumerate(items):
        x, y = spot(i)
        w.add_defect(kind, x, y, v)
        png, _ = w.crop(x, y)
        with open(os.path.join(out, f"{kind}-{v}.png"), "wb") as f:
            f.write(png)
    print(f"wrote {len(items)} {scenario} crops to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "assets/probe", sys.argv[2] if len(sys.argv) > 2 else "bridge-deck")
