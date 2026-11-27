/* Taller Wolf · v7 · auto 3D de la portada.
   Modelo: "Airtsel Valor Proiettile" de Yudha Mfr (CC BY 4.0) — https://skfb.ly/oJJKq
   Archivo optimizado para web (geometría comprimida con meshopt): assets/auto/airtsel.glb
   - Se gira solo a los lados (mouse, dedo o flechas del teclado).
   - Puntos blancos: abren y cierran puertas, cofre y cajuela usando la animación que trae el modelo,
     separada por pieza.
   - Fondo transparente con sombra suave. */
import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { MeshoptDecoder } from "./vendor/meshopt_decoder.module.js";

const MODEL = "assets/auto/airtsel.glb";
// Piezas del modelo (nombres dentro del archivo). El frente del auto mira hacia +x.
const PARTS = {
  doorL: { node: "box204", normal: [0, 0, -1] },   // puerta del conductor (izquierda)
  doorR: { node: "box192", normal: [0, 0, 1] },    // puerta del copiloto
  hood: { node: "box28", normal: [0, 1, 0] },      // cofre
  trunk: { node: "box19", normal: [0, 1, 0] }      // cajuela
};
const TIRES = ["box89", "box99", "box62"];        // llantas delanteras y traseras (para apoyar el auto en el piso)
const LENGTH = 4.3;                                // largo al que se escala el auto (metros)

const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

