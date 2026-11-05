// Blackbox 3D mission view. Renders whatever world the robot adapter reports
// (z-up, metres): the scenario's surface, the MuJoCo drone, its flown path,
// and one marker per checkpoint coloured by what 0G decided.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const C = {
  sky: 0x000000,
  ground: 0x6f6650,
  path: 0x2997ff,
  plan: 0x86868b,
  ghost: 0xff453a,
  wait: 0xffd60a,
  refuse: 0xff453a,
  stop: 0xff453a,
  skip: 0xa1a1a6,
};

const mm = (v) => v / 1000;

function pathLine(color, width, dashed = false) {
  const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity: dashed ? 0.55 : 0.95, dashed, dashSize: 0.6, gapSize: 0.4, worldUnits: false });
  const line = new Line2(new LineGeometry(), mat);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function setLine(line, pts) {
  if (pts.length < 2) return void (line.visible = false);
  const g = new LineGeometry();
  g.setPositions(pts.flat());
  line.geometry.dispose();
  line.geometry = g;
  if (line.material.dashed) line.computeLineDistances();
  line.visible = true;
}

function fallbackDrone(color = 0x2a2f38) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.08), mat));
  for (const [x, y] of [[-0.14, -0.18], [-0.14, 0.18], [0.14, 0.18], [0.14, -0.18]]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25), mat);
    arm.position.set(x / 2, y / 2, 0.03);
    arm.rotation.z = Math.atan2(y, x) - Math.PI / 2;
    g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.006, 24), new THREE.MeshBasicMaterial({ color: 0xbfd7ff, transparent: true, opacity: 0.25 }));
    rotor.rotation.x = Math.PI / 2;
    rotor.position.set(x, y, 0.07);
    g.add(rotor);
  }
  return g;
}

