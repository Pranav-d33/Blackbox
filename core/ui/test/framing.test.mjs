// Runs the shipped framing function against the real Three.js: the deck must land inside the free window between the
// panes (and above the Live panel) on every common screen, for both camera views and both scenarios.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fitCamera, freeRect } from "../../web/framing.js";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1); // the scene is z-up, as in scene3d.js
const INS = { left: 348, right: 336, top: 88 };
const LIVE = 316; // the Live-on-0G panel plus its gap
const sizes = [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440]];
const decks = { solar: [36, 16], bridge: [24, 8] };

function project(w, h, W, H, mode, free) {
  const fit = fitCamera(THREE, { fov: 38, w, h, W, H, mode, free });
  const cam = new THREE.PerspectiveCamera(38, w / h, 0.05, 500);
  cam.setViewOffset(w, h, fit.offset.x, fit.offset.y, w, h);
  cam.position.copy(fit.position); cam.lookAt(fit.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const x of [0, W]) for (const y of [0, H]) for (const z of [0, 1.8]) {
    const v = new THREE.Vector3(x, y, z).project(cam);
    const px = ((v.x + 1) / 2) * w, py = ((1 - v.y) / 2) * h;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  return { x0, x1, y0, y1, distance: fit.distance };
}

for (const [name, [W, H]] of Object.entries(decks)) for (const [w, h] of sizes) for (const live of [false, true]) for (const mode of ["orbit", "top"]) {
  test(`${name} ${w}x${h} ${mode}${live ? " with the Live panel" : ""}: the deck sits inside the free window and fills it`, () => {
    const free = freeRect(w, h, { ...INS, bottom: 84 + (live ? LIVE : 0) });
    const b = project(w, h, W, H, mode, free);
    const eps = 1;
    assert.ok(b.x0 >= free.x0 - eps && b.x1 <= free.x1 + eps, `x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)} outside ${free.x0}..${free.x1}`);
    assert.ok(b.y0 >= free.y0 - eps && b.y1 <= free.y1 + eps, `y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)} outside ${free.y0}..${free.y1}`);
    // not lost in a big empty screen, and not jammed against the edges either (the top view used to be too zoomed in)
    const fillX = (b.x1 - b.x0) / (free.x1 - free.x0), fillY = (b.y1 - b.y0) / (free.y1 - free.y0);
    const fill = Math.max(fillX, fillY);
    assert.ok(fill >= 0.55, `fills only ${(fill * 100).toFixed(0)}% of the free window`);
    assert.ok(fill <= (mode === "top" ? 0.74 : 0.84), `fills ${(fill * 100).toFixed(0)}% of the free window: too tight for the ${mode} view`);
  });
}

test("on a narrow screen the panes stack, so the whole canvas is free", () => {
  assert.deepEqual(freeRect(800, 600, { left: 348, right: 336, top: 88, bottom: 84 }), { x0: 0, x1: 800, y0: 0, y1: 600 });
});
