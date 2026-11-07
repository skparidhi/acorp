// Interactive 3D hero: a patient model that turns slowly on its own, follows the
// pointer 1:1 when dragged, keeps the flick's momentum on release and eases back
// into the idle turn. The text ring around it turns with the model.
//
// Usage: <div class="hero3d" data-model="models/hip-sample.bin" data-ring="…"></div>
//        <script type="module">import { mountAll } from './js/hero3d.js'; mountAll();</script>

const THREE_URL = new URL('./vendor/three.module.min.js', import.meta.url).href;

const IDLE_SPEED = 0.32;        // rad/s, the resting turntable speed
const DRAG_GAIN = 0.0085;       // rad per CSS pixel dragged
const DECELERATION = 0.996;     // per millisecond; a bit quicker than scroll so a flick turns ~½ a revolution
const MAX_FLING = 12;           // rad/s
const PITCH_REST = 0.08;        // a slight look-down at rest
const PITCH_LIMIT = 0.45;       // past this the drag rubber-bands
const SPRING_RESPONSE = 0.4;    // s, critically damped return of pitch / reset

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function mountAll(selector = '.hero3d') {
  document.querySelectorAll(selector).forEach((el) => {
    // Load three.js only when the section is about to be seen.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); mount(el); }
    }, { rootMargin: '300px' });
    io.observe(el);
  });
}

async function mount(root) {
  const [THREE, mesh] = await Promise.all([import(THREE_URL), loadMesh(root.dataset.model)]);

  const stage = root.querySelector('.hero3d-stage');
  const ring = root.querySelector('.hero3d-ring');
  const hint = root.querySelector('.hero3d-hint');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: root.hasAttribute('data-capture') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'hero3d-canvas';
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 5000);

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x1a1a22, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-1.2, 1.6, 2.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(1.5, 0.2, 1.2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.6); rim.position.set(1.4, 1.0, -2.0); scene.add(rim);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: 0xece2c8, roughness: 0.55, metalness: 0 });
  const model = new THREE.Mesh(geometry, material);
  const pivot = new THREE.Group(); pivot.add(model); scene.add(pivot);
  const radius = geometry.boundingSphere.radius;

  // ---- state -------------------------------------------------------------
  let yaw = -0.45, pitch = PITCH_REST;
  let yawVel = reducedMotion.matches ? 0 : IDLE_SPEED, pitchVel = 0;
  let idleDir = 1;
  let dragging = false, resetting = false;
  let history = [];             // recent {t, x, y} for release velocity
  let last = performance.now();
  let visible = true, running = false;

  // ---- sizing: fit the model inside the ring -----------------------------
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // clientWidth, not getBoundingClientRect: the ring is rotated, which inflates its box
    const ringPx = (ring && ring.clientWidth) ? ring.clientWidth / 2 : Math.min(w, h) * 0.42;
    const targetPx = ringPx * 0.8;    // model's bounding-sphere radius on screen
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, radius * (h / 2) / (targetPx * tanHalf));
    camera.near = camera.position.z / 10; camera.far = camera.position.z * 10;
    camera.updateProjectionMatrix();
    frame();
  }
  new ResizeObserver(resize).observe(stage);

  // ---- animation loop: runs only while something moves --------------------
  function wake() { if (!running && visible) { running = true; last = performance.now(); requestAnimationFrame(tick); } }

  function tick(now) {
    const dt = Math.min(now - last, 64); last = now;
    const s = dt / 1000;
    if (!dragging) {
      const idle = reducedMotion.matches ? 0 : IDLE_SPEED * idleDir;
      if (resetting) {
        // critically damped spring to the front view
        const k = (2 * Math.PI / SPRING_RESPONSE) ** 2, c = 2 * Math.sqrt(k);
        const target = Math.round((yaw + 0.45) / (2 * Math.PI)) * 2 * Math.PI - 0.45;
        yawVel += (-k * (yaw - target) - c * yawVel) * s;
        if (Math.abs(yaw - target) < 0.001 && Math.abs(yawVel) < 0.01) { resetting = false; yaw = target; yawVel = idle; }
      } else {
        // flick momentum decays like scrolling, then blends into the idle turn
        const decay = Math.pow(DECELERATION, dt);
        yawVel = idle + (yawVel - idle) * decay;
      }
      // pitch springs back to rest (no overshoot)
      const k = (2 * Math.PI / SPRING_RESPONSE) ** 2, c = 2 * Math.sqrt(k);
      pitchVel += (-k * (pitch - PITCH_REST) - c * pitchVel) * s;
      pitch += pitchVel * s;
      yaw += yawVel * s;
    }
    frame();
    const settled = !dragging && !resetting && Math.abs(pitch - PITCH_REST) < 0.0005 && Math.abs(yawVel) < 0.0005;
    if (visible && !settled) requestAnimationFrame(tick); else running = false;
  }

  function frame() {
    pivot.rotation.set(pitch, yaw, 0, 'XYZ');
    if (ring) ring.style.transform = `rotate(${(yaw * 180 / Math.PI).toFixed(2)}deg)`;
    renderer.render(scene, camera);
  }

  // ---- direct manipulation -------------------------------------------------
  const rubber = (x, limit) => {
    const over = Math.abs(x) - limit;
    if (over <= 0) return x;
    const d = 1, c = 0.55;   // progressive resistance past the limit
    return Math.sign(x) * (limit + (over * d * c) / (d + c * over));
  };
  let rawPitch = pitch;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    dragging = true; resetting = false;
    rawPitch = pitch;
    history = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
    stage.classList.add('is-dragging');
    hint && hint.classList.add('is-hidden');
    wake();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const prev = history[history.length - 1];
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    yaw += dx * DRAG_GAIN;
    if (e.pointerType === 'mouse') { rawPitch += dy * DRAG_GAIN; pitch = rubber(rawPitch, PITCH_LIMIT); }
    history.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (history.length > 2 && e.timeStamp - history[0].t > 100) history.shift();
    frame();
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    const first = history[0], end = history[history.length - 1];
    const span = Math.max(end.t - first.t, 1);
    const stale = e.timeStamp - end.t > 80;            // finger stopped before lifting
    const raw = stale ? 0 : ((end.x - first.x) / span) * 1000 * DRAG_GAIN;   // rad/s
    const v = Math.max(-MAX_FLING, Math.min(MAX_FLING, raw));
    yawVel = reducedMotion.matches ? 0 : v;
    if (Math.abs(v) > 0.05) idleDir = Math.sign(v);   // keep turning the way it was thrown
    pitchVel = 0;
    wake();
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('dblclick', () => { resetting = true; wake(); });

  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      yawVel = (e.key === 'ArrowLeft' ? -1 : 1) * 2.2;
      idleDir = Math.sign(yawVel);
      hint && hint.classList.add('is-hidden');
      wake();
    } else if (e.key === 'Home' || e.key === 'Enter') { resetting = true; wake(); }
  });

  // ---- pause when off-screen or in a background tab ------------------------
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) wake(); }).observe(root);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) wake(); });
  reducedMotion.addEventListener('change', () => { yawVel = reducedMotion.matches ? 0 : IDLE_SPEED * idleDir; wake(); });

  resize();
  root.classList.add('is-ready');
  wake();
  root.hero3d = { renderer, frame };
}

async function loadMesh(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const view = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'ADV1') throw new Error('Unknown model format');
  const nv = view.getUint32(4, true), nt = view.getUint32(8, true);
  let o = 12;
  const positions = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const normals = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const indices = new Uint16Array(buf, o, nt * 3);
  return { positions, normals, indices };
}
