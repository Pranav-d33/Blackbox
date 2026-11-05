"""MuJoCo backend: the Skydio X2 quadrotor from MuJoCo Menagerie (Apache-2.0).

The mission's position controller asks for a world-frame force. A geometric
attitude controller (Lee, Leok & McClamroch, SE(3)) turns that into four rotor
thrusts through the X2's mixing matrix, so the drone tilts to accelerate like
a real one. Deterministic for a given command sequence on one MuJoCo build.
"""
from __future__ import annotations

import math
import os
from typing import List, Sequence

import mujoco
import numpy as np

from .physics import DT, MASS

MODEL_XML = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "skydio_x2", "scene.xml")
KR, KW = 140.0, 24.0  # attitude gains (per unit inertia)
MAX_TILT = math.radians(35)


def _vee(m: np.ndarray) -> np.ndarray:
    return np.array([m[2, 1], m[0, 2], m[1, 0]])


class MuJoCoBody:
    name = "mujoco"

    def __init__(self, x: float, y: float, z: float):
        self.model = mujoco.MjModel.from_xml_path(MODEL_XML)
        self.model.opt.timestep = DT
        self.data = mujoco.MjData(self.model)
        m, bid = self.model, self.model.body("x2").id
        self.mass = float(m.body_subtreemass[bid])
        ri = np.zeros(9)
        mujoco.mju_quat2Mat(ri, m.body_iquat[bid])
        ri = ri.reshape(3, 3)
        self.J = ri @ np.diag(m.body_inertia[bid]) @ ri.T  # inertia in the body frame
        com = m.body_ipos[bid]
        cols = []
        for i in range(m.nu):
            px, py, _ = m.site_pos[m.actuator_trnid[i, 0]] - com
            g = m.actuator_gear[i]
            cols.append([g[2], py * g[2] + g[3], -px * g[2] + g[4], g[5]])
        self.mix_inv = np.linalg.inv(np.array(cols).T)
        self.ctrl_lo, self.ctrl_hi = m.actuator_ctrlrange[:, 0].copy(), m.actuator_ctrlrange[:, 1].copy()
        self.data.qpos[0:3] = [x, y, max(z, 0.0) + 0.001]
        self.data.qpos[3:7] = [1, 0, 0, 0]
        mujoco.mj_forward(self.model, self.data)

    def step(self, force: Sequence[float]) -> None:
        d = self.data
        F = np.asarray(force, dtype=float) * (self.mass / MASS)
        R = np.zeros(9)
        mujoco.mju_quat2Mat(R, d.qpos[3:7])
        R = R.reshape(3, 3)
        w = d.qvel[3:6].copy()  # body-frame angular velocity

        n = float(np.linalg.norm(F))
        zb = F / n if n > 1e-6 else np.array([0.0, 0.0, 1.0])
        h = math.hypot(zb[0], zb[1])
        if h > math.sin(MAX_TILT):
            s = math.sin(MAX_TILT) / h
            zb = np.array([zb[0] * s, zb[1] * s, math.cos(MAX_TILT)])
        yb = np.cross(zb, [1.0, 0.0, 0.0])
        yb /= np.linalg.norm(yb)
        Rd = np.column_stack([np.cross(yb, zb), yb, zb])  # yaw held at 0

        eR = 0.5 * _vee(Rd.T @ R - R.T @ Rd)
        tau = self.J @ (-KR * eR - KW * w) + np.cross(w, self.J @ w)
        thrust = max(0.0, float(F @ R[:, 2]))
        f = self.mix_inv @ np.array([thrust, tau[0], tau[1], tau[2]])
        d.ctrl[:] = np.clip(f, self.ctrl_lo, self.ctrl_hi)
        mujoco.mj_step(self.model, d)

    def state(self):
        d = self.data
        return [float(v) for v in d.qpos[0:3]], [float(v) for v in d.qvel[0:3]]

    def attitude(self) -> List[float]:
        """Body orientation quaternion (w, x, y, z), for the 3D view."""
        return [float(v) for v in self.data.qpos[3:7]]

    def rotor_thrust(self) -> List[float]:
        return [float(v) for v in self.data.ctrl]

    def close(self) -> None:
        pass
