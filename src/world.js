// The 3D world: a low-poly Mars landing site with rover TICK-1.
// Everything is built from primitives in code, so the project ships no art assets.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const { smoothstep, lerp, clamp } = THREE.MathUtils;
const HOME = new THREE.Vector3(11.5, 6.4, 14.8);
const TARGET = new THREE.Vector3(0, 1.9, 0);

/** Terrain height: flat around the landing pad, dunes further out, hills on the horizon. */
function height(x, z) {
  const r = Math.hypot(x, z);
  let h = 1.4 * Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.045) + 0.7 * Math.sin(x * 0.13 + z * 0.09)
    + 0.3 * Math.sin(x * 0.31 - 0.2) * Math.sin(z * 0.27 + 1);
  h += smoothstep(r, 45, 140) * (9 + 7 * Math.sin(x * 0.021 + 2) * Math.cos(z * 0.018));
  return h * smoothstep(r, 9, 24);
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.1, ...o });
function mesh(geo, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

function buildSky(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#150d2b') }, mid: { value: new THREE.Color('#8a3b2f') }, low: { value: new THREE.Color('#f0a35c') } },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 p; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(p).y; vec3 c = mix(low, mid, smoothstep(-0.02, 0.22, h)); c = mix(c, top, smoothstep(0.16, 0.7, h)); gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = 0.25 + Math.random() * 1.2;
    pos.set([Math.cos(a) * Math.cos(e) * 420, Math.sin(e) * 420, Math.sin(a) * Math.cos(e) * 420], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff3e0', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false })));
  // a small, pale sun low on the horizon (Mars sunsets are blue-white near the sun)
  const sun = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: '#dff1ff', fog: false }));
  sun.position.set(-260, 52, -300); scene.add(sun);
}

function buildTerrain(scene) {
  let geo = new THREE.PlaneGeometry(420, 420, 150, 150); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  geo = geo.toNonIndexed();
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const dark = new THREE.Color('#7c3520'), base = new THREE.Color('#b65a31'), light = new THREE.Color('#e39457'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, k = clamp(0.45 + y * 0.07 + (Math.random() - 0.5) * 0.35, 0, 1);
    c.copy(k < 0.5 ? dark : base).lerp(k < 0.5 ? base : light, k < 0.5 ? k * 2 : k * 2 - 1);
    for (let j = 0; j < 3; j++) c.toArray(col, (i + j) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true; scene.add(ground);
  const rockMat = [mat('#6b3324', { roughness: 1 }), mat('#8a4a30', { roughness: 1 }), mat('#4d2a22', { roughness: 1 })];
  const geos = [new THREE.IcosahedronGeometry(1, 0), new THREE.DodecahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0)];
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2, r = 8.5 + Math.random() ** 1.6 * 80, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.15 + Math.random() ** 2.2 * 2.2;
    const rock = mesh(geos[i % 3], rockMat[i % 3], x, height(x, z) + s * 0.25, z, scene);
    rock.scale.set(s * (0.7 + Math.random() * 0.8), s * (0.5 + Math.random() * 0.6), s * (0.7 + Math.random() * 0.8));
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  }
}

function buildPad(scene) {
  const pad = new THREE.Group();
  mesh(new THREE.CylinderGeometry(6.2, 6.8, 0.5, 8), mat('#3a3f4c', { metalness: 0.5, roughness: 0.55 }), 0, 0.2, 0, pad);
  mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.06, 8), mat('#2a2e38', { metalness: 0.6, roughness: 0.4 }), 0, 0.47, 0, pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.06, 6, 8), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff9a3c', emissiveIntensity: 2.2 }));
  ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 8; ring.position.y = 0.47; pad.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), mat('#555b6b', { metalness: 0.5 }), Math.cos(a) * 6.4, 0.25, Math.sin(a) * 6.4, pad).rotation.y = -a;
  }
  scene.add(pad);
}