export class Scene3D {
  constructor(el, { onPlace, onMarker, insetLeft = 0 } = {}) {
    this.el = el;
    this.insetLeft = insetLeft;
    this.onPlace = onPlace;
    this.onMarker = onMarker;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    this.software = /swiftshader|llvmpipe|software/i.test(gpu);
    this.renderer.shadowMap.enabled = !this.software;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);
    this.overlay = document.createElement("div");
    this.overlay.className = "s3-overlay";
    el.appendChild(this.overlay);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.sky);
    this.scene.fog = new THREE.Fog(C.sky, 55, 120);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 90;

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a3326, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    sun.position.set(-18, -26, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.trail = pathLine(C.path, 3);
    this.plan = pathLine(C.plan, 1.5, true);
    this.ghostTrail = pathLine(C.ghost, 3);
    this.scene.add(this.trail, this.plan, this.ghostTrail);

    this.drone = new THREE.Group();
    this.drone.add(fallbackDrone());
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.drone.scale.setScalar(2); // drawn at 2x so it reads on a 36 m field; physics is 1:1
    this.ghost.scale.setScalar(2);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.86, 48), new THREE.MeshBasicMaterial({ color: 0x2997ff, transparent: true, opacity: 0.85, depthTest: false }));
    this.halo.renderOrder = 10;
    this.scene.add(this.drone, this.ghost, this.halo);
    this._loadDroneMesh();

    const fp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x2997ff, transparent: true, opacity: 0.22, depthWrite: false }));
    fp.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0x2997ff })));
    this.footprint = fp;
    this.scene.add(fp);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0x2997ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    this.beam.rotation.x = -Math.PI / 2;
    this.scene.add(this.beam);

    this.markers = new Map();
    this.pose = new THREE.Vector3();
    this.poseTarget = null;
    this.quat = new THREE.Quaternion();
    this.quatTarget = new THREE.Quaternion();
    this.mode = "orbit";
    this.compare = null;
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this._bindPointer();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(el);
    this.resize();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ------------------------------------------------------------------ world
  setWorld(meta, textureUrl, ui = {}) {
    const key = `${meta.kind}:${meta.deck_mm}`;
    const fresh = key !== this.worldKey;
    this.worldKey = key;
    this.meta = meta;
    this.ui = ui;
    const [W, H] = meta.deck_mm.map(mm);
    if (fresh) {
      this.worldGroup.clear();
      this.surfaceMats = [];
      // the keynote stage: a dark disc under the subject that fades into black (Launch Showcase stage-glow)
      const glow = document.createElement("canvas");
      glow.width = glow.height = 256;
      const g2 = glow.getContext("2d");
      const grad = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.55, "rgba(255,255,255,0.85)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 256, 256);
      const far = new THREE.Mesh(new THREE.CircleGeometry(Math.max(W, H) * 1.6, 96), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 1, transparent: true, alphaMap: new THREE.CanvasTexture(glow), depthWrite: false }));
      far.position.set(W / 2, H / 2, meta.kind === "solar-farm" ? -0.01 : -6);
      far.receiveShadow = true;
      this.worldGroup.add(far);
      if (meta.kind === "solar-farm") this._buildSolar(meta, W, H);
      else this._buildDeck(meta, W, H);
      this._frameCamera(W, H);
      const s = this.sun.shadow.camera;
      Object.assign(s, { left: -W * 0.7, right: W * 0.7, top: H * 1.2, bottom: -H * 1.2, near: 1, far: 140 });
      s.updateProjectionMatrix();
      this.sun.target.position.set(W / 2, H / 2, 0);
      this.sun.position.set(W / 2 - 18, H / 2 - 26, 40);
    }
    this._loadTexture(textureUrl);
  }

  _surfaceMat(uv) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
    mat.userData.uv = uv;
    this.surfaceMats.push(mat);
    return mat;
  }

  _buildDeck(meta, W, H) {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this._surfaceMat(null));
    top.position.set(W / 2, H / 2, 0);
    top.receiveShadow = true;
    top.userData.pickable = true;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.8), new THREE.MeshStandardMaterial({ color: 0x8d8b86, roughness: 0.95 }));
    slab.position.set(W / 2, H / 2, -0.401);
    slab.receiveShadow = slab.castShadow = true;
    const rail = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.4, metalness: 0.7 });
    for (const y of [0.05, H - 0.05]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.06), rail);
      r.position.set(W / 2, y, 1.0);
      r.castShadow = true;
      this.worldGroup.add(r);
      for (let x = 0; x <= W; x += 2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0), rail);
        post.position.set(Math.min(x, W - 0.03), y, 0.5);
        post.castShadow = true;
        this.worldGroup.add(post);
      }
    }
    for (const x of [W * 0.2, W * 0.5, W * 0.8]) {
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 6, 20), new THREE.MeshStandardMaterial({ color: 0x77756f, roughness: 1 }));
      pier.rotation.x = Math.PI / 2;
      pier.position.set(x, H / 2, -3.8);
      this.worldGroup.add(pier);
    }
    this.worldGroup.add(top, slab);
  }

  _buildSolar(meta, W, H) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this._surfaceMat(null));
    ground.position.set(W / 2, H / 2, 0);
    ground.receiveShadow = true;
    ground.userData.pickable = true;
    this.worldGroup.add(ground);
    const tilt = THREE.MathUtils.degToRad(12);
    const lift = 0.9;
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.5, metalness: 0.8 });
    const side = new THREE.MeshStandardMaterial({ color: 0x1b2233, roughness: 0.6, metalness: 0.4 });
    for (const [x0, y0, x1, y1] of meta.rows_mm ?? []) {
      const rw = mm(x1 - x0), rd = mm(y1 - y0);
      const uv = [mm(x0) / W, mm(y0) / H, mm(x1) / W, mm(y1) / H];
      const geo = new THREE.BoxGeometry(rw, rd, 0.05);
      const top = this._surfaceMat(uv);
      const mats = [side, side, side, side, top, side];
      const table = new THREE.Mesh(geo, mats);
      table.position.set(mm(x0) + rw / 2, mm(y0) + rd / 2, lift);
      table.rotation.x = -tilt;
      table.castShadow = table.receiveShadow = true;
      table.userData.pickable = true;
      this.worldGroup.add(table);
      for (let x = mm(x0) + 1; x < mm(x1); x += 3.4) {
        for (const dy of [-rd * 0.3, rd * 0.3]) {
          const h = lift + dy * Math.sin(tilt) * -1;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, h), steel);
          post.position.set(x, mm(y0) + rd / 2 + dy, h / 2);
          post.castShadow = true;
          this.worldGroup.add(post);
        }
      }
    }
  }

  _loadTexture(url) {
    if (!url || url === this.texUrl) return;
    this.texUrl = url;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      for (const mat of this.surfaceMats) {
        const t = tex.clone();
        const uv = mat.userData.uv;
        if (uv) {
          t.repeat.set(uv[2] - uv[0], uv[3] - uv[1]);
          t.offset.set(uv[0], uv[1]);
        }
        t.needsUpdate = true;
        if (mat.map) mat.map.dispose();
        mat.map = t;
        mat.needsUpdate = true;
      }
    });
  }

  _loadDroneMesh() {
    const base = "vendor/models/skydio_x2/";
    new THREE.TextureLoader().load(base + "X2_lowpoly_texture_SpinningProps_1024.png", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      new OBJLoader().load(base + "X2_lowpoly.obj", (obj) => {
        const make = (tint) => {
          const o = obj.clone();
          o.traverse((m) => {
            if (m.isMesh) {
              m.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.25, color: tint, transparent: true, alphaTest: 0.05 });
              m.castShadow = true;
            }
          });
          o.scale.setScalar(0.01);
          o.quaternion.set(0, 1, 1, 0).normalize(); // MJCF quat="0 0 1 1" (w x y z)
          return o;
        };
        this.drone.clear();
        this.drone.add(make(0xffffff));
        this.ghost.clear();
        this.ghost.add(make(0xff6961));
      });
    });
  }

  _frameCamera(W, H) {
    // the home pad sits ~3 m west of the surface: keep it in frame
    const tx = (W - 3) / 2, ty = H * 0.42;
    const w = this.el.clientWidth || 1200, h = this.el.clientHeight || 800;
    const visible = this.insetLeft && w > 900 ? (w - this.insetLeft) / w : 1;
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w / h));
    const dist = Math.max((W + 11) / (2 * Math.tan(half) * visible), (H * 1.9) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
    this.camera.position.set(tx, ty - dist * 0.62, dist * 0.74);
    this.controls.target.set(tx, ty, 0);
    this.controls.update();
  }

  setHome(home_mm) {
    const key = String(home_mm);
    if (this.homeKey === key) return;
    this.homeKey = key;
    if (this.homePad) this.scene.remove(this.homePad);
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.04, 40), new THREE.MeshStandardMaterial({ color: 0x232a36, roughness: 0.8 }));
    pad.rotation.x = Math.PI / 2;
    pad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 40), new THREE.MeshBasicMaterial({ color: 0x2997ff }));
    ring.position.z = 0.025;
    const bar = new THREE.MeshBasicMaterial({ color: 0x2997ff });
    for (const [x, w, h] of [[-0.16, 0.06, 0.5], [0.16, 0.06, 0.5], [0, 0.32, 0.06]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bar);
      b.position.set(x, 0, 0.026);
      g.add(b);
    }
    g.add(pad, ring);
    g.position.set(mm(home_mm[0]), mm(home_mm[1]), 0.02);
    this.homePad = g;
    this.scene.add(g);
  }

  // ----------------------------------------------------------------- update
  /** sim: adapter /state "sim" object; trail: [[x,y,z] metres]. */
  update(sim, trail) {
    if (!sim) return;
    const [x, y, z] = sim.pose_mm.map(mm);
    this.poseTarget = new THREE.Vector3(x, y, z);
    if (!this.hasPose) {
      this.pose.copy(this.poseTarget);
      this.hasPose = true;
    }
    if (sim.home_mm) this.setHome(sim.home_mm);
    if (sim.attitude) this.quatTarget.set(sim.attitude[1], sim.attitude[2], sim.attitude[3], sim.attitude[0]);
    else this.quatTarget.identity();
    if (trail) setLine(this.trail, trail);
    const wps = sim.waypoints_mm ?? [];
    const cruise = 3;
    setLine(this.plan, wps.map(([a, b]) => [mm(a), mm(b), cruise]));
    this.phase = sim.phase;
    this.cropM = mm(sim.crop_mm ?? 1000);
  }

  resetPose() {
    this.hasPose = false;
  }

  /** markers: [{k, x_mm, y_mm, state: waiting|descend|continue|refused|stopped, color, title, sub}] */
  setMarkers(list) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.k);
      let e = this.markers.get(m.k);
      if (!e) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 40), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }));
        pole.rotation.x = Math.PI / 2;
        const tag = document.createElement("button");
        tag.className = "s3-tag";
        tag.addEventListener("click", () => this.onMarker?.(m.k));
        this.overlay.appendChild(tag);
        e = { ring, pole, tag };
        this.scene.add(ring, pole);
        this.markers.set(m.k, e);
      }
      const color = new THREE.Color(m.color ?? C.wait);
      const z = this._surfaceZ(mm(m.x_mm), mm(m.y_mm)) + 0.03;
      e.ring.material.color = color;
      e.pole.material.color = color;
      e.ring.position.set(mm(m.x_mm), mm(m.y_mm), z);
      e.pole.position.set(mm(m.x_mm), mm(m.y_mm), z + 1.2);
      e.pole.scale.set(1, 2.4, 1);
      e.anchor = new THREE.Vector3(mm(m.x_mm), mm(m.y_mm), z + 2.5);
      e.state = m.state;
      e.tag.dataset.state = m.state;
      e.tag.style.setProperty("--c", `#${color.getHexString()}`);
      e.tag.innerHTML = `<b>${m.title}</b>${m.sub ? `<span>${m.sub}</span>` : ""}`;
    }
    for (const [k, e] of this.markers) {
      if (seen.has(k)) continue;
      this.scene.remove(e.ring, e.pole);
      e.tag.remove();
      this.markers.delete(k);
    }
  }

  _surfaceZ(x, y) {
    if (this.meta?.kind !== "solar-farm") return 0;
    for (const [x0, y0, x1, y1] of this.meta.rows_mm ?? []) {
      if (x >= mm(x0) && x <= mm(x1) && y >= mm(y0) && y <= mm(y1)) {
        const cy = (mm(y0) + mm(y1)) / 2;
        return 0.9 - (y - cy) * Math.sin(THREE.MathUtils.degToRad(12)) + 0.03;
      }
    }
    return 0;
  }

  /** Beat 2: fly the real run and the "0G forced to continue" run side by side. */
  playCompare(actual, counterfactual, speed = 6) {
    const toPts = (s) => s.map((r) => [mm(r[1]), mm(r[2]), mm(r[3])]);
    this.compare = { a: toPts(actual), b: toPts(counterfactual), t: 0, speed };
    setLine(this.ghostTrail, []);
    this.ghost.visible = true;
  }

  stopCompare() {
    this.compare = null;
    this.ghost.visible = false;
    this.ghostTrail.visible = false;
  }

  setCameraMode(mode) {
    this.mode = mode;
    if (mode === "top" && this.meta) {
      const [W, H] = this.meta.deck_mm.map(mm);
      this.camera.position.set(W / 2, H / 2 - 0.01, Math.max(W, H) * 1.05);
      this.controls.target.set(W / 2, H / 2, 0);
    }
    if (mode === "orbit" && this.meta) this._frameCamera(...this.meta.deck_mm.map(mm));
  }

  // ------------------------------------------------------------------ input
  _bindPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    dom.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !this.onPlace) return;
      const r = dom.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(p, this.camera);
      const pick = this.worldGroup.children.filter((o) => o.userData.pickable);
      const hit = this.raycaster.intersectObjects(pick, false)[0];
      if (!hit || !this.meta) return;
      const [W, H] = this.meta.deck_mm;
      const x = Math.round(hit.point.x * 1000), y = Math.round(hit.point.y * 1000);
      if (x >= 0 && y >= 0 && x <= W && y <= H) this.onPlace(x, y);
    });
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.insetLeft && w > 900) this.camera.setViewOffset(w, h, -this.insetLeft / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    for (const l of [this.trail, this.plan, this.ghostTrail]) l.material.resolution.set(w, h);
  }

  // ------------------------------------------------------------------ frame
  _frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (this.compare) this._stepCompare(dt);
    else if (this.poseTarget) {
      this.pose.lerp(this.poseTarget, 1 - Math.exp(-dt * 9));
      this.quat.slerp(this.quatTarget, 1 - Math.exp(-dt * 9));
    }
    this.drone.position.copy(this.pose);
    this.drone.quaternion.copy(this.quat);
    this.halo.position.copy(this.pose);
    this.halo.quaternion.copy(this.camera.quaternion);
    this.halo.visible = !this.compare && this.mode !== "chase";
    this.halo.material.color.set(this.phase === "HOLD" ? C.wait : this.phase === "SAFE_RTH" || this.phase === "STOPPED" ? C.stop : 0x2997ff);
    this.halo.scale.setScalar(this.phase === "HOLD" ? 1 + 0.18 * Math.sin(performance.now() / 140) : 1);
    const ground = this._surfaceZ(this.pose.x, this.pose.y);
    const h = Math.max(0.05, this.pose.z - ground);
    const s = this.cropM ?? 1;
    this.footprint.position.set(this.pose.x, this.pose.y, ground + 0.02);
    this.footprint.scale.set(s, s, 1);
    this.footprint.visible = this.beam.visible = this.pose.z > 0.3 && !this.compare;
    this.beam.position.set(this.pose.x, this.pose.y, ground + h / 2);
    this.beam.scale.set(s * 0.72, h, s * 0.72);
    this.beam.material.opacity = this.phase === "HOLD" ? 0.16 : 0.07;
    this.footprint.material.color.set(this.phase === "HOLD" ? C.wait : 0x2997ff);
    if (this.mode === "chase") {
      const want = this.pose.clone().add(new THREE.Vector3(-5, -7, 4));
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 3));
      this.controls.target.lerp(this.pose, 1 - Math.exp(-dt * 5));
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._placeTags();
  }

  _stepCompare(dt) {
    const c = this.compare;
    c.t += dt * 10 * c.speed; // samples are 10 Hz
    const at = (pts) => {
      const i = Math.min(pts.length - 1, Math.floor(c.t));
      const j = Math.min(pts.length - 1, i + 1);
      const f = Math.min(1, c.t - i);
      return { p: new THREE.Vector3(...pts[i]).lerp(new THREE.Vector3(...pts[j]), f), i };
    };
    const a = at(c.a), b = at(c.b);
    this.pose.copy(a.p);
    this.ghost.position.copy(b.p);
    setLine(this.trail, c.a.slice(0, a.i + 1).concat([a.p.toArray()]));
    setLine(this.ghostTrail, c.b.slice(0, b.i + 1).concat([b.p.toArray()]));
    if (c.t > Math.max(c.a.length, c.b.length) + 20) c.t = 0;
  }

  _placeTags() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const v = new THREE.Vector3();
    for (const e of this.markers.values()) {
      v.copy(e.anchor).project(this.camera);
      const off = v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1;
      e.tag.style.display = off ? "none" : "";
      if (!off) e.tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      if (e.state === "waiting") e.ring.scale.setScalar(1 + 0.25 * Math.sin(performance.now() / 160));
      else e.ring.scale.setScalar(1);
    }
  }
}
