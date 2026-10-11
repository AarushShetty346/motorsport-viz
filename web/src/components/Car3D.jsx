import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { prefersReducedMotion } from '../lib/motion.js';
import '../car3d.css';

// A 2025-style Formula 1 car built from code (no model files), painted in the team's livery.
// Drag to turn it; let go and it springs back to the side view.

const FRONT_AXLE = 1.65;
const REAR_AXLE = -1.75;
const WHEEL_R = 0.36;
const TRACK = 0.8; // wheel centre distance from the car's centre line
const CAR_LENGTH = 5.4;

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A tube along x whose cross-section is a rounded rectangle (superellipse).
// profile(x) returns the section's width, height and bottom y at that point.
function loft(from, to, profile, { segs = 28, ring = 28, n = 4 } = {}) {
  const pos = [];
  const idx = [];
  const section = (x) => {
    const p = profile(x);
    const pts = [];
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sx = Math.sign(c) * Math.abs(c) ** (2 / n);
      const sy = Math.sign(s) * Math.abs(s) ** (2 / n);
      pts.push([x, p.y + p.h / 2 + (sy * p.h) / 2, (sx * p.w) / 2]);
    }
    return pts;
  };
  const rings = [];
  for (let i = 0; i <= segs; i++) rings.push(section(lerp(from, to, i / segs)));
  rings.forEach((r) => r.forEach((v) => pos.push(...v)));
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j;
      const d = (i + 1) * ring + ((j + 1) % ring);
      idx.push(a, c, b, b, c, d);
    }
  }
  // End caps get their own vertices so the side shading stays smooth.
  for (const [r, flip] of [[rings[0], true], [rings[segs], false]]) {
    const start = pos.length / 3;
    const cx = r[0][0];
    const cy = r.reduce((s, v) => s + v[1], 0) / ring;
    pos.push(cx, cy, 0);
    r.forEach((v) => pos.push(...v));
    for (let j = 0; j < ring; j++) {
      const a = start + 1 + j;
      const b = start + 1 + ((j + 1) % ring);
      flip ? idx.push(start, a, b) : idx.push(start, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function rod(a, b, r, mat) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const len = from.distanceTo(to);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return m;
}

function box(w, h, d, mat, [x, y, z], rotZ = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.z = rotZ;
  return m;
}

function wheel(width, mats) {
  const g = new THREE.Group();
  const hw = width / 2;
  const R = WHEEL_R;
  const profile = [
    [0.215, -hw], [0.33, -hw], [R - 0.008, -hw + 0.03], [R, -hw + 0.08],
    [R, hw - 0.08], [R - 0.008, hw - 0.03], [0.33, hw], [0.215, hw],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), mats.rubber);
  tyre.rotation.x = Math.PI / 2;
  g.add(tyre);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, width - 0.02, 40), mats.rim);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  // Wheel covers and the coloured Pirelli sidewall band on both faces.
  for (const side of [-1, 1]) {
    const cover = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), mats.carbon);
    cover.position.z = side * (hw - 0.005);
    if (side < 0) cover.rotation.y = Math.PI;
    g.add(cover);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), mats.stripe);
    hub.position.z = side * (hw - 0.002);
    if (side < 0) hub.rotation.y = Math.PI;
    g.add(hub);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.007, 6, 64), mats.compound);
    band.position.z = side * (hw + 0.001);
    g.add(band);
  }
  return g;
}

