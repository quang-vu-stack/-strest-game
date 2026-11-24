import * as THREE from 'three';
import { bench, canWalk, floorHeight, makePlayer, makeWorld } from './world.js';
import { ambientAudioAvailable, disposeAmbientAudio, setAmbientEnabled } from './ambient-audio.js';
import './style.css';

const game = document.querySelector('#game');
const view = document.querySelector('#view');
const rainButton = document.querySelector('#rain');
const motionButton = document.querySelector('#motion');
const audioButton = document.querySelector('#audio');
const waterButton = document.querySelector('#water');
const seatButton = document.querySelector('#seat');
const duskButton = document.querySelector('#dusk');
const tip = document.querySelector('#tip');
const idleTip = tip.textContent;
const keys = new Set();
const movement = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch {
  document.querySelector('#error').hidden = false;
  document.querySelector('.settings').hidden = true;
  document.querySelector('.guide').hidden = true;
}

if (renderer) startGame();

function startGame() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.21;
  view.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x7f9c89, 0.016);
  const camera = new THREE.OrthographicCamera();
  const cameraOffset = new THREE.Vector3(17, 23, 28);
  const focus = new THREE.Vector3();
  const cameraUp = new THREE.Vector2(-cameraOffset.x, -cameraOffset.z).normalize();
  const cameraRight = new THREE.Vector2(-cameraUp.y, cameraUp.x);
  const skyLight = new THREE.HemisphereLight(0xffe8bd, 0x7a8b9a, 2.15);
  scene.add(skyLight);
  const sunlight = new THREE.DirectionalLight(0xffe0a8, 2.25);
  sunlight.position.set(-12, 14, 6);
  scene.add(sunlight);
  const { ground, planters, ripples, lanterns } = makeWorld(scene);
  const { player, umbrella, poseSeated } = makePlayer(scene);
  const daylightFog = scene.fog.color.clone();
  const duskFog = new THREE.Color(0x49566f);
  const daylightSky = skyLight.color.clone();
  const duskSky = new THREE.Color(0xadb8f8);
  player.position.set(-2.3, 0, 4.2);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({
    color: 0x203d37, opacity: 0.29, transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const drops = Array.from({ length: 270 }, () => ({
    x: Math.random() * 43 - 21.5,
    y: Math.random() * 15,
    z: Math.random() * 34 - 17,
  }));
  const rainVertices = new Float32Array(drops.length * 6);
  const rainGeometry = new THREE.BufferGeometry();
  const rainAttribute = new THREE.BufferAttribute(rainVertices, 3).setUsage(THREE.DynamicDrawUsage);
  rainGeometry.setAttribute('position', rainAttribute);
  const rainLines = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({
    color: 0xf1ffe9, opacity: 0.3, transparent: true, depthWrite: false,
  }));
  rainLines.frustumCulled = false;
  scene.add(rainLines);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const touchTarget = new THREE.Vector2();
  const direction = new THREE.Vector2();
  const frameFocus = new THREE.Vector3();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let hasDestination = false;
  let raining = true;
  let dusk = false;
  let lighting = 0;
  let seated = false;
  let nearBench = false;
  let lowMotion = motionPreference.matches;
  let nearest = null;
  let lastFrame = performance.now();
  let worldTime = 0;
  let aspect = 1;

  function resize() {
    const width = Math.max(1, view.clientWidth);
    const height = Math.max(1, view.clientHeight);
    aspect = width / height;
    const span = Math.min(20, 16.6 * aspect);
    camera.left = -span;
    camera.right = span;
    camera.top = span / aspect;
    camera.bottom = -span / aspect;
    camera.near = 0.1;
    camera.far = 130;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  new ResizeObserver(resize).observe(view);
  resize();

  function updateWeather() {
    rainButton.setAttribute('aria-pressed', raining);
    motionButton.setAttribute('aria-pressed', lowMotion);
    game.toggleAttribute('data-low-motion', lowMotion);
    umbrella.visible = raining;
    rainLines.visible = raining && !lowMotion;
    for (const ring of ripples) ring.visible = raining && !lowMotion;
  }

  rainButton.addEventListener('click', () => {
    raining = !raining;
    updateWeather();
  });
  duskButton.addEventListener('click', () => {
    dusk = !dusk;
    duskButton.setAttribute('aria-pressed', dusk);
    game.toggleAttribute('data-dusk', dusk);
  });
  motionButton.addEventListener('click', () => {
    lowMotion = !lowMotion;
    updateWeather();
  });
  motionPreference.addEventListener('change', event => {
    lowMotion = event.matches;
    updateWeather();
  });
  updateWeather();

  let audioRequest = 0;
  audioButton.hidden = !ambientAudioAvailable;
  audioButton.addEventListener('click', async () => {
    const request = ++audioRequest;
    const enabled = audioButton.getAttribute('aria-pressed') !== 'true';
    audioButton.setAttribute('aria-pressed', enabled);
    try {
      const active = await setAmbientEnabled(enabled);
      if (enabled && active === false && request === audioRequest) {
        audioButton.setAttribute('aria-pressed', false);
      }
    } catch {
      if (enabled && request === audioRequest) audioButton.setAttribute('aria-pressed', false);
    }
  });
  window.addEventListener('pagehide', () => {
    audioRequest++;
    audioButton.setAttribute('aria-pressed', false);
    disposeAmbientAudio();
  });

  function waterPlant() {
    if (!nearest || nearest.watered) return;
    nearest.watered = 0.001;
    tip.textContent = planters.every(pot => pot.watered) ? 'Cả vườn đã nở hoa.' : 'Một bông hoa vừa nở.';
    waterButton.hidden = true;
  }
  function toggleSeat() {
    if (!seated && !nearBench) return;
    seated = !seated;
    keys.clear();
    hasDestination = false;
    poseSeated(seated);
    if (seated) {
      player.position.set(bench.x, bench.seatHeight, bench.z);
      player.rotation.y = Math.PI;
      shadow.position.set(bench.x, 0.04, bench.z);
      tip.textContent = 'Ngồi ngắm mặt hồ. Khi muốn đi tiếp, bấm Đứng dậy.';
    } else {
      player.position.set(bench.x, 0, bench.z - 0.77);
      tip.textContent = 'Bạn có thể ngồi nghỉ bên hồ.';
    }
    seatButton.textContent = seated ? 'Đứng dậy' : 'Ngồi nghỉ';
  }

  waterButton.addEventListener('click', waterPlant);
  seatButton.addEventListener('click', toggleSeat);
  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (movement.includes(event.code)) {
      event.preventDefault();
      hasDestination = false;
      if (!seated) keys.add(event.code);
    }
    if (event.code === 'KeyE' && !event.repeat) {
      if (nearBench || seated) toggleSeat();
      else waterPlant();
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  renderer.domElement.addEventListener('pointerup', event => {
    if (seated || !event.isPrimary || event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(ground, true)[0];
    if (hit && canWalk(hit.point.x, hit.point.z)) {
      touchTarget.set(hit.point.x, hit.point.z);
      hasDestination = true;
    }
  });

  function updatePlayer(dt) {
    if (seated) return;
    const vertical = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    direction.copy(cameraUp).multiplyScalar(vertical).addScaledVector(cameraRight, horizontal);
    const position = player.position;
    let distance = dt * 3.9;
    if (hasDestination) {
      direction.set(touchTarget.x - position.x, touchTarget.y - position.z);
      distance = Math.min(distance, direction.length());
      if (direction.lengthSq() < 0.0025) hasDestination = false;
    }
    if (direction.lengthSq() > 0.000001) {
      direction.normalize();
      const dx = direction.x * distance;
      const dz = direction.y * distance;
      let moved = false;
      if (canWalk(position.x + dx, position.z)) {
        position.x += dx;
        moved = moved || Math.abs(dx) > 0.00001;
      }
      if (canWalk(position.x, position.z + dz)) {
        position.z += dz;
        moved = moved || Math.abs(dz) > 0.00001;
      }
      if (!moved && dt > 0) hasDestination = false;
      player.rotation.y = Math.atan2(direction.x, direction.y);
    }
    position.y = floorHeight(position.x, position.z);
    shadow.position.set(position.x, position.y + 0.04, position.z);
    const close = planters.find(pot => Math.hypot(pot.x - position.x, pot.z - position.z) < 1.54) ?? null;
    const benchInReach = Math.hypot(bench.x - position.x, bench.z - position.z) < 1.81;
    if (close !== nearest || nearBench !== benchInReach) {
      nearest = close;
      nearBench = benchInReach;
      seatButton.hidden = !nearBench;
      waterButton.hidden = nearBench || !close || Boolean(close.watered);
      if (nearBench) tip.textContent = 'Bạn có thể ngồi nghỉ bên hồ.';
      else if (close) tip.textContent = close.watered ? 'Chậu hoa này đã nở.' : 'Bạn có thể tưới chậu cây này.';
      else tip.textContent = idleTip;
    }
  }

  function updateFlowers(dt) {
    for (const pot of planters) {
      if (!pot.watered || pot.watered === 1) continue;
      pot.watered = lowMotion ? 1 : Math.min(1, pot.watered + dt * 1.8);
      pot.flower.scale.setScalar(1 - (1 - pot.watered) ** 3);
    }
  }

  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.04, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    worldTime += dt;
    updatePlayer(dt);
    updateFlowers(dt);

    lighting = THREE.MathUtils.damp(lighting, Number(dusk), 5, dt);
    if (lowMotion || Math.abs(lighting - Number(dusk)) < 0.001) lighting = Number(dusk);
    scene.fog.color.lerpColors(daylightFog, duskFog, lighting);
    skyLight.color.lerpColors(daylightSky, duskSky, lighting);
    skyLight.intensity = THREE.MathUtils.lerp(2.15, 0.96, lighting);
    sunlight.intensity = THREE.MathUtils.lerp(2.25, 0.33, lighting);
    lanterns.glass.emissiveIntensity = THREE.MathUtils.lerp(0.04, 1.95, lighting);
    lanterns.poolMaterial.opacity = lighting * 0.43;

    const cameraFollow = aspect < 1.18 ? 0.75 : seated ? 0.46 : 0;
    frameFocus.set(player.position.x * cameraFollow, 0.5, player.position.z * cameraFollow - (seated ? 1.4 : 0));
    const targetZoom = seated ? 1.19 : 1;
    if (Math.abs(targetZoom - camera.zoom) > 0.001) {
      camera.zoom = lowMotion ? targetZoom : THREE.MathUtils.damp(camera.zoom, targetZoom, 4, dt);
      camera.updateProjectionMatrix();
    }
    focus.lerp(frameFocus, lowMotion ? 1 : 1 - Math.exp(-dt * 6));
    camera.position.copy(focus).add(cameraOffset);
    camera.lookAt(focus);
    if (rainLines.visible) {
      for (const [i, drop] of drops.entries()) {
        drop.y = (drop.y - dt * 7 + 15) % 15;
        const j = i * 6;
        rainVertices[j] = drop.x + drop.y * 0.11;
        rainVertices[j + 1] = drop.y;
        rainVertices[j + 2] = drop.z;
        rainVertices[j + 3] = rainVertices[j] + 0.045;
        rainVertices[j + 4] = drop.y + 0.38;
        rainVertices[j + 5] = drop.z;
      }
      rainAttribute.needsUpdate = true;
      ripples.forEach((ring, i) => {
        const phase = (worldTime * 0.5 + i * 0.28) % 1;
        ring.scale.setScalar(0.07 + phase * 0.64);
        ring.material.opacity = (1 - phase) * 0.43;
      });
    }
    renderer.render(scene, camera);
  });
}
