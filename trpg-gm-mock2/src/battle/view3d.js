/* =========================================================
   戦闘グリッドの3D描画(Phase 1)

   Three.jsを触る命令的な処理をここに閉じ込める。
   ゲームのルールは一切持たない。core.js が確定した盤面を「見せる」だけ。

   Phase 1ではキャラクターのアセットを使わず、色付きの箱で表示する。
   ビルボードか3Dモデルかは、本番のカメラ距離で見てから決める方針のため
   (build-hybrid-game-assets: 「アセットビューアではなくゲーム内で確認する」)。
   ========================================================= */

import * as THREE from "three";

const TILE = 0.92;       // 床タイルの一辺(セル間にわずかな目地を残す)
const TILE_H = 0.25;     // 床の厚み(1キューブ=4層の1層ぶん)
const WALL_H = 1.0;

const COLOR = {
  bg: 0x161a22,
  floor: 0x4a5164,
  wall: 0x2b303c,
  reach: 0x3d7fb5,       // 到達可能マス
  target: 0xb5533d,      // 攻撃可能な相手のマス
  party: 0x6f9ad3,
  enemy: 0xc4634a,
  down: 0x3a3f4b,        // 戦闘不能
  active: 0xf2df7e       // 手番のユニットを示すマーカー
};

export function createBattleScene(container, grid) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);

  // グリッド中心を原点に置く。セル(x,y)はワールドの(x,·,y)へ写す
  const offX = (grid.w - 1) / 2;
  const offZ = (grid.h - 1) / 2;
  const worldOf = (x, y) => [x - offX, y - offZ];

  /* --- カメラ(正射影・Y軸90度刻みの4方向固定) --- */
  const viewSize = Math.max(grid.w, grid.h) + 4;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  let dirIndex = 0;
  let camAngle = Math.PI / 4;        // 実際の角度(なめらかに目標へ寄せる)
  const target = new THREE.Vector3(0, 0, 0);

  const applyFrustum = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    camera.left = (-viewSize * aspect) / 2;
    camera.right = (viewSize * aspect) / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.updateProjectionMatrix();
  };

  const placeCamera = () => {
    // 真のアイソメトリックに近い見下ろし角(atan(1/√2) ≒ 35.26度)
    const r = 20, y = r * Math.tan(Math.atan(1 / Math.SQRT2));
    camera.position.set(Math.cos(camAngle) * r, y, Math.sin(camAngle) * r);
    camera.lookAt(target);
  };

  /* --- ライト --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(6, 12, 4);
  scene.add(key);

  /* --- 床と壁(戦闘中は変化しないので一度だけ作る) --- */
  const tileGeo = new THREE.BoxGeometry(TILE, TILE_H, TILE);
  const wallGeo = new THREE.BoxGeometry(0.98, WALL_H, 0.98);
  const floorMat = new THREE.MeshLambertMaterial({ color: COLOR.floor });
  const wallMat = new THREE.MeshLambertMaterial({ color: COLOR.wall });

  const tiles = new Map();   // "x,y" → 床メッシュ(ハイライトで色を塗り替える)
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const [wx, wz] = worldOf(x, y);
      const cell = grid.cells[y * grid.w + x];
      if (cell.walkable) {
        const m = new THREE.Mesh(tileGeo, floorMat.clone());
        m.position.set(wx, -TILE_H / 2, wz);
        m.userData = { kind: "cell", x, y };
        scene.add(m);
        tiles.set(x + "," + y, m);
      } else {
        const m = new THREE.Mesh(wallGeo, wallMat);
        m.position.set(wx, WALL_H / 2, wz);
        scene.add(m);
      }
    }
  }

  /* --- ユニット(箱)と手番マーカー --- */
  const unitMeshes = new Map();  // id → メッシュ
  const unitGroup = new THREE.Group();
  scene.add(unitGroup);

  const markerGeo = new THREE.ConeGeometry(0.18, 0.4, 4);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: COLOR.active }));
  marker.rotation.x = Math.PI;      // 下向きの三角錐
  marker.visible = false;
  scene.add(marker);

  const meshFor = unit => {
    let m = unitMeshes.get(unit.id);
    if (!m) {
      const h = unit.height ?? 2;
      m = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, h, 0.5),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      m.userData = { kind: "unit", id: unit.id };
      unitGroup.add(m);
      unitMeshes.set(unit.id, m);
    }
    return m;
  };

  /* --- 状態を画面へ反映する --- */
  // highlights: [{x, y, kind:"reach"|"target"}] / targetIds: 攻撃できる相手のid
  function sync(units, highlights = [], activeId = null, targetIds = []) {
    for (const [, m] of tiles) m.material.color.setHex(COLOR.floor);
    for (const h of highlights) {
      const t = tiles.get(h.x + "," + h.y);
      if (t) t.material.color.setHex(h.kind === "target" ? COLOR.target : COLOR.reach);
    }

    for (const u of units) {
      const m = meshFor(u);
      const [wx, wz] = worldOf(u.x, u.y);
      const h = u.height ?? 2;
      m.position.set(wx, h / 2, wz);
      m.material.color.setHex(u.hp <= 0 ? COLOR.down : u.side === "party" ? COLOR.party : COLOR.enemy);
      // 攻撃できる相手は自身を光らせる。足元のマスを塗っても本体に隠れて見えないため
      m.material.emissive.setHex(targetIds.includes(u.id) ? COLOR.target : 0x000000);
      m.visible = true;
      if (u.id === activeId) {
        marker.visible = true;
        marker.position.set(wx, h + 0.5, wz);
      }
    }
    if (!activeId) marker.visible = false;
  }

  /* --- 入力(クリックでマス/ユニットを拾う) --- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pickHandler = null;

  const onPointerDown = e => {
    if (!pickHandler) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    // ユニットを床より優先して拾う(敵の足元をクリックしても攻撃対象として扱えるように)
    const hits = raycaster.intersectObjects([...unitGroup.children, ...tiles.values()], false);
    const unitHit = hits.find(h => h.object.userData.kind === "unit");
    const hit = unitHit || hits[0];
    if (hit) pickHandler(hit.object.userData);
  };

  /* --- レンダラーとループ --- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.addEventListener("pointerdown", onPointerDown);

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    applyFrustum();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  placeCamera();

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    // 回転はなめらかに寄せる(カメラを状態へ直結させない: build-game-camera-controls)
    const want = Math.PI / 4 + dirIndex * (Math.PI / 2);
    if (Math.abs(want - camAngle) > 0.001) {
      camAngle += (want - camAngle) * 0.15;
      placeCamera();
    }
    marker.rotation.y += 0.02;
    renderer.render(scene, camera);
  };
  loop();

  return {
    sync,
    rotate(delta) { dirIndex += delta; },
    setPickHandler(fn) { pickHandler = fn; },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.dispose();
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };
}