function buildCar(livery) {
  const paint = (hex) => new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const mats = {
    body: paint(livery.body),
    accent: paint(livery.accent),
    stripe: paint(livery.stripe),
    carbon: new THREE.MeshStandardMaterial({ color: '#16161a', metalness: 0.4, roughness: 0.45 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: 0.8, roughness: 0.35 }),
    compound: new THREE.MeshStandardMaterial({ color: '#f6d32b', roughness: 0.6 }),
  };
  const car = new THREE.Group();
  const add = (geo, mat) => car.add(geo instanceof THREE.Object3D ? geo : new THREE.Mesh(geo, mat));

  // Floor and diffuser.
  add(loft(-2.15, 1.3, (x) => {
    const t = clamp((x - 0.7) / 0.6, 0, 1);
    return { w: lerp(1.42, 0.5, smooth(t)), h: 0.035, y: 0.05 };
  }, { n: 10 }), mats.carbon);
  add(loft(-2.42, -2.05, (x) => ({ w: 1.0, h: lerp(0.26, 0.05, (x + 2.42) / 0.37), y: 0.05 }), { n: 8, segs: 4 }), mats.carbon);

  // Survival cell running into the nose.
  add(loft(-0.3, 2.78, (x) => {
    if (x < 0.9) return { w: 0.64, h: 0.5, y: 0.08 };
    const u = (x - 0.9) / 1.88;
    return { w: 0.64 - 0.46 * u ** 0.8, h: 0.5 - 0.37 * u ** 0.65, y: 0.08 + 0.05 * u };
  }, { n: 3.2 }), mats.body);
  // Nose tip and a livery stripe along the top of the cell.
  add(loft(2.3, 2.8, (x) => {
    const u = (x - 2.3) / 0.5;
    return { w: 0.27 - 0.1 * u, h: 0.17 - 0.05 * u, y: 0.125 + 0.005 * u };
  }, { n: 3.2, segs: 6 }), mats.accent);
  add(loft(0.95, 2.2, (x) => {
    const u = (x - 0.9) / 1.88;
    return { w: 0.16, h: 0.02, y: 0.08 + 0.05 * u + 0.5 - 0.37 * u ** 0.65 - 0.008 };
  }, { n: 6, segs: 16 }), mats.stripe);

  // Sidepods, with dark inlets.
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(loft(-1.55, 0.6, (x) => {
      const u = clamp((x + 1.55) / 2.15, 0, 1);
      return { w: 0.14 + 0.26 * smooth(clamp(u * 1.35, 0, 1)), h: 0.12 + 0.25 * smooth(u), y: 0.085 };
    }, { n: 3.5 }), mats.body);
    pod.position.z = side * 0.4;
    car.add(pod);
    const inlet = new THREE.Mesh(loft(0.55, 0.62, () => ({ w: 0.3, h: 0.07, y: 0.38 }), { n: 3, segs: 2 }), mats.carbon);
    inlet.position.z = side * 0.42;
    car.add(inlet);
  }

  // Engine cover rising into the airbox, plus the shark fin.
  add(loft(-2.05, 0.12, (x) => {
    const u = (x + 2.05) / 2.17;
    return { w: 0.16 + 0.36 * u, h: 0.28 + 0.52 * u ** 1.5, y: 0.13 };
  }, { n: 3 }), mats.body);
  add(loft(-0.06, 0.1, () => ({ w: 0.2, h: 0.17, y: 0.76 }), { n: 3, segs: 2 }), mats.carbon);
  const fin = new THREE.Shape();
  fin.moveTo(-0.35, 0.85);
  fin.lineTo(-1.75, 0.7);
  fin.lineTo(-1.75, 0.5);
  fin.lineTo(-0.9, 0.62);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.016, bevelEnabled: false });
  finGeo.translate(0, 0, -0.008);
  add(finGeo, mats.accent);

  // Halo and mirrors.
  const haloPath = new THREE.CatmullRomCurve3([
    [0.0, 0.6, 0.29], [0.4, 0.75, 0.25], [0.66, 0.78, 0], [0.4, 0.75, -0.25], [0.0, 0.6, -0.29],
  ].map((p) => new THREE.Vector3(...p)));
  add(new THREE.TubeGeometry(haloPath, 40, 0.032, 10), mats.carbon);
  car.add(rod([0.66, 0.78, 0], [0.92, 0.56, 0], 0.03, mats.carbon));
  for (const side of [-1, 1]) {
    car.add(rod([0.9, 0.5, side * 0.3], [0.95, 0.62, side * 0.44], 0.012, mats.carbon));
    car.add(box(0.06, 0.06, 0.13, mats.body, [0.95, 0.64, side * 0.47]));
  }

  // Front wing.
  car.add(box(0.44, 0.024, 1.86, mats.carbon, [2.52, 0.1, 0]));
  car.add(box(0.26, 0.02, 1.7, mats.accent, [2.44, 0.16, 0], 0.32));
  car.add(box(0.2, 0.018, 1.6, mats.body, [2.38, 0.21, 0], 0.5));
  for (const side of [-1, 1]) car.add(box(0.5, 0.16, 0.02, mats.stripe, [2.5, 0.15, side * 0.94]));

  // Rear wing, beam wing and support pylon.
  car.add(box(0.34, 0.03, 1.02, mats.accent, [-2.24, 0.82, 0], -0.12));
  car.add(box(0.22, 0.025, 1.02, mats.accent, [-2.34, 0.95, 0], -0.4));
  car.add(box(0.2, 0.02, 0.86, mats.carbon, [-2.3, 0.42, 0], -0.15));
  for (const side of [-1, 1]) car.add(box(0.64, 0.58, 0.022, mats.body, [-2.28, 0.72, side * 0.52]));
  car.add(box(0.07, 0.42, 0.03, mats.carbon, [-2.12, 0.58, 0], 0.15));

  // Wheels and suspension.
  const axles = [[FRONT_AXLE, 0.34], [REAR_AXLE, 0.42]];
  for (const [x, width] of axles) {
    for (const side of [-1, 1]) {
      const w = wheel(width, mats);
      w.position.set(x, WHEEL_R, side * TRACK);
      car.add(w);
      const inner = x > 0 ? 0.28 : 0.22;
      const hub = side * (TRACK - width / 2 + 0.02);
      car.add(rod([x + 0.18, 0.38, side * inner], [x, 0.42, hub], 0.016, mats.carbon));
      car.add(rod([x - 0.2, 0.36, side * inner], [x, 0.42, hub], 0.016, mats.carbon));
      car.add(rod([x + 0.16, 0.18, side * inner], [x, 0.26, hub], 0.016, mats.carbon));
      car.add(rod([x - 0.2, 0.18, side * inner], [x, 0.26, hub], 0.016, mats.carbon));
    }
  }

  // Centre the car on its own middle so it spins around itself.
  const bounds = new THREE.Box3().setFromObject(car);
  car.position.x = -(bounds.min.x + bounds.max.x) / 2;
  return car;
}

