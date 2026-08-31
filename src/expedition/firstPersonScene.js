import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STANDEE_VERSION } from "../battle/standeeVersion.js";
import { DUST_TOP, dustMaterial, dustMote } from "../battle/dustLook.js";
import { FLICKER_SPEED, LANTERN_COLOR, LANTERN_DECAY, LANTERN_INTENSITY, LANTERN_RANGE, flicker } from "../battle/lanternLook.js";
import { FLOOR_BASE, FLOOR_TONE, PASSAGE_HEIGHT_TILES, WALL_COLOR, stoneTexture } from "../battle/stoneLook.js";
import { FACING_YAW, levelCells } from "./mapwalk.js";

// 一人称の3D。戦闘(view3d.js)と同じ「1マス=1タイル」の座標系で組み、
// 壁の有無は探索・戦闘と同じ isOpen / hallBlocked を読む。
// 隠面と奥行きはGPUに任せる。自前の投影・並べ替え・隠面判定は持たない。
//
// 単位はすべて戦闘のタイル。探索の1マスは戦闘の3タイル(battleConfig.jsのcorridor.height)。
export const CELL = 3;
// 天井の高さは戦闘の入口アーチと同じ値(stoneLook.jsのPASSAGE_HEIGHT_TILESが正本)。
// 目の高さは、アーチのコメント「人の約1.6倍」から逆算した背丈(2.0/1.6 = 1.25)のやや下。
export const CEIL = PASSAGE_HEIGHT_TILES, EYE = 1.15;
const BG = 0x0a0d14, LINE = 0x8fb0d8, FLOOR_LINE = 0x6d8399;
const FOG_NEAR = CELL * 0.8, FOG_FAR = CELL * 4.2;
// 向きは角度で持つ(FACING_YAWが正本)。旋回の補間で北⇄西を跨ぐ時に長い方へ回らないよう、
// 目標角を現在地から±πの範囲へ畳んで使う。
const parse = key => key.split(",").map(Number);
// 歩行と旋回にかける時間。長いと待たされ、短いとどこへ動いたか分からない。単位: ミリ秒。
const STEP_MS = 190, TURN_MS = 170;
// カメラを立ち位置からどれだけ後ろへ引くか。単位: 戦闘のタイル(1マス = 3タイル)。
// 引くほど広く見えるが、マスの外へ出ると後ろの壁を突き抜けるので上限を設ける。
export const CAM_BACK_DEFAULT = 0.6, CAM_BACK_MAX = CELL / 2 - 0.2;
// 塵の見た目は戦闘と同じ dustLook.js を読む(2画面で食い違わせない)。
// ここで決めるのは「どこに、何個置くか」だけ。
// 戦闘は7×3の盤に22個。同じ密度になるよう、カメラの周り±1マス(=±3タイル)に置く。
const DUST_COUNT = 38, DUST_RANGE = CELL;

