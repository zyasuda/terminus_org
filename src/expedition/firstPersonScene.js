import * as THREE from "three";
import { FACING_YAW, levelCells } from "./mapwalk.js";

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
// 向きは角度で持つ(FACING_YAWが正本)。旋回の補間で北⇄西を跨ぐ時に長い方へ回らないよう、
// 目標角を現在地から±πの範囲へ畳んで使う。
// 歩行と旋回にかける時間。長いと待たされ、短いとどこへ動いたか分からない。単位: ミリ秒。
const STEP_MS = 190, TURN_MS = 170;
// カメラを立ち位置からどれだけ後ろへ引くか。単位: 戦闘のタイル(1マス = 3タイル)。
// 引くほど広く見えるが、マスの外へ出ると後ろの壁を突き抜けるので上限を設ける。
export const CAM_BACK_DEFAULT = 1.0, CAM_BACK_MAX = CELL / 2 - 0.2;

const parse = key => key.split(",").map(Number);

export function createFirstPersonScene(container, map) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR);

  const { open, solid } = levelCells(map);

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

  // 目標(pos/facing)と、いま画面に出ている値。差がある間だけ描き続ける。
  const state = { x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, enemy: null };
  let camBack = CAM_BACK_DEFAULT;
  let raf = 0, last = 0, started = false;

  const draw = () => {
    // 松明は立ち位置(マスの中心)に置いたまま、カメラだけ後ろへ引く。
    // カメラに付けると引いた分だけ前が暗くなり、明るさが操作で変わってしまう。
    torch.position.set(state.x, EYE, state.z);
    camera.position.set(state.x + Math.sin(state.yaw) * camBack, EYE, state.z + Math.cos(state.yaw) * camBack);
    camera.rotation.set(0, state.yaw, 0);
    renderer.render(scene, camera);
  };
  const tick = now => {
    const dt = Math.min(now - last, 50); last = now;
    const move = dt / STEP_MS, turn = dt / TURN_MS;
    const step = (cur, target, rate) => {
      const d = target - cur;
      return Math.abs(d) <= rate ? target : cur + Math.sign(d) * rate;
    };
    // 1マス(CELL)を STEP_MS で渡り切る速さ。旋回は90度を TURN_MS で。
    state.x = step(state.x, state.tx, CELL * move);
    state.z = step(state.z, state.tz, CELL * move);
    state.yaw = step(state.yaw, state.tyaw, (Math.PI / 2) * turn);
    draw();
    raf = state.x === state.tx && state.z === state.tz && state.yaw === state.tyaw
      ? 0 : requestAnimationFrame(tick);
  };

  return {
    // 目標を差し替える。動いている間だけフレームを回し、止まったら止める(電池と発熱)。
    render(pos, facing, enemy) {
      state.tx = pos.x * CELL; state.tz = pos.y * CELL;
      // 目標の角度は現在地から±πの範囲へ畳む。北(π)と西(π/2)の間で遠回りしない。
      const raw = FACING_YAW[facing] ?? 0;
      state.tyaw = state.yaw + Math.atan2(Math.sin(raw - state.yaw), Math.cos(raw - state.yaw));
      marker.visible = !!enemy;
      if (enemy) marker.position.set(enemy.x * CELL, 0.45, enemy.y * CELL);
      resize();
      if (!started) { // 初回は補間せず、その場に置く
        started = true;
        state.x = state.tx; state.z = state.tz; state.yaw = state.tyaw;
        draw();
        return;
      }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    },
    resize,
    // カメラの引き。決まったら CAM_BACK_DEFAULT に固定して、この口ごと消してよい。
    setBack(value) {
      camBack = Math.max(0, Math.min(CAM_BACK_MAX, value));
      draw();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      renderer.domElement.remove();
      renderer.dispose();
      for (const geo of [boxGeo, planeGeo, edgeGeo, gridGeo, markerGeo]) geo.dispose();
      for (const mat of [wallMat, floorMat, ceilMat, lineMat, floorLineMat, marker.material]) mat.dispose();
    },
  };
}
