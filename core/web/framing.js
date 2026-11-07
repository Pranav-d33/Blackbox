/**
 * Where to put the camera so the deck fills the part of the canvas the side panes leave free.
 *
 * Pure on purpose: Three.js is passed in, so the console and the landing page use it with their own copy of three and
 * core/ui/test/framing.test.mjs runs this exact function in node against the real library.
 *
 * The fit is numeric: the camera sits on a fixed viewing direction (a 52 degree orbit angle, or straight down for the
 * top view) and is pulled back until the projected deck, home pad and panel height all lie inside the free rectangle
 * with a small margin. That replaces the old rules of thumb, which framed the orbit view for a column the width of the
 * whole canvas minus a constant, and put the top view at a fixed 1.15 x the deck size whatever the panes covered.
 */
const ELEV = { orbit: (52 * Math.PI) / 180, top: Math.PI / 2 };
const PAD = 3.5; // the home pad sits this far west of the deck and must stay in frame
const HEIGHT = 1.8; // panels and rails stand this tall

/** The free rectangle in canvas pixels: between the panes, below the top bar, above the bottom bars. */
export function freeRect(w, h, ins = {}) {
  if (w <= 900) return { x0: 0, x1: w, y0: 0, y1: h }; // narrow screens: the panes stack, nothing to dodge
  const { left = 0, right = 0, top = 0, bottom = 0 } = ins;
  return { x0: left, x1: Math.max(left + 200, w - right), y0: top, y1: Math.max(top + 160, h - bottom) };
}

/** The offset that makes the camera's centre the centre of the free rectangle (for camera.setViewOffset). */
export function viewOffset(w, h, free) {
  return { x: -(free.x0 + free.x1 - w) / 2, y: -(free.y0 + free.y1 - h) / 2 };
}

export function fitCamera(THREE, { fov, w, h, W, H, mode = "orbit", free }) {
  const target = new THREE.Vector3((W - PAD) / 2, H / 2, 0);
  const elev = ELEV[mode] ?? ELEV.orbit;
  // straight down is a degenerate view for lookAt; a hair off the vertical keeps the deck's long side horizontal
  const dir = new THREE.Vector3(0, -Math.max(1e-4, Math.cos(elev)), Math.sin(elev)).normalize();
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 500);
  const off = viewOffset(w, h, free);
  cam.setViewOffset(w, h, off.x, off.y, w, h);

  const padX = (free.x1 - free.x0) * 0.04, padY = (free.y1 - free.y0) * 0.06;
  const box = [free.x0 + padX, free.x1 - padX, free.y0 + padY, free.y1 - padY];
  const corners = [];
  for (const x of [-PAD, W]) for (const y of [0, H]) for (const z of [0, HEIGHT]) corners.push(new THREE.Vector3(x, y, z));
  const v = new THREE.Vector3();
  const place = (d) => {
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
  };
  const fits = (d) => {
    place(d);
    for (const c of corners) {
      v.copy(c).project(cam);
      const px = ((v.x + 1) / 2) * w, py = ((1 - v.y) / 2) * h;
      if (px < box[0] || px > box[1] || py < box[2] || py > box[3]) return false;
    }
    return true;
  };
  let lo = 2, hi = 600;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return { position: target.clone().addScaledVector(dir, hi), target, distance: hi, offset: off };
}