export function createFirstPersonScene(container, map) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR);

  const { open, solid } = levelCells(map);

  const dark = hex => new THREE.MeshLambertMaterial({ color: hex, fog: true });
  // 壁と天井は無地。戦闘の壁も無地(COLOR.wall)なので、探索だけ石を貼ると食い違う。
  const wallMat = dark(WALL_COLOR), ceilMat = dark(0x232833);
  // 床は戦闘と同じ石。テクスチャ1枚 = FLOOR_TEX_TILES(3)タイル = 探索のちょうど1マス。
  const stoneTex = stoneTexture();
  const floorMat = new THREE.MeshLambertMaterial({ map: stoneTex, fog: true,
    color: new THREE.Color(FLOOR_BASE).multiplyScalar(FLOOR_TONE) });
  const lineMat = new THREE.LineBasicMaterial({ color: LINE, fog: true });
  const floorLineMat = new THREE.LineBasicMaterial({ color: FLOOR_LINE, fog: true, transparent: true, opacity: .45 });

  const boxGeo = new THREE.BoxGeometry(CELL, CEIL, CELL);
  // 床の板。1マス(=CELL タイル)にテクスチャを1枚ぴったり貼る。
  // 戦闘は盤面座標でUVを振って連続させているが、こちらは1マスで閉じるので既定のUVでよい。
  const planeGeo = new THREE.PlaneGeometry(CELL, CELL);
  const ceilGeo = new THREE.PlaneGeometry(CELL, CELL);
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
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
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

  // 塵。カメラの周りにだけ置き、外へ出たら反対側へ回り込ませる。
  // 回り込みの基準がカメラなので、歩くと塵が後ろへ流れて視差が出る。地図全体へは撒かない。
  // 粒ごとに大きさが違うのでPointsではなくSprite(戦闘側と同じ理由)。
  const dustMat = dustMaterial();
  const dustGroup = new THREE.Group();
  scene.add(dustGroup);
  const dustState = Array.from({ length: DUST_COUNT }, () => {
    const sprite = new THREE.Sprite(dustMat);
    const mote = dustMote();
    sprite.scale.setScalar(mote.size);
    dustGroup.add(sprite);
    return {
      sprite, ...mote,
      x: (Math.random() - 0.5) * 2 * DUST_RANGE,
      z: (Math.random() - 0.5) * 2 * DUST_RANGE,
      y: Math.random() * DUST_TOP,
    };
  });
  let dustPlaced = false;

  // 同行者(リディア)。戦闘と同じスタンディをそのまま置く。
  // 立ち位置はパーティのマスの中心から、左手前へずらす。カメラは中心より
  // CAM_BACK 分だけ後ろにいるので、この位置だと背中が視界の左に入る。単位: タイル。
  const COMPANION_SIDE = -0.75, COMPANION_AHEAD = 1.35;
  const companion = new THREE.Group();
  scene.add(companion);
  let companionDisposed = false;
  new GLTFLoader().load(`/models/lydia-standee-${STANDEE_VERSION}.glb`, gltf => {
    if (companionDisposed) return;
    gltf.scene.traverse(obj => {
      if (!obj.isMesh) return;
      // 人物絵は印刷面として扱う。光源で直接照らすと濃い衣装だけが白飛びするので、
      // 戦闘(view3d.js)と同じくMeshBasicMaterialにしてPNGのアルファで型抜きする。
      // 板のうっすらしたアルファ(約0.12)が消えないよう、しきい値はそれより低く。
      const src = Array.isArray(obj.material) ? obj.material : [obj.material];
      const made = src.map(m => new THREE.MeshBasicMaterial({
        map: m.map, alphaMap: m.alphaMap, transparent: true, alphaTest: 0.04,
        side: THREE.FrontSide, depthWrite: true, fog: true,
      }));
      obj.material = Array.isArray(obj.material) ? made : made[0];
    });
    companion.add(gltf.scene);
  }, undefined, () => { /* モデルが無くても探索は続けられる。同行者が出ないだけ */ });

  // 敵影。位置は外から差し込む(地図には出さない固定敵)。
  const markerGeo = new THREE.ConeGeometry(CELL * 0.22, 0.9, 4);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x6b3a3a, fog: true }));
  marker.visible = false;
  scene.add(marker);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, CELL * 12);
  camera.position.y = EYE;
  // カンテラ。色・強さ・減衰・揺らぎは戦闘と同じ lanternLook.js を読む。
  // 射程だけは場面で違う。戦闘は盤を見下ろすので3タイルで足りるが、一人称は
  // 進行方向の奥まで見えるため、灯りが届かないと真っ暗な穴を覗くことになる。
  // 探索の1マス = 3タイルなので、LANTERN_RANGE_CELLS マス先までを照らす。
  const LANTERN_RANGE_CELLS = 1.6;
  const lantern = new THREE.PointLight(LANTERN_COLOR, LANTERN_INTENSITY,
    LANTERN_RANGE * LANTERN_RANGE_CELLS, LANTERN_DECAY);
  scene.add(lantern);
  // 環境光は探索側の値のまま。中立色の補助光を足しても床の橙は取れなかった
  // (実測: 0.34+key0.36で偏り16.3%、0.55単独で16.2%、今の値で28.4%。戦闘は3.3%)。
  // 一人称は常にカンテラの射程の中にいるので、床の色をカンテラが決めてしまう。
  // 灯りの届く範囲の暗さを保つ方を採り、床の橙は残している(2026-08-31、作者の判断待ち)。
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

  // 塵を1フレーム分動かす。戦闘と同じく「上へゆっくり立ち上り、XZで円を描くように揺れる」。
  // 違うのは回り込みの基準だけ。戦闘は盤の上に留めるが、こちらはカメラに追従させる。
  let elapsed = 0;   // 経過秒。塵の揺れとカンテラの揺らぎが共有する
  const moveDust = (dt, cx, cz) => {
    if (!dustPlaced) { // 初回はカメラの周りへ配り直す(原点のままだと足元に無い)
      dustPlaced = true;
      for (const d of dustState) { d.x += cx; d.z += cz; }
    }
    elapsed += dt;
    for (const d of dustState) {
      d.y += d.speed * dt;
      if (d.y > DUST_TOP) d.y -= DUST_TOP;
      if (d.x - cx > DUST_RANGE) d.x -= DUST_RANGE * 2;
      else if (d.x - cx < -DUST_RANGE) d.x += DUST_RANGE * 2;
      if (d.z - cz > DUST_RANGE) d.z -= DUST_RANGE * 2;
      else if (d.z - cz < -DUST_RANGE) d.z += DUST_RANGE * 2;
      d.sprite.position.set(
        d.x + Math.sin(elapsed * d.swayFreqX + d.swayPhase) * d.swayAmpX,
        d.y,
        d.z + Math.cos(elapsed * d.swayFreqZ + d.swayPhase) * d.swayAmpZ);
    }
  };

  const draw = () => {
    // カンテラは立ち位置(マスの中心)に置いたまま、カメラだけ後ろへ引く。
    // カメラに付けると引いた分だけ前が暗くなり、明るさが操作で変わってしまう。
    lantern.position.set(state.x, EYE, state.z);
    // 炎の揺らぎ。戦闘と同じ式・同じ速さ。
    lantern.intensity = LANTERN_INTENSITY * flicker(elapsed * FLICKER_SPEED);
    camera.position.set(state.x + Math.sin(state.yaw) * camBack, EYE, state.z + Math.cos(state.yaw) * camBack);
    camera.rotation.set(0, state.yaw, 0);
    // 同行者は進行方向を向いて、パーティの左手前を歩く。
    // スタンディは+Zを正面に作ってあるので、カメラの前方(-sin,-cos)へ向けるには yaw + π。
    const fwdX = -Math.sin(state.yaw), fwdZ = -Math.cos(state.yaw);
    companion.position.set(
      state.x + fwdX * COMPANION_AHEAD - fwdZ * COMPANION_SIDE, 0,
      state.z + fwdZ * COMPANION_AHEAD + fwdX * COMPANION_SIDE);
    companion.rotation.y = state.yaw + Math.PI;
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
    moveDust(dt / 1000, state.x, state.z);
    draw();
    // 塵が舞っている間は止まっていても描き続ける。タブが隠れたら止める(電池と発熱)。
    raf = document.hidden ? 0 : requestAnimationFrame(tick);
  };
  // 隠れている間に止めたループを、戻ってきたら再開する。
  const onVisible = () => { if (!document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  document.addEventListener("visibilitychange", onVisible);

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
        moveDust(0, state.x, state.z);
        draw();
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
      companionDisposed = true;
      companion.traverse(o => { o.geometry?.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose(); x.dispose(); }); });
      document.removeEventListener("visibilitychange", onVisible);
      if (raf) cancelAnimationFrame(raf);
      renderer.domElement.remove();
      renderer.dispose();
      for (const geo of [boxGeo, planeGeo, ceilGeo, edgeGeo, gridGeo, markerGeo]) geo.dispose();
      dustMat.map?.dispose();
      stoneTex.dispose();
      for (const mat of [wallMat, floorMat, ceilMat, lineMat, floorLineMat, dustMat, marker.material]) mat.dispose();
    },
  };
}
