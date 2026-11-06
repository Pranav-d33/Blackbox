// Blackbox 3D mission view. Renders whatever world the robot adapter reports
// (z-up, metres): the scenario's surface, the MuJoCo drone, its flown path,
// one marker per checkpoint coloured by what 0G decided, and, under the cursor,
// the asset (PV module or 1 m deck square) with its label.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const C = {
  skyTop: 0x060a14,
  skyHorizon: 0x1d2c40,
  path: 0x7dd3fc,
  plan: 0x8b93a3,
  ghost: 0xf87171,
  wait: 0xfbbf24,
  stop: 0xf87171,
  asset: 0x5298ff,
};

const TILT = THREE.MathUtils.degToRad(12);
const LIFT = 0.9;
const mm = (v) => v / 1000;

function pathLine(color, width, dashed = false) {
  const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity: dashed ? 0.5 : 0.95, dashed, dashSize: 0.6, gapSize: 0.4, worldUnits: false });
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

/** A canvas texture: a 2D painter, tiled `repeat` times. */
function canvasTex(size, paint, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

/** Speckled noise in a base colour: grass, gravel, concrete. Seeded so it never flickers between loads. */
function noisePaint(base, spread, dots = 9000) {
  return (g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < dots; i++) {
      const v = (rnd() - 0.5) * spread;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 230 : 0},${Math.abs(v) / 255})`;
      const r = 1 + rnd() * 2.5;
      g.fillRect(rnd() * n, rnd() * n, r, r);
    }
  };
}

function radialAlpha(inner = 0.55) {
  return canvasTex(128, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(inner, "rgba(255,255,255,0.75)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  });
}

function fallbackDrone(color = 0x2a2f38) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.08), mat));
  for (const [x, y] of [[-0.14, -0.18], [-0.14, 0.18], [0.14, 0.18], [0.14, -0.18]]) {
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.006, 24), new THREE.MeshBasicMaterial({ color: 0xbfd7ff, transparent: true, opacity: 0.25 }));
    rotor.rotation.x = Math.PI / 2;
    rotor.position.set(x, y, 0.07);
    g.add(rotor);
  }
  return g;
}

export class Scene3D {
  constructor(el, { onPlace, onMarker, describe, insetLeft = 0, insetX = 0 } = {}) {
    this.el = el;
    this.insetLeft = insetLeft;
    this.insetX = insetX; // px covered by side panels, left and right together (the view stays centred)
    this.onPlace = onPlace;
    this.onMarker = onMarker;
    this.describe = describe;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    this.software = /swiftshader|llvmpipe|software/i.test(gpu);
    if (this.software) this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = !this.software;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);
    this.overlay = document.createElement("div");
    this.overlay.className = "s3-overlay";
    el.appendChild(this.overlay);
    this.hoverTag = document.createElement("div");
    this.hoverTag.className = "s3-hover";
    this.hoverTag.style.opacity = "0";
    this.overlay.appendChild(this.hoverTag);

    this.scene = new THREE.Scene();
    // blue-hour sky: a vertical gradient behind everything, fog in the horizon colour
    this.scene.background = canvasTex(512, (g, n) => {
      const grad = g.createLinearGradient(0, 0, 0, n);
      grad.addColorStop(0, "#060a14");
      grad.addColorStop(0.55, "#121c2b");
      grad.addColorStop(1, "#24344a");
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    });
    this.scene.fog = new THREE.Fog(C.skyHorizon, 70, 190);
    // image-based lighting: panels, glass and the drone pick up soft reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 110;

    this.scene.add(new THREE.HemisphereLight(0xb9cdf2, 0x2b2619, 1.15));
    const sun = new THREE.DirectionalLight(0xffe2bd, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.6);
    rim.position.set(30, 60, 25);
    this.scene.add(sun, sun.target, rim);

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
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.84, 64), new THREE.MeshBasicMaterial({ color: C.path, transparent: true, opacity: 0.8, depthTest: false, fog: false }));
    this.halo.renderOrder = 10;
    // a soft contact shadow under the drone: reads its height even with shadow maps off
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, alphaMap: radialAlpha(0.3), depthWrite: false }));
    this.scene.add(this.drone, this.ghost, this.halo, this.blob);
    this._loadDroneMesh();

    const fp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: C.path, transparent: true, opacity: 0.16, depthWrite: false }));
    fp.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: C.path, transparent: true, opacity: 0.9 })));
    this.footprint = fp;
    this.scene.add(fp);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4, 1, true), new THREE.MeshBasicMaterial({ color: C.path, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    this.beam.rotation.x = -Math.PI / 2;
    this.scene.add(this.beam);

    // hover: the asset under the cursor, outlined in blue
    this.hoverLine = pathLine(C.asset, 2.2);
    this.hoverLine.material.opacity = 1;
    this.hoverLine.material.depthTest = false;
    this.hoverLine.renderOrder = 11;
    this.scene.add(this.hoverLine);

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
    this._ro = new ResizeObserver(() => {
      this.resize();
      this._reframe();
    });
    this.controls.addEventListener("start", () => (this.userMoved = true));
    this._ro.observe(el);
    this.resize();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  /**
   * How much of the canvas the side panes cover (px, left and right). The deck is framed, and centred, in the free
   * window between them. Until the user orbits or zooms themselves, a change re-frames the camera.
   */
  setInsets(left, right) {
    left = Math.max(0, Math.round(left));
    right = Math.max(0, Math.round(right));
    if (left === this._pl && right === this._pr) return;
    this._pl = left;
    this._pr = right;
    this.resize();
    this._reframe();
  }
  _reframe() {
    if (this.userMoved || !this.meta) return;
    const [W, H] = this.meta.deck_mm.map(mm);
    this._frameCamera(W, H);
  }

  /** Stop rendering (nothing is on screen); resume() starts again where the scene left off. */
  pause() {
    this.renderer.setAnimationLoop(null);
  }
  resume() {
    this.clock.getDelta(); // do not feed the paused gap into the next frame's motion
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
      if (meta.kind === "solar-farm") this._buildSolar(meta, W, H);
      else this._buildDeck(meta, W, H);
      this._frameCamera(W, H);
      const s = this.sun.shadow.camera;
      Object.assign(s, { left: -W * 0.75, right: W * 0.75, top: H * 1.3, bottom: -H * 1.3, near: 1, far: 160 });
      s.updateProjectionMatrix();
      this.sun.target.position.set(W / 2, H / 2, 0);
      this.sun.position.set(W / 2 - 22, H / 2 - 30, 34);
    }
    this._loadTexture(textureUrl);
  }

  _surfaceMat(uv, glass = false) {
    const mat = glass
      ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0 });
    mat.userData.uv = uv;
    this.surfaceMats.push(mat);
    return mat;
  }

  _ground(color, spread, cx, cy, size, z = -0.02) {
    const tex = canvasTex(512, noisePaint(color, spread), size / 6);
    const g = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    g.position.set(cx, cy, z);
    g.receiveShadow = true;
    this.worldGroup.add(g);
    return g;
  }

  _buildDeck(meta, W, H) {
    const concrete = new THREE.MeshStandardMaterial({ map: canvasTex(256, noisePaint("#8c8a85", 60, 5000), 4), roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x5f5d58, roughness: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.35, metalness: 0.85 });

    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this._surfaceMat(null));
    top.position.set(W / 2, H / 2, 0.001);
    top.receiveShadow = true;
    top.userData.pickable = true;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H + 0.3, 0.7), concrete);
    slab.position.set(W / 2, H / 2, -0.351);
    slab.receiveShadow = slab.castShadow = true;
    this.worldGroup.add(top, slab);

    // box girders, piers into the river, approach slabs on both banks
    for (const y of [H * 0.25, H * 0.75]) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 1.2, 1.4), dark);
      girder.position.set(W / 2, y, -1.4);
      girder.castShadow = true;
      this.worldGroup.add(girder);
    }
    for (const x of [W * 0.25, W * 0.5, W * 0.75]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, H + 0.6, 0.6), concrete);
      cap.position.set(x, H / 2, -2.4);
      this.worldGroup.add(cap);
      for (const y of [H * 0.25, H * 0.75]) {
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 6, 24), concrete);
        pier.rotation.x = Math.PI / 2;
        pier.position.set(x, y, -5.4);
        pier.castShadow = true;
        this.worldGroup.add(pier);
      }
    }
    for (const [x0, x1] of [[-14, 0], [W, W + 14]]) {
      const ap = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, H + 0.3, 0.7), concrete);
      ap.position.set((x0 + x1) / 2, H / 2, -0.35);
      ap.receiveShadow = true;
      this.worldGroup.add(ap);
      const bank = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 30, 80, 8), new THREE.MeshStandardMaterial({ map: canvasTex(512, noisePaint("#3b4a2a", 70), 10), roughness: 1 }));
      bank.position.set(x0 < 0 ? x0 - 15 + (x1 - x0) / 2 : x1 + 15 - (x1 - x0) / 2, H / 2, -4.75);
      bank.receiveShadow = true;
      this.worldGroup.add(bank);
    }
    // the river
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, 400), new THREE.MeshStandardMaterial({ color: 0x0a1c2a, roughness: 0.3, metalness: 0.4, envMapIntensity: 0.25 }));
    water.position.set(W / 2, H / 2, -7.6);
    this.worldGroup.add(water);
    // parapets and railings along both edges, the full length including approaches
    for (const y of [-0.12, H + 0.12]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(W + 28, 0.25, 0.35), concrete);
      kerb.position.set(W / 2, y, 0.17);
      kerb.castShadow = true;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(W + 28, 0.07, 0.07), steel);
      rail.position.set(W / 2, y, 1.05);
      rail.castShadow = true;
      this.worldGroup.add(kerb, rail);
      for (let x = -14; x <= W + 14; x += 2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.75), steel);
        post.position.set(x, y, 0.7);
        this.worldGroup.add(post);
      }
    }
    // lamp posts every 8 m
    for (let x = 2; x < W; x += 8) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5, 10), steel);
      pole.rotation.x = Math.PI / 2;
      pole.position.set(x, H + 0.35, 2.5);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.08), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 1.6 }));
      lamp.position.set(x, H, 4.95);
      this.worldGroup.add(pole, lamp);
    }
  }

  _buildSolar(meta, W, H) {
    this._ground("#3d4a2b", 80, W / 2, H / 2, Math.max(W, H) * 5);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this._surfaceMat(null));
    ground.position.set(W / 2, H / 2, 0);
    ground.receiveShadow = true;
    ground.userData.pickable = true;
    this.worldGroup.add(ground);
    const steel = new THREE.MeshStandardMaterial({ color: 0xa9b0ba, roughness: 0.4, metalness: 0.85 });
    const frame = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.9 });
    for (const [x0, y0, x1, y1] of meta.rows_mm ?? []) {
      const rw = mm(x1 - x0), rd = mm(y1 - y0);
      const uv = [mm(x0) / W, mm(y0) / H, mm(x1) / W, mm(y1) / H];
      const top = this._surfaceMat(uv, true);
      const table = new THREE.Mesh(new THREE.BoxGeometry(rw, rd, 0.045), [frame, frame, frame, frame, top, frame]);
      table.position.set(mm(x0) + rw / 2, mm(y0) + rd / 2, LIFT);
      table.rotation.x = -TILT;
      table.castShadow = table.receiveShadow = true;
      table.userData.pickable = true;
      this.worldGroup.add(table);
      // torque tube and posts
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, rw, 12), steel);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(mm(x0) + rw / 2, mm(y0) + rd / 2, LIFT - 0.1);
      tube.castShadow = true;
      this.worldGroup.add(tube);
      for (let x = mm(x0) + 1; x < mm(x1); x += 3.4) {
        for (const dy of [-rd * 0.3, rd * 0.3]) {
          const h = LIFT - dy * Math.sin(TILT) - 0.05;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, h), steel);
          post.position.set(x, mm(y0) + rd / 2 + dy, h / 2);
          post.castShadow = true;
          this.worldGroup.add(post);
        }
      }
    }
    // an inverter station and the perimeter fence, for scale
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.2), new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.6, metalness: 0.2 }));
    box.position.set(W + 3, H / 2, 1.1);
    box.castShadow = true;
    this.worldGroup.add(box);
    const fence = new THREE.MeshStandardMaterial({ color: 0x8c949e, roughness: 0.5, metalness: 0.7, transparent: true, opacity: 0.9 });
    const pad = 6;
    for (const [ax, ay, bx, by] of [[-pad, -3, W + pad, -3], [-pad, H + 3, W + pad, H + 3], [W + pad, -3, W + pad, H + 3]]) {
      const len = Math.hypot(bx - ax, by - ay);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 1.6), fence);
      wire.position.set((ax + bx) / 2, (ay + by) / 2, 0.8);
      wire.rotation.z = Math.atan2(by - ay, bx - ax);
      wire.material.opacity = 0.25;
      this.worldGroup.add(wire);
      for (let t = 0; t <= len; t += 3) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 8), steel);
        post.rotation.x = Math.PI / 2;
        post.position.set(ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len, 0.9);
        this.worldGroup.add(post);
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
        const make = (tint, emissive = 0x000000) => {
          const o = obj.clone();
          o.traverse((m) => {
            if (m.isMesh) {
              m.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.35, color: tint, emissive, emissiveIntensity: 0.25, transparent: true, alphaTest: 0.05 });
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
        this.ghost.add(make(0xff8a80, 0x400000));
      });
    });
  }

  _frameCamera(W, H) {
    // the home pad sits ~3 m west of the surface: keep it in frame; the side panels cover ~350 px each
    const tx = (W - 3) / 2, ty = H * 0.42;
    const w = this.el.clientWidth || 1200, h = this.el.clientHeight || 800;
    const cover = w <= 900 ? 0 : this._pl !== undefined ? this._pl + this._pr : this.insetLeft + this.insetX;
    const visible = Math.max(0.45, (w - cover) / w);
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w / h));
    const dist = Math.max((W + 9) * 1.3 / (2 * Math.tan(half) * visible), (H * 1.8) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
    this.camera.position.set(tx, ty - dist * 0.8, dist * 0.56);
    this.controls.target.set(tx, ty, 0);
    this.controls.update();
    this.userMoved = false;
  }

  setHome(home_mm) {
    const key = String(home_mm);
    if (this.homeKey === key) return;
    this.homeKey = key;
    if (this.homePad) this.scene.remove(this.homePad);
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 48), new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.7, metalness: 0.2 }));
    pad.rotation.x = Math.PI / 2;
    pad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.64, 48), new THREE.MeshBasicMaterial({ color: C.path }));
    ring.position.z = 0.03;
    const bar = new THREE.MeshBasicMaterial({ color: C.path });
    for (const [x, w, h] of [[-0.16, 0.06, 0.5], [0.16, 0.06, 0.5], [0, 0.32, 0.06]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bar);
      b.position.set(x, 0, 0.031);
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
    setLine(this.plan, wps.map(([a, b]) => [mm(a), mm(b), 3]));
    this.phase = sim.phase;
    this.cropM = mm(sim.crop_mm ?? 1000);
  }

  resetPose() {
    this.hasPose = false;
  }

  /** markers: [{k, x_mm, y_mm, state: waiting|descend|continue|refused|stopped|pending, color, title, sub}] */
  setMarkers(list) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.k);
      let e = this.markers.get(m.k);
      if (!e) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }));
        pole.rotation.x = Math.PI / 2;
        const tag = document.createElement("button");
        tag.className = "s3-tag";
        tag.addEventListener("click", () => this.onMarker?.(m.k));
        this.overlay.appendChild(tag);
        e = { ring, disc, pole, tag };
        this.scene.add(ring, disc, pole);
        this.markers.set(m.k, e);
      }
      const color = new THREE.Color(m.color ?? C.wait);
      const x = mm(m.x_mm), y = mm(m.y_mm);
      const z = this._surfaceZ(x, y) + 0.03;
      const tilt = this._onRow(x, y) ? -TILT : 0;
      for (const o of [e.ring, e.disc]) {
        o.material.color = color;
        o.position.set(x, y, z);
        o.rotation.x = tilt;
      }
      e.pole.material.color = color;
      e.pole.position.set(x, y, z + 1.2);
      e.pole.scale.set(1, 2.4, 1);
      e.anchor = new THREE.Vector3(x, y, z + 2.5);
      e.state = m.state;
      e.tag.dataset.state = m.state;
      e.tag.style.setProperty("--c", `#${color.getHexString()}`);
      e.tag.innerHTML = `<b>${m.title}</b>${m.sub ? `<span>${m.sub}</span>` : ""}`;
    }
    for (const [k, e] of this.markers) {
      if (seen.has(k)) continue;
      this.scene.remove(e.ring, e.disc, e.pole);
      e.tag.remove();
      this.markers.delete(k);
    }
  }

  _onRow(x, y) {
    if (this.meta?.kind !== "solar-farm") return null;
    return (this.meta.rows_mm ?? []).find(([x0, y0, x1, y1]) => x >= mm(x0) && x <= mm(x1) && y >= mm(y0) && y <= mm(y1)) ?? null;
  }

  _surfaceZ(x, y) {
    const r = this._onRow(x, y);
    if (!r) return 0;
    const cy = (mm(r[1]) + mm(r[3])) / 2;
    return LIFT - (y - cy) * Math.sin(TILT) + 0.03;
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
      this.camera.position.set(W / 2, H / 2 - 0.01, Math.max(W, H) * 1.15);
      this.controls.target.set(W / 2, H / 2, 0);
    }
    if (mode === "orbit" && this.meta) this._frameCamera(...this.meta.deck_mm.map(mm));
  }

  // ------------------------------------------------------------------ input
  _pick(clientX, clientY) {
    const dom = this.renderer.domElement;
    const r = dom.getBoundingClientRect();
    const p = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObjects(this.worldGroup.children.filter((o) => o.userData.pickable), false)[0];
    if (!hit || !this.meta) return null;
    const [W, H] = this.meta.deck_mm;
    const x = Math.round(hit.point.x * 1000), y = Math.round(hit.point.y * 1000);
    return x >= 0 && y >= 0 && x <= W && y <= H ? [x, y] : null;
  }

  _bindPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    dom.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !this.onPlace) return;
      const at = this._pick(e.clientX, e.clientY);
      if (at) this.onPlace(...at);
      this._hoverAt = [e.clientX, e.clientY];
    });
    dom.addEventListener("pointermove", (e) => (this._hoverAt = e.buttons ? null : [e.clientX, e.clientY]));
    dom.addEventListener("pointerleave", () => (this._hoverAt = null));
  }

  /** Once per frame at most: outline the asset under the cursor and show its label. */
  _hover() {
    const at = this._hoverAt;
    const d = at && this.describe && !this.compare ? (() => {
      const p = this._pick(at[0], at[1]);
      return p ? this.describe(p[0], p[1]) : null;
    })() : null;
    if (!d?.rect) {
      this.hoverLine.visible = false;
      this.hoverTag.style.opacity = "0";
      this.renderer.domElement.style.cursor = "";
      return;
    }
    const key = d.rect.join(",");
    if (key !== this._hoverKey) {
      this._hoverKey = key;
      const [x0, y0, x1, y1] = d.rect.map(mm);
      const e = 0.004; // stay inside the asset so a row edge reads the row's own height
      const pt = (x, y) => [x, y, this._surfaceZ(Math.min(Math.max(x, x0 + e), x1 - e), Math.min(Math.max(y, y0 + e), y1 - e)) + 0.03];
      setLine(this.hoverLine, [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)]);
    }
    this.hoverLine.visible = true;
    this.renderer.domElement.style.cursor = "crosshair";
    const r = this.el.getBoundingClientRect();
    this.hoverTag.innerHTML = `<b>${d.name}</b><span>${d.sub ?? ""}</span>`;
    this.hoverTag.style.opacity = "1";
    this.hoverTag.style.transform = `translate(${at[0] - r.left + 14}px, ${at[1] - r.top + 16}px)`;
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // shift the picture so the deck sits in the middle of the free window between the panes, not of the whole canvas
    const l = this._pl ?? this.insetLeft, r = this._pr ?? 0;
    if ((l || r) && w > 900) this.camera.setViewOffset(w, h, -(l - r) / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    for (const l of [this.trail, this.plan, this.ghostTrail, this.hoverLine]) l.material.resolution.set(w, h);
  }

  // ------------------------------------------------------------------ frame
  _frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    const now = performance.now();
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
    const hold = this.phase === "HOLD";
    this.halo.material.color.set(hold ? C.wait : this.phase === "SAFE_RTH" || this.phase === "STOPPED" ? C.stop : C.path);
    this.halo.scale.setScalar(hold ? 1 + 0.18 * Math.sin(now / 140) : 1);
    const ground = this._surfaceZ(this.pose.x, this.pose.y);
    const h = Math.max(0.05, this.pose.z - ground);
    const s = this.cropM ?? 1;
    this.blob.position.set(this.pose.x, this.pose.y, ground + 0.015);
    this.blob.rotation.x = this._onRow(this.pose.x, this.pose.y) ? -TILT : 0;
    this.blob.scale.setScalar(1.1 + h * 0.18);
    this.blob.material.opacity = Math.max(0.1, 0.5 - h * 0.08);
    this.footprint.position.set(this.pose.x, this.pose.y, ground + 0.02);
    this.footprint.rotation.x = this.blob.rotation.x;
    this.footprint.scale.set(s, s, 1);
    this.footprint.visible = this.beam.visible = this.pose.z > 0.3 && !this.compare;
    this.beam.position.set(this.pose.x, this.pose.y, ground + h / 2);
    this.beam.scale.set(s * 0.72, h, s * 0.72);
    this.beam.material.opacity = hold ? 0.14 : 0.05;
    this.footprint.material.color.set(hold ? C.wait : C.path);
    if (this.mode === "chase") {
      const want = this.pose.clone().add(new THREE.Vector3(-5, -7, 4));
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 3));
      this.controls.target.lerp(this.pose, 1 - Math.exp(-dt * 5));
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._placeTags(now);
    this._hover();
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

  _placeTags(now) {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const v = new THREE.Vector3();
    for (const e of this.markers.values()) {
      v.copy(e.anchor).project(this.camera);
      const off = v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1;
      e.tag.style.display = off ? "none" : "";
      if (!off) e.tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      e.ring.scale.setScalar(e.state === "waiting" ? 1 + 0.25 * Math.sin(now / 160) : 1);
    }
  }
}
