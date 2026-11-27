import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { prefersReducedMotion } from '../lib/motion.js';

// A real car's 3D model (glTF from web/public/models, credits in CREDITS.md).
// spin: turns per ten seconds. interactive: drag to turn it, it eases back when let go.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const load = (file) => {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(file).catch((e) => { cache.delete(file); throw e; }));
  return cache.get(file);
};

function prepare(scene) {
  const car = scene.clone(true);
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
  pivot.scale.setScalar(5.4 / len);
  return pivot;
}

export default function CarModel({ model, spin = 0.4, interactive = false, label, view = 'three-quarter', distance = 1 }) {
  const host = useRef(null);
  const spinRef = useRef(spin);
  const [state, setState] = useState('loading');
  spinRef.current = spin;

  useEffect(() => {
    const el = host.current;
    if (!el || !model?.file) return;
    const reduced = prefersReducedMotion();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 8, 5);
    scene.add(sun);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.9, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.36, 1);
    shadow.position.y = 0.002;
    shadow.visible = false;
    scene.add(shadow);

    const camera = new THREE.PerspectiveCamera(view === 'side' ? 22 : 26, 1, 0.1, 100);
    const setCam = () => {
      if (view === 'side') camera.position.set(0, 1.0, 11);
      else camera.position.set(4.6 * distance, 2.5 * distance, 6.0 * distance);
      camera.lookAt(0, 0.45, 0);
    };
    setCam();

    const turn = new THREE.Group();
    scene.add(turn);
    let yaw = view === 'side' ? 0 : -0.35;
    let drag = null;
    let alive = true;
    let visible = true;

    load(model.file).then(
      (gltf) => { if (alive) { turn.add(prepare(gltf.scene)); shadow.visible = true; setState('ready'); } },
      () => alive && setState('missing')
    );

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const onDown = (e) => { drag = { x: e.clientX, yaw }; el.setPointerCapture(e.pointerId); };
    const onMove = (e) => { if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012; };
    const onUp = () => { drag = null; };
    if (interactive) {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    }

    let last = performance.now();
    let raf;
    const home = yaw;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      if (!drag) {
        if (interactive) yaw += (home - yaw) * Math.min(1, dt * 2.5) + (reduced ? 0 : 0);
        else if (!reduced) yaw += dt * spinRef.current * (Math.PI * 2) / 10;
      }
      turn.rotation.y = yaw;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    };
  }, [model?.file, interactive, view, distance]);

  return <div ref={host} className={`car-model is-${state} ${interactive ? 'is-interactive' : ''}`} role="img" aria-label={label} />;
}