function buildRover(scene) {
  const rover = new THREE.Group(), parts = {};
  const white = mat('#cfc9bc'), dark = mat('#26282f', { roughness: 0.9 }), metal = mat('#aeb4c2', { metalness: 0.7, roughness: 0.35 }), gold = mat('#d2a23f', { metalness: 0.85, roughness: 0.35 });
  parts.body = mesh(new THREE.BoxGeometry(3.3, 0.75, 2.0), white, 0, 1.3, 0, rover);
  mesh(new THREE.BoxGeometry(2.9, 0.28, 1.7), gold, 0, 0.83, 0, rover);
  mesh(new THREE.BoxGeometry(2.7, 0.08, 1.75), mat('#17265a', { metalness: 0.7, roughness: 0.25 }), -0.15, 1.72, 0, rover);
  for (let i = -3; i <= 3; i++) mesh(new THREE.BoxGeometry(0.02, 0.09, 1.75), metal, -0.15 + i * 0.38, 1.722, 0, rover).castShadow = false;
  mesh(new THREE.BoxGeometry(0.5, 0.5, 2.06), mat('#e2562f'), -1.25, 1.3, 0, rover); // livery stripe
  // rocker-bogie suspension and six wheels
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.38, 10); wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.4, 6); hubGeo.rotateX(Math.PI / 2);
  parts.wheels = [];
  for (const side of [-1, 1]) {
    mesh(new THREE.BoxGeometry(2.9, 0.1, 0.1), metal, 0, 0.95, side * 1.28, rover);
    for (const x of [-1.35, 0, 1.35]) {
      mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), metal, x, 0.72, side * 1.28, rover);
      const w = mesh(wheelGeo, dark, x, 0.5, side * 1.36, rover); mesh(hubGeo, metal, 0, 0, 0, w); parts.wheels.push(w);
    }
  }
  // sampling drill at the front (state machine mission): hidden until that mission uses it
  parts.drill = mesh(new THREE.CylinderGeometry(0.07, 0.03, 1.3, 6), metal, 1.72, 0.9, 0, rover); parts.drill.visible = false;
  mesh(new THREE.BoxGeometry(0.3, 0.16, 0.3), mat('#e2562f'), 0, 0.6, 0, parts.drill);
  // camera mast
  parts.mastPole = mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.5, 6), metal, 1.05, 2.45, 0.45, rover);
  parts.head = new THREE.Group(); parts.head.position.set(1.05, 3.3, 0.45); rover.add(parts.head);
  mesh(new THREE.BoxGeometry(0.78, 0.4, 0.46), white, 0, 0, 0, parts.head);
  const lens = new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10); lens.rotateZ(Math.PI / 2);
  parts.lensMat = new THREE.MeshStandardMaterial({ color: '#05060a', emissive: '#3aa0ff', emissiveIntensity: 0.9, roughness: 0.1 });
  for (const z of [-0.12, 0.12]) mesh(lens, parts.lensMat, 0.42, 0, z, parts.head);
  // high-gain antenna
  parts.dish = new THREE.Group(); parts.dish.position.set(-0.9, 1.75, -0.45); rover.add(parts.dish);
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6), metal, 0, 0.45, 0, parts.dish);
  const bowl = mesh(new THREE.SphereGeometry(0.75, 10, 4, 0, Math.PI * 2, 0, 0.9), mat('#d6d2c8', { side: THREE.DoubleSide }), 0, 1.72, 0, parts.dish);
  bowl.rotation.x = Math.PI; bowl.rotation.z = 0.5;
  // telemetry whip antenna with a tip that flashes on every packet (fitted in stage 2)
  parts.radio = new THREE.Group(); parts.radio.position.set(-1.45, 1.7, -0.75); rover.add(parts.radio);
  mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 5), metal, 0, 0.75, 0, parts.radio);
  parts.radioMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#5fe3ff', emissiveIntensity: 0.1 });
  mesh(new THREE.SphereGeometry(0.08, 8, 6), parts.radioMat, 0, 1.52, 0, parts.radio).castShadow = false;
  // bench stands: the stage 1 prototype sits on blocks with its wheels off the ground
  parts.stands = new THREE.Group(); rover.add(parts.stands);
  for (const x of [-1.0, 1.0]) for (const z of [-0.6, 0.6]) mesh(new THREE.BoxGeometry(0.35, 0.92, 0.35), mat('#7a5a2c', { roughness: 1 }), x, 0.23, z, parts.stands);
  // the flight computer, visible on deck, with a load strip that goes from cyan (idle) to red (pegged)
  mesh(new THREE.BoxGeometry(0.8, 0.06, 0.5), mat('#0c6f4c', { roughness: 0.5 }), 0.25, 1.8, 0.3, rover);
  mesh(new THREE.BoxGeometry(0.36, 0.08, 0.28), metal, 0.35, 1.86, 0.3, rover);
  parts.load = mesh(new THREE.BoxGeometry(0.7, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#35d6ff', emissiveIntensity: 1.5 }), 0.25, 1.84, 0.6, rover);
  parts.load.castShadow = false;
  // the two LEDs the firmware drives
  const led = (name, color, geo, x, y, z, range, peak) => {
    const m = new THREE.MeshStandardMaterial({ color: '#15110c', emissive: color, emissiveIntensity: 0.04, roughness: 0.3 });
    const lamp = mesh(geo, m, x, y, z, rover); lamp.castShadow = false;
    const light = new THREE.PointLight(color, 0, range, 1.6); light.position.set(x, y + 0.1, z); rover.add(light);
    parts[name] = { lamp, light, on: false, level: 0, peak };
  };
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 6), metal, -1.35, 2.05, 0.75, rover);
  led('BEACON', '#ff9a2e', new THREE.SphereGeometry(0.2, 10, 8), -1.35, 2.52, 0.75, 16, 34);
  led('HEART', '#3dff8e', new THREE.BoxGeometry(0.2, 0.2, 0.06), 1.1, 1.36, 1.02, 6, 5);
  rover.position.y = 0.48; rover.rotation.y = -0.35;
  scene.add(rover);
  return { rover, parts };
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#b9623c', 0.0105);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200); camera.position.set(34, 17, 44);

  scene.add(new THREE.HemisphereLight('#ffb98a', '#3b1c16', 0.75));
  const sun = new THREE.DirectionalLight('#ffd9b0', 2.1); sun.position.set(-26, 16, -14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 }); scene.add(sun);
  const fill = new THREE.DirectionalLight('#8a8dff', 0.45); fill.position.set(12, 8, 16); scene.add(fill);

  buildSky(scene); buildTerrain(scene); buildPad(scene);
  const { rover, parts } = buildRover(scene);

  // drifting dust
  const DN = 500, dpos = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) dpos.set([(Math.random() - 0.5) * 60, Math.random() * 9, (Math.random() - 0.5) * 60], i * 3);
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  scene.add(new THREE.Points(dgeo, new THREE.PointsMaterial({ color: '#ffd2a6', size: 0.07, transparent: true, opacity: 0.55, depthWrite: false })));
  // celebration sparks
  const SN = 160, spos = new Float32Array(SN * 3), svel = new Float32Array(SN * 3);
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const sparks = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: '#ffd27a', size: 0.16, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; scene.add(sparks);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 7, maxDistance: 40, maxPolarAngle: Math.PI / 2 - 0.06, autoRotate: true, autoRotateSpeed: 0.35 });
  controls.target.copy(TARGET);
  let idleFor = 0, mayRotate = true;   // mayRotate: the player's choice (the ROTATE box in the top bar)
  controls.addEventListener('start', () => { controls.autoRotate = false; idleFor = 0; });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.65, 1.0); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const fx = { crash: 0, joy: 0, fly: null, cpu: 0, cpuShown: 0, time: 0, spin: 0, cam: 0, radio: 0, mast: 0, base: 0.48 };
  const inset = { left: 0, bottom: 0, right: 0, top: 0 };
  const idleCol = new THREE.Color('#35d6ff'), hotCol = new THREE.Color('#ff3b2e'), tmp = new THREE.Vector3();
  let W = 1, Hh = 1;

  // Distance at which the rover fills a bit over half of the area the HUD leaves free. The view-offset trick enlarges
  // the picture when panels take space, so the camera backs off by the same factor.
  const fitDistance = () => clamp(9.9 * (Hh + inset.bottom + inset.top) / Math.max(120, Hh - inset.bottom - inset.top), 18, 36);
  const home = () => HOME.clone().sub(TARGET).setLength(fitDistance()).add(TARGET);
  function resize() {
    W = canvas.clientWidth || window.innerWidth; Hh = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, Hh, false); composer.setSize(W, Hh);
    // the scene centre lands in the middle of the area the HUD leaves free: right of the console, left of the objectives, below the top bar, above the deck
    camera.aspect = (W + inset.left + inset.right) / (Hh + inset.bottom + inset.top);
    camera.setViewOffset(W + inset.left + inset.right, Hh + inset.bottom + inset.top, inset.right, inset.bottom, W, Hh);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  function update(dt) {
    fx.time += dt;
    if (fx.fly) { // cinematic fly-in from the title screen
      fx.fly.t = Math.min(1, fx.fly.t + dt / fx.fly.dur);
      const k = 1 - Math.pow(1 - fx.fly.t, 3);
      camera.position.lerpVectors(fx.fly.from, home(), k);
      if (fx.fly.t >= 1) { fx.fly = null; controls.enabled = true; }
    } else if (mayRotate && !controls.autoRotate && (idleFor += dt) > 14) controls.autoRotate = true;
    controls.update();
    for (const name of ['BEACON', 'HEART']) {
      const l = parts[name]; l.level = lerp(l.level, l.on ? 1 : 0, 1 - Math.exp(-dt * 30));
      l.lamp.material.emissiveIntensity = 0.04 + l.level * 6; l.light.intensity = l.level * l.peak;
    }
    fx.cpuShown = lerp(fx.cpuShown, fx.cpu, 1 - Math.exp(-dt * 8));
    parts.load.material.emissive.copy(idleCol).lerp(hotCol, fx.cpuShown);
    parts.load.material.emissiveIntensity = fx.sleep === 2 ? 0 : fx.sleep === 1 ? 0.35 : 1.2 + fx.cpuShown * 3 + (fx.cpuShown > 0.9 ? Math.sin(fx.time * 30) * 0.8 : 0);
    parts.head.rotation.y = Math.sin(fx.time * 0.4) * 0.5; // the cameras look around
    // drive, camera and radio activity, pulsed by the firmware
    const turn = fx.spin * (1 - Math.exp(-dt * 6)); fx.spin -= turn; for (const w of parts.wheels) w.rotation.z -= turn;
    if (fx.drive) for (const w of parts.wheels) w.rotation.z -= dt * 5;
    if (parts.drill.visible) { parts.drill.position.y = lerp(parts.drill.position.y, fx.drill ? 0.2 : 0.9, 1 - Math.exp(-dt * 7)); if (fx.drill) parts.drill.rotation.y += dt * 22; }
    fx.cam = Math.max(0, fx.cam - dt * 2.5); parts.lensMat.emissiveIntensity = fx.sleep === 2 ? 0 : 0.9 + fx.cam * 9;
    fx.mast = Math.max(0, fx.mast - dt * 6); parts.mastPole.scale.set(1 + fx.mast * 0.5, 1, 1 + fx.mast * 0.5); // spectrometer sample: the mast pulses
    fx.radio = Math.max(0, fx.radio - dt * 4); parts.radioMat.emissiveIntensity = 0.1 + fx.radio * 8;
    // crash: the rover shudders and its hull flashes red
    fx.crash = Math.max(0, fx.crash - dt * 0.9);
    rover.position.x = (Math.random() - 0.5) * 0.12 * fx.crash;
    parts.body.material.emissive.setRGB(fx.crash * (Math.random() > 0.5 ? 0.9 : 0.1), 0, 0);
    // success: a little hop, a dish spin and sparks
    fx.joy = Math.max(0, fx.joy - dt * 0.45);
    rover.position.y = fx.base + Math.abs(Math.sin(fx.joy * Math.PI * 4)) * 0.35 * fx.joy;
    parts.dish.rotation.y += dt * (0.2 + fx.joy * 9);
    parts.dish.rotation.z = lerp(parts.dish.rotation.z, fx.dishUp ? 0 : 1.25, 1 - Math.exp(-dt * 5));
    if (sparks.material.opacity > 0) {
      for (let i = 0; i < SN; i++) { svel[i * 3 + 1] -= 9 * dt; for (let j = 0; j < 3; j++) spos[i * 3 + j] += svel[i * 3 + j] * dt; }
      sgeo.attributes.position.needsUpdate = true; sparks.material.opacity = Math.max(0, sparks.material.opacity - dt * 0.5);
    }
    for (let i = 0; i < DN; i++) { let x = dpos[i * 3] + dt * (0.6 + (i % 7) * 0.08); if (x > 30) x = -30; dpos[i * 3] = x; }
    dgeo.attributes.position.needsUpdate = true;
    if (W > 1 && Hh > 1) composer.render();
  }

  return {
    update, resize, camera, controls,
    /** Keep the rover centred in the part of the screen the HUD leaves free. */
    setInsets(left, bottom, right = 0, top = 0) {
      inset.left = left; inset.bottom = bottom; inset.right = right; inset.top = top; resize();
      if (!fx.fly) { const dir = camera.position.clone().sub(controls.target).setLength(fitDistance()); camera.position.copy(controls.target).add(dir); }   // keep the whole rover inside the free area
    },
    /** 0 = awake, 1 = light sleep, 2 = deep sleep: the flight computer's strip and the camera lenses go dark */
    setSleep(level) { fx.sleep = level; },
    /** the slow turn of the camera around the rover: off keeps the view where the player left it (dragging still works) */
    setAutoRotate(on) { mayRotate = !!on; controls.autoRotate = mayRotate; idleFor = 0; },
    setPin(name, on) { if (parts[name]) parts[name].on = !!on; },
    /** state machine mission: wheels turning steadily, drill lowered under the rover */
    setMotion(wheels, drill) { fx.drive = !!wheels; fx.drill = !!drill; parts.drill.visible = true; },
    /** deployed (pointing up) or stowed (folded flat) */
    setAntenna(up) { fx.dishUp = !!up; },
    /** Show the hardware the rover has at this stage of the journey. Stage 1 is a bench prototype on stands. */
    setStage(n) {
      const driving = n >= 2;
      parts.stands.visible = !driving; fx.base = driving ? 0.48 : 0.72;
      parts.mastPole.visible = parts.head.visible = parts.radio.visible = driving;
      parts.dish.visible = n >= 9;   // the high-gain antenna arrives with stage 9
    },
    /** A rover function ran: show it on the hardware. */
    pulse(kind) { if (kind === 'bump') fx.crash = Math.max(fx.crash, 0.35); else if (kind === 'wheel') fx.spin += 0.35; else if (kind === 'cam') fx.cam = 1; else if (kind === 'radio') fx.radio = 1; else if (kind === 'mast') fx.mast = 1; },
    setCpu(load) { fx.cpu = clamp(load, 0, 1); },
    reset() { fx.drive = false; fx.drill = false; parts.BEACON.on = parts.HEART.on = false; fx.cpu = 0; fx.crash = 0; fx.sleep = 0; fx.dishUp = false; },
    crash() { fx.crash = 1; parts.BEACON.on = parts.HEART.on = false; },
    celebrate() {
      fx.joy = 1; sparks.material.opacity = 1;
      for (let i = 0; i < SN; i++) {
        spos.set([rover.position.x, 2.2, 0], i * 3);
        const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
        svel.set([Math.cos(a) * s, 5 + Math.random() * 6, Math.sin(a) * s], i * 3);
      }
    },
    flyIn(dur = 2.8) { controls.enabled = false; fx.fly = { t: 0, dur, from: camera.position.clone() }; },
    /** Screen position of a named rover part, for HUD callouts. */
    anchor(name) {
      const l = parts[name]; if (!l) return null;
      l.lamp.getWorldPosition(tmp).project(camera);
      return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * Hh, visible: tmp.z < 1 };
    },
  };
}
