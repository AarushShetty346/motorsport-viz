import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { prefersReducedMotion } from '../lib/motion.js';

// A real car's 3D model (glTF from web/public/models, credits in CREDITS.md).
// interactive: rests side on, turns in when first seen, drag (or arrow keys) to turn it and
// it settles back when let go. Otherwise it spins (turns per ten seconds) or stays still.
const CAR_LENGTH = 5.4;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const load = (file) => {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(file).catch((e) => { cache.delete(file); throw e; }));
  return cache.get(file);
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function prepare(scene, paint) {
  const car = scene.clone(true);
  // Repaint named materials that the source model ships without a livery, e.g. { paints: '#0b6fb8' }.
  if (paint) car.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      const c = paint[m.name] || paint['*'];
      if (!c) return m;
      const n = m.clone();
      n.color = new THREE.Color(c);
      n.map = null;
      n.metalness = 0.35;
      n.roughness = 0.35;
      return n;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  // Centre it, sit it on the ground and point the nose along +x.
  const box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) car.rotation.y = Math.PI / 2;
  const pivot = new THREE.Group();
  pivot.add(car);
  const b2 = new THREE.Box3().setFromObject(pivot);
  const c = b2.getCenter(new THREE.Vector3());
  car.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
  const len = Math.max(...b2.getSize(new THREE.Vector3()).toArray());
  pivot.scale.setScalar(CAR_LENGTH / len);
  return pivot;
}

// Soft contact shadow, drawn once on a canvas. It sits under the car and turns with it.
function shadowPlane() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(CAR_LENGTH * 1.2, 2.8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.visible = false;
  return m;
}

export default function CarModel({ model, spin = 0.4, interactive = false, label, view = 'three-quarter', distance = 1, poster }) {
  const host = useRef(null);
  const spinRef = useRef(spin);
  const [state, setState] = useState('loading');
  spinRef.current = spin;

  useEffect(() => {
    const el = host.current;
    if (!el || !model?.file) return;
    // Nothing (no WebGL context, no download) until the car is about to scroll into view.
    let stop = null;
    let gone = false;
    const near = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || stop || gone) return;
      near.disconnect();
      stop = start(el);
    }, { rootMargin: '300px' });
    near.observe(el);
    return () => { gone = true; near.disconnect(); stop?.(); };
  }, [model?.file, interactive, view, distance]);

  function start(el) {
    const reduced = prefersReducedMotion();
    const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 2, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: !!window.__carPoster });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 8, 5);
    scene.add(sun);

    // pitch > yaw > (car + shadow), so the shadow always stays under the car.
    const pitchGroup = new THREE.Group();
    const yawGroup = new THREE.Group();
    pitchGroup.add(yawGroup);
    const shadow = shadowPlane();
    yawGroup.add(shadow);
    pitchGroup.position.y = -0.5;
    scene.add(pitchGroup);

    const sideOn = interactive || view === 'side';
    const camera = new THREE.PerspectiveCamera(sideOn ? 24 : 26, 1, 0.1, 100);

    let alive = true;
    let visible = false;
    let raf = 0;
    const draw = () => renderer.render(scene, camera);

    load(model.file).then(
      (gltf) => {
        if (!alive) return;
        yawGroup.add(prepare(gltf.scene, model.paint));
        shadow.visible = true;
        setState('ready');
        draw();
        kick();
      },
      () => alive && setState('missing')
    );

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      if (sideOn) {
        // Fit the car to most of the width, with headroom for when it's turned.
        const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const fill = interactive ? 0.9 : 0.84;
        const dist = Math.max(CAR_LENGTH / fill / (2 * tan * camera.aspect), 2.6 / (2 * tan));
        camera.position.set(0, dist * 0.1, dist);
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.set(4.6 * distance, 2.0 * distance, 6.0 * distance);
        camera.lookAt(0, -0.25, 0);
      }
      camera.updateProjectionMatrix();
      draw();
    };

    // Interactive pose: side on is yaw 0, pitch 0. When nobody is holding the car it eases
    // back there on the clock, so it always lands in the same time.
    const pose = { yaw: view === 'side' || interactive ? 0 : -0.35, pitch: 0 };
    let settle = interactive && !reduced ? { yaw: -0.75, pitch: 0.28, start: 0, dur: 1400 } : null;
    if (settle) Object.assign(pose, { yaw: settle.yaw, pitch: settle.pitch });
    let dragging = null;
    let last = 0;

    const spinning = () => !interactive && !reduced && spinRef.current > 0;
    const tick = (now) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (spinning()) pose.yaw += dt * spinRef.current * (Math.PI * 2) / 10;
      if (!dragging && settle) {
        if (!settle.start) settle.start = now;
        const k = Math.min(1, (now - settle.start) / settle.dur);
        const e = 1 - easeInOut(k);
        pose.yaw = settle.yaw * e;
        pose.pitch = settle.pitch * e;
        if (k === 1) settle = null;
      }
      yawGroup.rotation.y = pose.yaw;
      pitchGroup.rotation.x = pose.pitch;
      draw();
      if (visible && (dragging || settle || spinning())) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (raf || !visible) return;
      raf = requestAnimationFrame(tick);
    };

    // Head back the short way round, taking longer the further it has to go.
    const release = () => {
      dragging = null;
      el.classList.remove('is-dragging');
      pose.yaw = Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw));
      const far = Math.min(1, (Math.abs(pose.yaw) + Math.abs(pose.pitch)) / Math.PI);
      settle = reduced ? null : { yaw: pose.yaw, pitch: pose.pitch, start: 0, dur: 650 + 650 * far };
      if (reduced) pose.yaw = pose.pitch = 0;
      kick();
    };
    const onDown = (e) => {
      if (e.button !== 0) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
      settle = null;
      kick();
    };
    const onMove = (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      // On touch only sideways drags turn the car, so the page still scrolls.
      const dy = dragging.touch ? 0 : e.clientY - dragging.y;
      pose.yaw += (e.clientX - dragging.x) * 0.011;
      pose.pitch = clamp(pose.pitch + dy * 0.006, -0.3, 0.55);
      Object.assign(dragging, { x: e.clientX, y: e.clientY });
    };
    const onUp = (e) => { if (dragging && e.pointerId === dragging.id) release(); };
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
    const onKeyUp = (e) => { if (dragging?.id === 'key' && e.key.startsWith('Arrow')) release(); };
    if (interactive) {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('lostpointercapture', onUp);
      el.addEventListener('keydown', onKey);
      el.addEventListener('keyup', onKeyUp);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    // Only animate while on screen; the intro turn plays the first time it's seen.
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { threshold: 0.2 });
    io.observe(el);
    resize();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('keyup', onKeyUp);
      shadow.material.map.dispose();
      env.dispose();
      room.dispose?.();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }

  return (
    <div
      ref={host}
      className={`car-model is-${state} ${interactive ? 'is-interactive' : ''}`}
      role="img"
      aria-label={interactive ? `${label}. Drag or use the arrow keys to turn it; it settles back when you let go.` : label}
      tabIndex={interactive ? 0 : undefined}
    >
      {poster && state !== 'ready' && <img className="car-model-poster" src={poster} alt="" decoding="async" />}
    </div>
  );
}