// Loads a real car model (.glb or .gltf) and sizes it to match the drawn car: longest
// side along x, wheels on the ground, centred. `rotate` (degrees) turns it to face right.
async function loadModel({ url, rotate = 0 }) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const obj = gltf.scene;
  let box = new THREE.Box3().setFromObject(obj);
  let size = box.getSize(new THREE.Vector3());
  const inner = new THREE.Group();
  inner.add(obj);
  inner.rotation.y = (size.z > size.x ? Math.PI / 2 : 0) + THREE.MathUtils.degToRad(rotate);
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner);
  size = box.getSize(new THREE.Vector3());
  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.setScalar(CAR_LENGTH / Math.max(size.x, 0.001));
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -box.min.y, -center.z);
  return outer;
}

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

// Soft contact shadow drawn once on a canvas.
function shadowPlane() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(CAR_LENGTH * 1.25, 2.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

export default function Car3D({ livery, car, label, model = null }) {
  const wrap = useRef(null);

  useEffect(() => {
    const host = wrap.current;
    const reduced = prefersReducedMotion();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a10', 0.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(3, 6, 5);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    const pitchGroup = new THREE.Group();
    const yawGroup = new THREE.Group();
    pitchGroup.add(yawGroup);
    const holder = new THREE.Group();
    yawGroup.add(holder);
    yawGroup.add(shadowPlane());
    let gone = false;
    // A real model file, if the team has one, replaces the drawn car; if it fails to load, the drawn car stays.
    if (model) {
      loadModel(model).then(
        (obj) => { if (gone) return disposeTree(obj); holder.add(obj); draw(); },
        (err) => { console.warn(`Couldn't load ${model.url}, showing the drawn car instead:`, err.message); if (!gone) { holder.add(buildCar(livery)); draw(); } },
      );
    } else {
      holder.add(buildCar(livery));
    }
    pitchGroup.position.y = -0.45;
    scene.add(pitchGroup);

    // Pose: the side view is yaw 0, pitch 0. Whenever nobody is holding the car it eases
    // back there on the clock (not per frame), so it always lands in the same time.
    const pose = { yaw: 0, pitch: 0 };
    let settle = reduced ? null : { yaw: -0.75, pitch: 0.28, start: 0, dur: 1400 };
    if (settle) Object.assign(pose, { yaw: settle.yaw, pitch: settle.pitch });
    let dragging = null;
    let raf = 0;
    let visible = false;

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Fit the car's length to most of the width, leaving headroom for when it's turned.
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = Math.max(CAR_LENGTH / 0.84 / (2 * tan * camera.aspect), 3.1 / (2 * tan));
      camera.position.set(0, dist * 0.09, dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      draw();
    };

    const draw = () => {
      yawGroup.rotation.y = pose.yaw;
      pitchGroup.rotation.x = pose.pitch;
      renderer.render(scene, camera);
    };

    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const tick = (now) => {
      if (!dragging && settle) {
        if (!settle.start) settle.start = now;
        const k = Math.min(1, (now - settle.start) / settle.dur);
        const e = 1 - easeInOut(k);
        pose.yaw = settle.yaw * e;
        pose.pitch = settle.pitch * e;
        if (k === 1) settle = null;
      }
      draw();
      raf = dragging || settle ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (raf || !visible) return;
      raf = requestAnimationFrame(tick);
    };
    // Head back the short way round (not by unwinding every turn), taking longer the further it has to go.
    const release = () => {
      dragging = null;
      host.classList.remove('is-dragging');
      pose.yaw = Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw));
      const far = Math.min(1, (Math.abs(pose.yaw) + Math.abs(pose.pitch)) / Math.PI);
      settle = reduced ? null : { yaw: pose.yaw, pitch: pose.pitch, start: 0, dur: 650 + 650 * far };
      if (reduced) pose.yaw = pose.pitch = 0;
      draw();
      kick();
    };

    const canvas = renderer.domElement;
    const onDown = (e) => {
      if (e.button !== 0) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId);
      host.classList.add('is-dragging');
      settle = null;
      kick();
    };
    const onMove = (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      const dx = e.clientX - dragging.x;
      // On touch only sideways drags turn the car, so the page still scrolls.
      const dy = dragging.touch ? 0 : e.clientY - dragging.y;
      pose.yaw += dx * 0.011;
      pose.pitch = clamp(pose.pitch + dy * 0.006, -0.3, 0.55);
      Object.assign(dragging, { x: e.clientX, y: e.clientY });
    };
    const onUp = (e) => {
      if (dragging && e.pointerId === dragging.id) release();
    };
    // Arrow keys turn it too; releasing the key lets it settle back.
    const onKey = (e) => {
      const step = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
      if (!step) return;
      e.preventDefault();
      dragging = { id: 'key' };
      settle = null;
      pose.yaw += step[0];
      pose.pitch = clamp(pose.pitch + step[1], -0.3, 0.55);
      kick();
    };
    const onKeyUp = (e) => {
      if (dragging?.id === 'key' && e.key.startsWith('Arrow')) release();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
    host.addEventListener('keydown', onKey);
    host.addEventListener('keyup', onKeyUp);

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    // Only animate while on screen; the intro turn plays the first time it's seen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
    }, { threshold: 0.2 });
    io.observe(host);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener('keydown', onKey);
      host.removeEventListener('keyup', onKeyUp);
      gone = true;
      disposeTree(scene);
      env.dispose();
      room.dispose?.();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [livery.body, livery.accent, livery.stripe, model?.url, model?.rotate]);

  return (
    <div
      ref={wrap}
      className="car3d"
      tabIndex={0}
      role="img"
      aria-label={`${label}. Drag or use the arrow keys to turn it; it returns to the side view when you let go.`}
    >
      {car && <span className="car3d-word" aria-hidden="true">{car}</span>}
      <p className="car3d-hint mono">{car && <strong>{car}</strong>}Drag to spin it, let go and it settles back</p>
    </div>
  );
}
