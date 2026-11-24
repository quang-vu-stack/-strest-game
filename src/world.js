import * as THREE from 'three';

const terrain = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.IcosahedronGeometry(1, 0);
const rounded = new THREE.IcosahedronGeometry(1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 9);
const cone = new THREE.ConeGeometry(1, 1, 10);
const materials = new Map();

function mesh(parent, shape, color, position, scale) {
  if (!materials.has(color)) {
    materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.87, flatShading: true }));
  }
  const object = new THREE.Mesh(shape, materials.get(color));
  object.position.set(...position);
  object.scale.set(...scale);
  parent.add(object);
  return object;
}

export const pond = { left: 2.4, right: 12, back: -8, front: -2.3 };
export const bridge = { left: 6.4, right: 8.2 };
export const playerBounds = { left: -13.8, right: 13.8, back: -9.8, front: 9.8 };

export function canWalk(x, z) {
  if (x < playerBounds.left || x > playerBounds.right || z < playerBounds.back || z > playerBounds.front) return false;
  if (x > -11.2 && x < -5.9 && z > -7.4 && z < -3.5) return false;
  const withinPond = x > pond.left && x < pond.right && z > pond.back && z < pond.front;
  return !withinPond || (x > bridge.left && x < bridge.right);
}

export function floorHeight(x, z) {
  if (x <= bridge.left || x >= bridge.right) return 0;
  return Math.max(0, 0.22 - 0.37 * Math.max(pond.back - z, z - pond.front, 0));
}

function pine(scene, x, z, size) {
  const palette = [0x426c59, 0x5f8667, 0x83a573];
  mesh(scene, cylinder, 0x674c39, [x, size * 0.5, z], [0.16 * size, size, 0.16 * size]);
  for (const [level, color] of palette.entries()) {
    const width = size * (0.79 - level * 0.16);
    const crown = mesh(scene, cone, color, [x, size * (0.92 + level * 0.43), z], [width, size * 1.2, width]);
    crown.rotation.y = x * 0.4 + level * 0.23;
  }
}

function teaHouse(scene) {
  const house = new THREE.Group();
  house.position.set(-8.5, 0, -5.6);
  scene.add(house);
  mesh(house, terrain, 0x877358, [0, 0.12, 0], [5.5, 0.25, 4.3]);
  mesh(house, terrain, 0xa98a65, [0, 0.19, 1.8], [5.5, 0.28, 0.8]);
  mesh(house, terrain, 0xd9b88a, [0, 1.32, -0.3], [4.35, 2.35, 3.1]);
  mesh(house, terrain, 0x514238, [0.1, 1.03, 1.29], [1.05, 1.76, 0.09]);
  for (const x of [-1.35, 1.38]) {
    mesh(house, terrain, 0xecc384, [x, 1.55, 1.28], [0.79, 0.71, 0.12]);
    mesh(house, terrain, 0x946b4a, [x, 1.55, 1.35], [0.06, 0.71, 0.06]);
  }
  for (const side of [-1, 1]) {
    const roof = mesh(house, terrain, 0x4a514a, [0, 2.72, side * 1.0], [5.7, 0.2, 2.45]);
    roof.rotation.x = side * 0.39;
    mesh(house, terrain, 0x79573f, [side * 2.35, 1.38, 1.68], [0.14, 2.48, 0.14]);
  }
  mesh(house, terrain, 0x6b6556, [0, 3.17, 0], [5.83, 0.22, 0.25]);
  mesh(house, terrain, 0xeed299, [1.65, 2.02, 1.7], [0.21, 0.32, 0.21]);
}

function makePlanter(scene, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  const pot = new THREE.CylinderGeometry(0.51, 0.33, 0.4, 12);
  mesh(group, pot, 0xb67854, [0, 0.21, 0], [1, 1, 1]);
  mesh(group, cylinder, 0x463d32, [0, 0.42, 0], [0.43, 0.06, 0.43]);
  for (const angle of [0.6, 2.6, 4.6]) {
    const leaf = mesh(group, rounded, 0x587b51, [Math.cos(angle) * 0.2, 0.57, Math.sin(angle) * 0.2], [0.25, 0.14, 0.13]);
    leaf.rotation.y = -angle;
    leaf.rotation.z = 0.5;
  }
  const flower = new THREE.Group();
  flower.position.y = 0.43;
  group.add(flower);
  mesh(flower, cylinder, 0x759759, [0, 0.36, 0], [0.033, 0.72, 0.033]);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    mesh(flower, rounded, 0xf3b79a, [Math.cos(angle) * 0.16, 0.74, Math.sin(angle) * 0.16], [0.13, 0.074, 0.13]);
  }
  mesh(flower, rounded, 0xfbe497, [0, 0.77, 0], [0.12, 0.08, 0.12]);
  flower.scale.setScalar(0.001);
  return { x, z, flower, watered: 0 };
}

