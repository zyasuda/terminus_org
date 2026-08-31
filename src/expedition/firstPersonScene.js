import * as THREE from "three";
import { isOpen } from "./mapwalk.js";

// 一人称の3D。戦闘(view3d.js)と同じ「1マス=1タイル」の座標系で組み、
// 壁の有無は探索・戦闘と同じ isOpen / hallBlocked を読む。
// 隠面と奥行きはGPUに任せる。自前の投影・並べ替え・隠面判定は持たない。
//
// 単位はすべて戦闘のタイル。探索の1マスは戦闘の3タイル(battleConfig.jsのcorridor.height)。
export const CELL = 3;
// 天井の高さと目の高さ。戦闘3Dの入口アーチ(view3d.js ARCH_HEIGHT_TILES = 2.0、1マス1.5m換算)に合わせた。
export const CEIL = 2.0, EYE = 1.15;
const BG = 0x0a0d14, LINE = 0x8fb0d8, FLOOR_LINE = 0x6d8399;
const FOG_NEAR = CELL * 0.8, FOG_FAR = CELL * 4.2;
const DIR = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

const parse = key => key.split(",").map(Number);

export function createFirstPersonScene(container, map) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR);

  const open = new Set();
  for (const key of map.cells.keys()) { const [x, y] = parse(key); if (isOpen(map, x, y)) open.add(key); }
  // 壁は「空きマスに隣り合う、通れないマス」だけ作る。地図の外側を無限に作らない。
  const solid = new Set();
  for (const key of open) {
    const [x, y] = parse(key);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const k = `${x + dx},${y + dy}`;
      if (!open.has(k)) solid.add(k);
    }
  }

  // 面はランバートにして、カメラに付けた松明で照らす。距離減衰が灯りの届く範囲そのものになる。
  const dark = hex => new THREE.MeshLambertMaterial({ color: hex, fog: true });
  const wallMat = dark(0x5a6272), floorMat = dark(0x474f5c), ceilMat = dark(0x333a47);
  const lineMat = new THREE.LineBasicMaterial({ color: LINE, fog: true });
  const floorLineMat = new THREE.LineBasicMaterial({ color: FLOOR_LINE, fog: true, transparent: true, opacity: .45 });

  const boxGeo = new THREE.BoxGeometry(CELL, CEIL, CELL);
  const planeGeo = new THREE.PlaneGeometry(CELL, CELL);
  const wallGroup = new THREE.Group(), floorGroup = new THREE.Group();
  scene.add(wallGroup, floorGroup);

  for (const key of solid) {
    const [x, y] = parse(key);
    const m = new THREE.Mesh(boxGeo, wallMat);
    m.position.set(x * CELL, CEIL / 2, y * CELL);
    wallGroup.add(m);
  }

  // 壁の稜線。空きマスに面している辺だけ引く(線画に見せるため)。
  // 面そのものはGPUが隠すので、ここは見た目の線だけの話。
  const edges = [];
  const push = (ax, az, bx, bz) => { edges.push(ax, 0, az, bx, 0, bz, ax, CEIL, az, bx, CEIL, bz, ax, 0, az, ax, CEIL, az, bx, 0, bz, bx, CEIL, bz); };
  for (const key of solid) {
    const [x, y] = parse(key);
    const cx = x * CELL, cz = y * CELL, h = CELL / 2;
    if (open.has(`${x},${y - 1}`)) push(cx - h, cz - h, cx + h, cz - h);
    if (open.has(`${x},${y + 1}`)) push(cx - h, cz + h, cx + h, cz + h);
    if (open.has(`${x - 1},${y}`)) push(cx - h, cz - h, cx - h, cz + h);
    if (open.has(`${x + 1},${y}`)) push(cx + h, cz - h, cx + h, cz + h);
  }
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
  scene.add(new THREE.LineSegments(edgeGeo, lineMat));

  // 床と天井。床には戦闘と同じ1タイルきざみの目盛りを引く。
  const grid = [];
  for (const key of open) {
    const [x, y] = parse(key);
    const cx = x * CELL, cz = y * CELL, h = CELL / 2;
    const floor = new THREE.Mesh(planeGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floorGroup.add(floor);
    const ceil = new THREE.Mesh(planeGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, CEIL, cz);
    floorGroup.add(ceil);
    for (let i = 0; i <= CELL; i += 1) {
      grid.push(cx - h + i, .01, cz - h, cx - h + i, .01, cz + h);
      grid.push(cx - h, .01, cz - h + i, cx + h, .01, cz - h + i);
    }
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
  scene.add(new THREE.LineSegments(gridGeo, floorLineMat));

  // 敵影。位置は外から差し込む(地図には出さない固定敵)。
  const markerGeo = new THREE.ConeGeometry(CELL * 0.22, 0.9, 4);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x6b3a3a, fog: true }));
  marker.visible = false;
  scene.add(marker);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, CELL * 12);
  camera.position.y = EYE;
  // 松明。カメラと一緒に動く。distanceが「灯りの届く範囲」の正本になる。
  const torch = new THREE.PointLight(0xffd9a0, 2.6, CELL * 3.6, 1.6);
  scene.add(torch);
  scene.add(new THREE.AmbientLight(0x2a3550, 0.5));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // 高DPRの実機でcanvasが2倍にはみ出す事故を戦闘側で踏んでいる。上限2で固定する。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const resize = () => {
    const w = container.clientWidth || 300, h = container.clientHeight || 250;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return {
    // 位置と向きを渡すたびに1枚だけ描く。常時ループは回さない(電池と発熱のため)。
    render(pos, facing, enemy) {
      const [fx, fz] = DIR[facing] || DIR.north;
      camera.position.set(pos.x * CELL, EYE, pos.y * CELL);
      camera.lookAt(camera.position.x + fx * CELL, EYE, camera.position.z + fz * CELL);
      torch.position.copy(camera.position);
      marker.visible = !!enemy;
      if (enemy) marker.position.set(enemy.x * CELL, 0.45, enemy.y * CELL);
      resize();
      renderer.render(scene, camera);
    },
    resize,
    dispose() {
      renderer.domElement.remove();
      renderer.dispose();
      for (const geo of [boxGeo, planeGeo, edgeGeo, gridGeo, markerGeo]) geo.dispose();
      for (const mat of [wallMat, floorMat, ceilMat, lineMat, floorLineMat, marker.material]) mat.dispose();
    },
  };
}