async function start(host) {
  const stage = host.querySelector(".car-stage");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { host.classList.add("no-webgl"); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(2, 6, 3);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(24, 1.5, 0.1, 100);
  const TARGET = new V3(0, 0.5, 0), ELEV = 0.27;

  /* Cargar el modelo */
  let gltf;
  try {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    gltf = await loader.loadAsync(MODEL);
  } catch (e) {
    host.classList.add("no-webgl");
    return;
  }
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 1.1; } });
  // Escala y posición: centrado, sobre el piso, con el largo deseado
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const k = LENGTH / box.getSize(new V3()).x;
  model.scale.setScalar(k);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const ctr = box.getCenter(new V3());
  // El piso es la parte baja de las llantas (el modelo trae piezas de suspensión ocultas más abajo)
  const tires = new THREE.Box3();
  for (const n of TIRES) { const o = model.getObjectByName(n); if (o) tires.expandByObject(o); }
  model.position.set(-ctr.x, -(tires.isEmpty() ? box.min.y : tires.min.y), -ctr.z);
  const car = new THREE.Group();
  car.add(model);
  scene.add(car);
  car.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(car).getSize(new V3());

  /* Animación del modelo, separada por pieza */
  const clip = gltf.animations[0];
  const mixer = new THREE.AnimationMixer(model);
  const partOf = (name) => {
    let o = model.getObjectByName(name);
    while (o) { for (const p in PARTS) if (o.name === PARTS[p].node) return p; o = o.parent; }
    return null;
  };
  const parts = {};
  for (const name in PARTS) parts[name] = { tracks: [], t: 0, target: 0 };
  for (const tr of clip.tracks) { const p = partOf(tr.name.split(".")[0]); if (p) parts[p].tracks.push(tr); }
  for (const name in parts) {
    const part = parts[name];
    // La animación del modelo abre y luego cierra cada pieza. Se mide la forma real de la pieza
    // a lo largo de la animación y se usa el tramo desde que empieza a moverse hasta que está más abierta.
    part.action = mixer.clipAction(new THREE.AnimationClip(name, clip.duration, part.tracks));
    part.action.play(); part.action.paused = true;
    const node = model.getObjectByName(PARTS[name].node), bb = new THREE.Box3();
    const shape = (t) => { part.action.time = t; mixer.update(0); model.updateMatrixWorld(true); bb.setFromObject(node); return [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]; };
    const closed = shape(0), samples = [];
    for (let t = 0; t <= clip.duration + 1e-6; t += 1 / 30) {
      const s = shape(t);
      samples.push([t, s.reduce((acc, v, i) => acc + Math.abs(v - closed[i]), 0)]);
    }
    const peak = samples.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0]);
    let t0 = 0;
    for (const [t, d] of samples) { if (t >= peak[0]) break; if (d < peak[1] * .01) t0 = t; }
    part.t0 = t0; part.t1 = peak[0] || clip.duration;
    part.action.time = part.t0;
  }
  mixer.update(0);
  car.updateMatrixWorld(true);

  /* Sombra suave debajo (gira con el auto) */
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(size.x, size.z), transparent: true, depthWrite: false, toneMapped: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.3, size.z * 1.6), shadowMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; shadow.renderOrder = -1;
  car.add(shadow);

  /* Puntos interactivos: se pegan a la pieza que se mueve (sigue a la puerta al abrirse) */
  const spots = [...host.querySelectorAll(".hotspot")].map((el) => {
    const name = el.getAttribute("data-part"), def = PARTS[name], node = model.getObjectByName(def.node);
    // la pieza animada más grande dentro de este grupo
    const moving = new Set(parts[name].tracks.map((tr) => tr.name.split(".")[0]));
    let best = node, bestV = -1;
    node.traverse((o) => { if (!moving.has(o.name)) return; const s = new THREE.Box3().setFromObject(o).getSize(new V3()); const vol = s.x * s.y + s.y * s.z + s.x * s.z; if (vol > bestV) { bestV = vol; best = o; } });
    const bb = new THREE.Box3().setFromObject(node), p = bb.getCenter(new V3()), n = new V3(...def.normal);
    if (n.y) p.y = bb.max.y; else p.z = n.z > 0 ? bb.max.z : bb.min.z;
    if (name === "doorL" || name === "doorR") p.y = lerp(bb.min.y, bb.max.y, .42);
    const obj = new THREE.Object3D();
    best.add(obj);
    obj.position.copy(best.worldToLocal(p.clone()));
    const inv = new THREE.Matrix3().getNormalMatrix(best.matrixWorld).invert();
    const nLocal = n.clone().applyMatrix3(inv).normalize();
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", () => toggle(name, el));
    return { el, obj, n: nLocal };
  });
  function toggle(name, el) {
    const part = parts[name];
    part.target = part.target ? 0 : 1;
    el.setAttribute("aria-pressed", part.target ? "true" : "false");
    host.classList.add("touched");
    invalidate();
  }

  /* Cámara y giro */
  const YAW0 = Math.PI + 0.62;                   // vista 3/4 de frente, con la nariz hacia la izquierda
  let yaw = reduceMotion ? YAW0 : YAW0 + 0.95, vel = 0;
  let intro = reduceMotion ? null : { t0: 0, from: YAW0 + 0.95, to: YAW0, dur: 2200 };
  function fit() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * camera.aspect;
    const D = Math.max((size.x / 2 + .55) / th, (size.y * .8 + .1) / tv);
    camera.position.set(0, TARGET.y + Math.sin(ELEV) * D, Math.cos(ELEV) * D);
    camera.lookAt(TARGET);
    camera.updateProjectionMatrix();
    invalidate();
  }

  let raf = 0, last = 0, drag = null;
  function invalidate() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(50, now - last) : 16;
    last = now;
    let busy = false;
    if (intro) {
      if (!intro.t0) intro.t0 = now;
      const q = clamp((now - intro.t0) / intro.dur, 0, 1);
      yaw = lerp(intro.from, intro.to, easeOut(q));
      if (q >= 1) intro = null; else busy = true;
    }
    if (!drag && Math.abs(vel) > 1e-5) { yaw += vel * dt; vel *= Math.exp(-dt / 330); busy = true; }
    let anim = false;
    for (const name in parts) {
      const part = parts[name];
      if (part.t === part.target) continue;
      const step = dt / (reduceMotion ? 250 : 1300);
      part.t = part.target > part.t ? Math.min(part.target, part.t + step) : Math.max(part.target, part.t - step);
      part.action.time = lerp(part.t0, part.t1, easeInOut(part.t));
      anim = busy = true;
    }
    if (anim) mixer.update(0);
    car.rotation.y = yaw;
    render();
    if (!busy && !drag) last = 0;
    if (busy) invalidate();
  }
  const wp = new V3(), wn = new V3(), toCam = new V3();
  function render() {
    renderer.render(scene, camera);
    const w = stage.clientWidth, h = stage.clientHeight, ox = stage.offsetLeft, oy = stage.offsetTop;
    for (const s of spots) {
      s.obj.getWorldPosition(wp);
      wn.copy(s.n).transformDirection(s.obj.parent.matrixWorld);
      toCam.subVectors(camera.position, wp).normalize();
      const vis = smooth(-.02, .22, wn.dot(toCam));
      wp.project(camera);
      s.el.style.setProperty("--x", (ox + (wp.x * .5 + .5) * w).toFixed(1) + "px");
      s.el.style.setProperty("--y", (oy + (-wp.y * .5 + .5) * h).toFixed(1) + "px");
      s.el.style.setProperty("--vis", vis.toFixed(3));
      const away = vis < .15;
      s.el.classList.toggle("away", away);
      s.el.tabIndex = away ? -1 : 0;
    }
  }

  /* Arrastrar: solo gira a los lados; lo vertical se deja para hacer scroll */
  host.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), locked: e.pointerType === "mouse" };
    if (drag.locked) { host.setPointerCapture(e.pointerId); host.classList.add("dragging"); }
    intro = null; vel = 0;
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.locked) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { drag.locked = true; host.setPointerCapture(e.pointerId); host.classList.add("dragging"); }
      else if (Math.abs(dy) > 10) { drag = null; return; }
      else return;
    }
    const now = performance.now(), d = dx * 4 / Math.max(320, host.clientWidth);
    yaw += d;
    vel = lerp(vel, d / Math.max(8, now - drag.t), .5);
    drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
    host.classList.add("touched");
    invalidate();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (performance.now() - drag.t > 90 || reduceMotion) vel = 0;
    drag = null;
    host.classList.remove("dragging");
    invalidate();
  };
  host.addEventListener("pointerup", endDrag);
  host.addEventListener("pointercancel", endDrag);
  host.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    intro = null;
    const dir = e.key === "ArrowLeft" ? -1 : 1;
    if (reduceMotion) { vel = 0; yaw += dir * .35; } else vel = dir * .0045;
    host.classList.add("touched");
    invalidate();
  });

  /* Tema claro/oscuro */
  const root = document.documentElement;
  const syncTheme = () => {
    const dark = root.getAttribute("data-theme") === "dark";
    shadowMat.opacity = dark ? .9 : .75;
    renderer.toneMappingExposure = dark ? 1.1 : 1.0;
    invalidate();
  };
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  syncTheme();

  new ResizeObserver(fit).observe(host);
  fit();
  requestAnimationFrame(() => {
    host.classList.add("ready");
    spots.forEach((s) => { s.el.hidden = false; });
    invalidate();
  });
}

/* Sombra: huella difuminada justo debajo del auto (sin manchas de llantas) */
function shadowTexture(L, W) {
  const PW = L * 1.3, PH = W * 1.6, CW = 512, CH = 256, cv = document.createElement("canvas");
  cv.width = CW; cv.height = CH;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(CW, CH);
  const r = W * .32;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const X = (x / (CW - 1) - .5) * PW, Z = (y / (CH - 1) - .5) * PH;
    const qx = Math.abs(X) - (L / 2 - r), qz = Math.abs(Z) - (W / 2 - r);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
    const a = .55 * (1 - smooth(-.45, .5, d));
    img.data[(y * CW + x) * 4 + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const carHost = document.getElementById("car3d");
if (carHost) start(carHost);