export function makeWorld(scene) {
  const ground = new THREE.Group();
  scene.add(ground);
  mesh(ground, terrain, 0x384f40, [0, -0.78, 0], [29, 1.13, 21]);
  const turf = 0x82a477;
  mesh(ground, terrain, turf, [-6.05, -0.11, 0], [16.9, 0.22, 21]);
  mesh(ground, terrain, turf, [13.25, -0.11, 0], [2.5, 0.22, 21]);
  mesh(ground, terrain, turf, [7.2, -0.11, 4.1], [9.6, 0.22, 12.8]);
  mesh(ground, terrain, turf, [7.2, -0.11, -9.25], [9.6, 0.22, 2.5]);
  mesh(ground, terrain, 0x548a87, [7.2, -0.14, -5.15], [9.6, 0.1, 5.7]);
  const sand = 0xc5b68a;
  mesh(ground, terrain, sand, [0, 0.016, 1.75], [25, 0.03, 2.15]);
  mesh(ground, terrain, sand, [-8.5, 0.015, -0.6], [1.5, 0.03, 5.8]);
  mesh(ground, terrain, sand, [7.3, 0.015, -0.2], [1.9, 0.03, 4.4]);
  for (let i = 0; i < 14; i++) {
    mesh(scene, terrain, i % 2 ? 0xaa805c : 0xb08c68, [7.3, 0.16, -8.3 + i * 0.49], [2.12, 0.12, 0.45]);
  }
  for (const x of [6.22, 8.38]) {
    mesh(scene, terrain, 0x70533d, [x, 0.64, -5.15], [0.09, 0.09, 6.8]);
    for (const z of [-8.42, -6.2, -4.1, -1.84]) mesh(scene, terrain, 0x70533d, [x, 0.38, z], [0.11, 0.77, 0.13]);
  }
  teaHouse(scene);
  const trees = [
    [-13, -8, 1.72], [-11.6, -9.5, 1.83], [-9.5, -9.55, 1.25], [-6.6, -9.4, 1.56],
    [-4.5, -8.1, 1.72], [-1.7, -9.2, 2.03], [1, -9.15, 1.33], [4.65, -9.6, 1.31],
    [9.5, -9.53, 1.42], [12.8, -9.2, 2], [13.5, -4.5, 1.74], [13.2, 0, 1.25],
    [-13.1, -1, 1.55], [-13.2, 5.1, 1.37], [-11.5, 8.8, 1.55], [12.2, 8.7, 1.65],
    [13.3, 6.8, 1.57], [-8.9, 9.1, 1.13], [9.7, 9.2, 1.15],
  ];
  for (const tree of trees) pine(scene, ...tree);

  let seed = 101;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const foliage = [0x6c9469, 0x92af7b, 0xaeb888, 0x728865, 0xc5bd94];
  for (let i = 0; i < 210; i++) {
    const x = -13.8 + random() * 27.6;
    const z = -9.8 + random() * 19.6;
    if (!canWalk(x, z) || Math.abs(z - 1.75) < 1.2 || floorHeight(x, z) > 0 || (Math.abs(x + 8.5) < 1 && z < 2 && z > -3.5)) continue;
    const size = 0.075 + random() * 0.26;
    const tuft = mesh(ground, ball, foliage[i % foliage.length], [x, size * 0.25, z], [size, size * 0.55, size]);
    tuft.rotation.y = x;
    if (i % 8 === 0) mesh(ground, rounded, 0xe8d99b, [x, size * 0.56, z], [0.055, 0.05, 0.058]);
  }
  for (const [x, z] of [[3.1, -6.8], [4.1, -5.3], [4.55, -5.6], [10.1, -3.8], [10.4, -6.3], [11.2, -6.65]]) {
    mesh(scene, cylinder, 0x81a77d, [x, -0.075, z], [0.32, 0.035, 0.25]);
    mesh(scene, rounded, 0xdaaaab, [x + 0.08, 0.009, z], [0.13, 0.072, 0.11]);
  }
  const ripples = [];
  const ringShape = new THREE.RingGeometry(0.95, 1, 40);
  for (const [x, z] of [[4.5, -6.5], [5.1, -3.6], [10, -5.9], [10.6, -4.35], [9.2, -7.25]]) {
    const ring = new THREE.Mesh(ringShape, new THREE.MeshBasicMaterial({ color: 0xd5ece2, transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, -0.079, z);
    scene.add(ring);
    ripples.push(ring);
  }
  const planters = [[-3.9, 2.9], [1.5, 0.62], [4.6, 4.25], [-5.5, -2.9], [10.3, 0.65]].map(([x, z]) => makePlanter(scene, x, z));
  return { ground, planters, ripples };
}

export function makePlayer(scene) {
  const player = new THREE.Group();
  scene.add(player);
  mesh(player, rounded, 0x355f58, [0, 0.43, 0], [0.32, 0.39, 0.25]);
  mesh(player, rounded, 0xf5c094, [0, 0.84, 0], [0.24, 0.25, 0.22]);
  mesh(player, rounded, 0x473f35, [0, 0.99, -0.033], [0.25, 0.15, 0.23]);
  for (const x of [-0.145, 0.145]) {
    mesh(player, rounded, 0x514637, [x, 0.11, 0.025], [0.12, 0.11, 0.17]);
    mesh(player, rounded, 0x403b31, [x * 0.7, 0.85, 0.198], [0.026, 0.025, 0.026]);
  }
  const umbrella = new THREE.Group();
  player.add(umbrella);
  mesh(umbrella, cylinder, 0x725740, [0.2, 0.97, 0.06], [0.024, 1.09, 0.024]);
  const canopy = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const cover = mesh(umbrella, canopy, 0xe8b76b, [0.2, 1.45, 0.06], [0.64, 0.28, 0.64]);
  cover.material.side = THREE.DoubleSide;
  mesh(umbrella, rounded, 0x986a49, [0.2, 1.73, 0.06], [0.062, 0.056, 0.062]);
  return { player, umbrella };
}
