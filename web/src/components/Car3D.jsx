import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '../lib/motion.js';

// A 2025-style F1 car built from simple shapes in the team's colours. Drag to turn
// it around; let go and it eases back to the side view.
export default function Car3D({ body, accent, trim = '#0b0b0c', label }) {
  const mount = useRef(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(0, 0.8, 9);
    camera.lookAt(0, 0.45, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a10, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 6, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(-6, 3, -5);
    scene.add(rim);

    const car = buildCar({ body, accent, trim });
    const pivot = new THREE.Group();
    pivot.add(car);
    scene.add(pivot);
    scene.add(shadowDisc());

    // Drag to rotate; the target springs back to the side view on release.
    const state = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, drag: null };
    const down = (e) => {
      state.drag = { x: e.clientX, y: e.clientY, yaw: state.tYaw, pitch: state.tPitch };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    };
    const move = (e) => {
      if (!state.drag) return;
      state.tYaw = state.drag.yaw + (e.clientX - state.drag.x) * 0.012;
      state.tPitch = Math.max(-0.35, Math.min(0.75, state.drag.pitch + (e.clientY - state.drag.y) * 0.006));
    };
    const up = () => {
      state.drag = null;
      // Settle on the nearest side view (the car may have been spun more than once).
      state.tYaw = Math.round(state.tYaw / (Math.PI * 2)) * Math.PI * 2;
      state.tPitch = 0;
      el.classList.remove('is-dragging');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the whole car (and a little air) in frame however narrow the box is.
      camera.position.z = Math.max(9, 7.8 / (2 * Math.tan(THREE.MathUtils.degToRad(13)) * (w / h)));
      camera.lookAt(0, 0.45, 0);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const reduced = prefersReducedMotion();
    let raf;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = clock.getElapsedTime();
      const k = reduced ? 1 : 0.085;
      state.yaw += (state.tYaw - state.yaw) * k;
      state.pitch += (state.tPitch - state.pitch) * k;
      pivot.rotation.y = state.yaw;
      pivot.rotation.x = state.pitch;
      if (!reduced && !state.drag) car.position.y = Math.sin(t * 1.6) * 0.012;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [body, accent, trim]);

  return (
    <div className="car3d" ref={mount} role="img" aria-label={label}>
      <p className="car3d-hint mono">Drag to spin it · let go and it settles back</p>
    </div>
  );
}

// ------------------------------------------------------------------ the car

function buildCar({ body, accent, trim }) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: body, roughness: 0.32, metalness: 0.25 });
  const second = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.2 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55, metalness: 0.3 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.4, metalness: 0.6 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf2d01e, roughness: 0.5 });

  const side = (points, depth, mat, z = 0, bevel = 0.04) => {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
    geo.translate(0, 0, -depth / 2 + z);
    const m = new THREE.Mesh(geo, mat);
    car.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    car.add(m);
    return m;
  };

  // Floor and plank.
  box(4.7, 0.05, 1.55, carbon, -0.1, 0.13, 0);

  // Survival cell, nose and engine cover as one side profile (the car faces +x).
  side([
    [2.95, 0.22], [2.9, 0.3], [1.6, 0.42], [0.75, 0.56], [0.35, 0.66], [-0.25, 0.66],
    [-0.45, 0.98], [-0.95, 1.0], [-1.35, 0.8], [-2.2, 0.5], [-2.55, 0.4], [-2.6, 0.18], [2.95, 0.18],
  ], 0.62, paint);

  // Sidepods, wider and lower.
  side([[0.75, 0.18], [0.7, 0.5], [0.35, 0.6], [-0.6, 0.6], [-1.9, 0.36], [-2.05, 0.18]], 1.36, paint, 0, 0.08);
  // Sidepod inlets.
  box(0.08, 0.26, 0.34, carbon, 0.74, 0.42, 0.52);
  box(0.08, 0.26, 0.34, carbon, 0.74, 0.42, -0.52);

  // Livery stripe along the spine, the team's second colour on the sidepods, a yellow nose tip.
  side([[1.7, 0.43], [0.8, 0.57], [0.35, 0.67], [-0.25, 0.67], [-0.45, 0.99], [-0.6, 0.99], [-0.4, 0.69], [0.3, 0.69], [0.8, 0.59], [1.7, 0.45]], 0.22, second, 0, 0.01);
  side([[0.5, 0.2], [0.45, 0.32], [-1.6, 0.3], [-1.75, 0.2]], 1.4, second, 0, 0.02);
  box(0.16, 0.08, 0.3, stripe, 2.88, 0.26, 0);

  // Cockpit opening, driver helmet and the halo.
  box(0.62, 0.04, 0.44, carbon, 0.05, 0.665, 0);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), stripe);
  helmet.position.set(-0.02, 0.78, 0);
  car.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 24, 16, -0.6, 1.2, 1.2, 0.5), carbon);
  visor.position.copy(helmet.position);
  visor.rotation.y = Math.PI / 2;
  car.add(visor);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 32, Math.PI), carbon);
  halo.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  halo.position.set(-0.1, 0.92, 0);
  car.add(halo);
  box(0.05, 0.28, 0.05, carbon, 0.3, 0.8, 0).rotation.z = -0.5;

  // Front wing.
  box(0.62, 0.04, 2.05, carbon, 2.55, 0.12, 0);
  box(0.42, 0.035, 1.95, second, 2.45, 0.2, 0).rotation.z = 0.12;
  box(0.68, 0.24, 0.03, carbon, 2.55, 0.2, 1.03);
  box(0.68, 0.24, 0.03, carbon, 2.55, 0.2, -1.03);

  // Rear wing.
  box(0.5, 0.05, 1.12, carbon, -2.42, 0.92, 0);
  box(0.34, 0.045, 1.12, paint, -2.5, 1.04, 0).rotation.z = -0.2;
  box(0.66, 0.6, 0.03, second, -2.42, 0.78, 0.57);
  box(0.66, 0.6, 0.03, second, -2.42, 0.78, -0.57);
  box(0.08, 0.5, 0.06, carbon, -2.35, 0.6, 0);
  box(0.4, 0.04, 0.9, carbon, -2.5, 0.3, 0); // beam wing

  // Wheels: tyre, coloured rim and a yellow sidewall band.
  const wheels = [];
  const wheel = (x, z, width) => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, width, 40), tyre);
    t.rotation.x = Math.PI / 2;
    g.add(t);
    for (const s of [1, -1]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 32), rimMat);
      r.rotation.x = Math.PI / 2;
      r.position.z = (s * width) / 2;
      g.add(r);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.012, 8, 48), stripe);
      band.position.z = (s * width) / 2 + s * 0.005;
      g.add(band);
    }
    g.position.set(x, 0.36, z);
    car.add(g);
    wheels.push(g);
    // Suspension arms back to the body.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, Math.abs(z) - 0.2, 6), carbon);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(x, 0.42, z / 2 + Math.sign(z) * 0.1);
    car.add(arm);
  };
  wheel(1.75, 0.86, 0.36);
  wheel(1.75, -0.86, 0.36);
  wheel(-1.85, 0.82, 0.44);
  wheel(-1.85, -0.82, 0.44);

  car.userData.wheels = wheels;
  car.position.y = 0;
  return car;
}

// A soft round shadow under the car.
function shadowDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,30,0,0.45)');
  grad.addColorStop(1, 'rgba(40,30,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 2.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.005;
  return m;
}
