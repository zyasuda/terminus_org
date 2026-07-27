/* =========================================================
   戦闘グリッドの3D描画(Phase 1)

   Three.jsを触る命令的な処理をここに閉じ込める。
   ゲームのルールは一切持たない。core.js が確定した盤面を「見せる」だけ。

   Phase 1ではキャラクターのアセットを使わず、色付きの箱で表示する。
   ビルボードか3Dモデルかは、本番のカメラ距離で見てから決める方針のため
   (build-hybrid-game-assets: 「アセットビューアではなくゲーム内で確認する」)。
   ========================================================= */

import * as THREE from "three";
import { elevationAt } from "./core.js";

const TILE = 0.92;       // 床タイルの一辺(セル間にわずかな目地を残す)
const TILE_H = 0.25;     // 床の厚み(1キューブ=4層の1層ぶん)
const WALL_H = 1.0;

const COLOR = {
  bg: 0x161a22,
  floor: 0x4a5164,
  wall: 0x2b303c,        // 盤面の外周・地形の壁
  pillar: 0x3f3527,      // 高さ1.0の障害物(進入不可)
  rubble: 0x574a35,      // 高さ0.25〜0.75の障害物(乗り越えられる)
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

  /* --- ライト ---
     地の明かりは、盤面が読めなくならない程度まで落としてある。
     暗くするのが目的ではなく、下のランタンの揺らぎが分かるようにするため */
  scene.add(new THREE.AmbientLight(0xffffff, 0.34));
  const key = new THREE.DirectionalLight(0xdfe6ff, 0.36);
  key.position.set(6, 12, 4);
  scene.add(key);

  /* --- ランタン(ゆらぐ炎) ---
     盤面に固定で置くのはやめ、味方(ガレス・リディア)が持ち歩く形にした。
     ユニットのGroupに光源を入れてあるので、移動すれば明かりも一緒に動く。
     倒れると visible=false になり、Three.jsは非表示のライトを集計しないので
     明かりも自然に消える。敵は光源を持たない。
     見た目だけの演出で、射線や明暗による判定には一切関与しない */
  const lanterns = [];

  // 周期の違う正弦を重ねて、繰り返しに気づきにくいゆらぎを作る。
  // 速い成分を厚めにすると「ゆっくり明滅」ではなく炎のチラつきに寄る
  const flicker = t =>
    0.68 + 0.32 * (Math.sin(t) * 0.34 + Math.sin(t * 2.3) * 0.3 + Math.sin(t * 5.7) * 0.22 + Math.sin(t * 9.1) * 0.14);

  /* --- 床と壁(戦闘中は変化しないので一度だけ作る) --- */
  const tileGeo = new THREE.BoxGeometry(TILE, TILE_H, TILE);
  const wallGeo = new THREE.BoxGeometry(0.98, WALL_H, 0.98);
  const floorMat = new THREE.MeshLambertMaterial({ color: COLOR.floor });
  const wallMat = new THREE.MeshLambertMaterial({ color: COLOR.wall });
  const pillarMat = new THREE.MeshLambertMaterial({ color: COLOR.pillar });
  const rubbleMat = new THREE.MeshLambertMaterial({ color: COLOR.rubble });
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0x2c6f7a, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide
  });

  const tiles = new Map();   // "x,y" → 床メッシュ(ハイライトで色を塗り替える)
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const [wx, wz] = worldOf(x, y);
      const cell = grid.cells[y * grid.w + x];

      if (!cell.walkable) {
        // 地形の壁と、高さ1.0の障害物(柱)。どちらも進入不可だが色で見分ける
        const m = new THREE.Mesh(wallGeo, cell.obstacle ? pillarMat : wallMat);
        m.position.set(wx, WALL_H / 2, wz);
        scene.add(m);
        continue;
      }

      const m = new THREE.Mesh(tileGeo, floorMat.clone());
      m.position.set(wx, -TILE_H / 2, wz);
      m.userData = { kind: "cell", x, y };
      scene.add(m);
      tiles.set(x + "," + y, m);

      // 乗り越えられる瓦礫。床の上に低い箱を置くだけで、進入は妨げない
      if (cell.obstacle) {
        const h = cell.obstacle.height;
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), rubbleMat);
        r.position.set(wx, h / 2, wz);
        scene.add(r);
      }

      // 水溜り: 進入は妨げないが移動コストが2倍。床の色を直接塗ると
      // ハイライト(到達可能マス等)で上書きされて見分けられなくなるため、
      // 別の薄い板をわずかに浮かせて重ねる
      if (cell.terrain?.type === "water") {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.86, TILE * 0.86), waterMat);
        w.rotation.x = -Math.PI / 2;
        w.position.set(wx, 0.012, wz);
        scene.add(w);
      }
    }
  }

  /* --- 外壁(紙工作・ジオラマ的な書き割り) ---
     盤面の四辺に固定向きの平面を立て、法線を内側へ向ける。
     裏面は描かれないので、カメラ手前側の壁は自動的に消えて盤面が見通せる。
     どの向きから見ても同じように働くので、カメラの4方向すべてで破綻しない。
     グリッドの高さ・障害物・射線の規則には一切関与しない、ただの背景 */
  const BACKDROP_H = 3.6;
  const halfW = grid.w / 2, halfH = grid.h / 2;

  // 上ほど見え、下へ向かうほど透過して闇に沈む縦グラデーション。
  // 背景が暗いので、透過させた床際がいちばん暗くなる。
  // CanvasTextureのflipYが既定で有効なので、canvasの上端がそのまま壁の上端になる
  const backdropTexture = () => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "rgba(30,35,49,0.9)");    // 上端: いちばん見える
    grad.addColorStop(0.45, "rgba(15,18,26,0.5)");
    grad.addColorStop(1, "rgba(5,6,10,0)");        // 下端: 透過して闇へ沈む
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    // 色空間を指定しないとcanvasの値が線形として扱われ、出力時のsRGB変換で
    // 持ち上げられてしまう(指定した色よりかなり明るく出る)
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // 陰影を付けない(MeshBasic)。Lambertだと指向性ライトが当たらない向きの壁だけ
  // 環境光のみになって背景に沈み、カメラの向きによって壁が消えて見えた。
  // 書き割りは平らに塗った紙なので、どの向きでも同じ明るさで出るのが正しい。
  // depthWriteを切って、背後の透過描画とぶつからないようにする
  const backdropMat = new THREE.MeshBasicMaterial({
    map: backdropTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide
  });
  // [幅, 位置, Y回転] … PlaneGeometryの法線は+Z。Y回転で内側へ向ける
  [
    [grid.w, [0, BACKDROP_H / 2, -halfH], 0],              // 奥(-Z)側 → +Zを向く
    [grid.w, [0, BACKDROP_H / 2, halfH], Math.PI],         // 手前(+Z)側 → -Zを向く
    [grid.h, [-halfW, BACKDROP_H / 2, 0], Math.PI / 2],    // 左(-X)側 → +Xを向く
    [grid.h, [halfW, BACKDROP_H / 2, 0], -Math.PI / 2]     // 右(+X)側 → -Xを向く
  ].forEach(([width, pos, rotY]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, BACKDROP_H), backdropMat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    scene.add(m);
  });

  /* --- ユニット(箱)と手番マーカー --- */
  const unitMeshes = new Map();  // id → メッシュ
  const unitGroup = new THREE.Group();
  scene.add(unitGroup);

  const markerGeo = new THREE.ConeGeometry(0.18, 0.4, 4);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: COLOR.active }));
  marker.rotation.x = Math.PI;      // 下向きの三角錐
  marker.visible = false;
  scene.add(marker);

  // ユニットは陣営を問わず箱で表す。
  // 一度は味方を円錐+球、敵を三角柱にしてみたが、Phase 3の判断材料としては箱が正しい。
  // 2D表現なら箱の各面(前後左右・上)にテクスチャを貼ることになり、3Dモデルなら
  // その箱が占める体積にモデルを置くことになるため、どちらの見当もつけやすい
  const makeUnitObject = unit => {
    const g = new THREE.Group();
    const h = unit.height ?? 2;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), mat);
    m.position.y = h / 2;
    m.userData = { kind: "unit", id: unit.id };   // 子を直接クリックしても拾えるように
    g.add(m);

    if (unit.side === "party") {
      // 味方はランタンを提げている。光源をGroupに入れてあるので移動に追従する。
      // decay=0(距離減衰なし)にしてあるのが肝。既定の逆二乗系のままだと、
      // 光源のすぐ隣にある持ち主の体だけが白飛びして陣営の色まで失われる。
      // 減衰を切ると範囲内が一様に照らされ、distanceの縁でなめらかに落ちるので、
      // 「ぼんやり明るい範囲」がそのまま出る
      const base = 4.6;
      const light = new THREE.PointLight(0xffa848, base, 6.4, 0);
      light.position.set(0, h * 0.9, 0);   // 頭のあたり。光源だけを置き、球体は出さない
      g.add(light);
      lanterns.push({ light, base, phase: lanterns.length * 2.7 });
    } else {

    }

    g.userData = { kind: "unit", id: unit.id, mats: [mat] };
    return g;
  };

  const meshFor = unit => {
    let g = unitMeshes.get(unit.id);
    if (!g) {
      g = makeUnitObject(unit);
      unitGroup.add(g);
      unitMeshes.set(unit.id, g);
    }
    return g;
  };

  /* --- コイン(倒れた駒の跡に残る。通りかかると拾える) --- */
  const COIN_R = 0.3;
  const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.06, 20);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xe8c34a, emissive: 0x4a3708 });
  const coinMeshes = new Map();

  function syncCoins(coins) {
    const seen = new Set();
    for (const c of coins) {
      seen.add(c.id);
      let m = coinMeshes.get(c.id);
      if (!m) {
        m = new THREE.Mesh(coinGeo, coinMat);
        // 立てたコインをY軸で回す。回転の適用順を YXZ にしておかないと、
        // Xで倒す前にYが効いてしまい「自分の軸で回るだけ=見た目が変わらない」になる
        m.rotation.order = "YXZ";
        m.rotation.x = Math.PI / 2;
        scene.add(m);
        coinMeshes.set(c.id, m);
      }
      const [wx, wz] = worldOf(c.x, c.y);
      // 立てた状態で足元に接する高さ。瓦礫の上で倒れたならその上に落ちる
      m.position.set(wx, elevationAt(grid, c.x, c.y) + COIN_R, wz);
    }
    for (const [id, m] of coinMeshes) {          // 拾われたコインは消す
      if (!seen.has(id)) {
        scene.remove(m);
        coinMeshes.delete(id);
      }
    }
  }

  /* --- 状態を画面へ反映する --- */
  // highlights: [{x, y, kind:"reach"|"target"}] / targetIds: 攻撃できる相手のid
  // coins: [{id, x, y}] 倒れた駒の跡
  function sync({ units, highlights = [], activeId = null, targetIds = [], coins = [] }) {
    for (const [, m] of tiles) m.material.color.setHex(COLOR.floor);
    for (const h of highlights) {
      const t = tiles.get(h.x + "," + h.y);
      if (t) t.material.color.setHex(h.kind === "target" ? COLOR.target : COLOR.reach);
    }

    for (const u of units) {
      const g = meshFor(u);
      // 戦闘不能の駒は盤面から退く(その場にはコインが残る)
      if (u.hp <= 0) { g.visible = false; continue; }

      const [wx, wz] = worldOf(u.x, u.y);
      const h = u.height ?? 2;
      // 瓦礫のマスでは、その上に立つ(足元の高さぶん持ち上げる)。
      // 0固定にしていた頃は瓦礫の箱にめり込んで見えていた
      const e = elevationAt(grid, u.x, u.y);
      g.position.set(wx, e, wz);
      // 攻撃できる相手は自身を光らせる。足元のマスを塗っても本体に隠れて見えないため
      const glow = targetIds.includes(u.id) ? COLOR.target : 0x000000;
      for (const mat of g.userData.mats) {
        mat.color.setHex(u.side === "party" ? COLOR.party : COLOR.enemy);
        mat.emissive.setHex(glow);
      }
      g.visible = true;
      if (u.id === activeId) {
        marker.visible = true;
        marker.position.set(wx, e + h + 0.5, wz);
      }
    }
    if (!activeId) marker.visible = false;

    syncCoins(coins);
  }

  /* --- ヒット演出 --- */
  // 衝撃の輪・ダメージ数値・被弾者の発光・画面の揺れ。すべて一時的な見た目だけで、
  // 盤面の状態は一切変えない。演出中でもcore.jsが確定した結果は動かない
  const clock = new THREE.Clock();
  const effects = [];
  const ringGeo = new THREE.RingGeometry(0.18, 0.42, 24);
  let shake = 0;

  function damageSprite(text, color) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    const g = c.getContext("2d");
    g.font = "bold 44px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 7;
    g.strokeStyle = "rgba(0,0,0,.85)";
    g.strokeText(text, 64, 32);
    g.fillStyle = color;
    g.fillText(text, 64, 32);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthTest: false
    }));
    s.scale.set(1.7, 0.85, 1);
    return s;
  }

  // ダメージ値を浮かび上がらせる(外れは0)
  function floatDamage(wx, wz, text, color, elev = 0) {
    const num = damageSprite(text, color);
    const y0 = elev + 1.3;
    num.position.set(wx, y0, wz);
    scene.add(num);
    effects.push({ kind: "float", obj: num, t: 0, dur: 0.85, y0 });
  }

  function spawnRing(wx, wz, color, dur, weak, elev = 0) {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, side: THREE.DoubleSide, depthTest: false
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(wx, elev + 0.15, wz);
    scene.add(ring);
    effects.push({ kind: "ring", obj: ring, t: 0, dur, weak });
  }

  function playHit(x, y, { crit = false, damage = 0, unitId = null } = {}) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);   // 瓦礫の上なら演出もその高さで出す
    spawnRing(wx, wz, crit ? 0xffd76a : 0xff8f6a, crit ? 0.5 : 0.36, false, e);
    floatDamage(wx, wz, String(damage), crit ? "#ffd76a" : "#ffffff", e);

    const g = unitId && unitMeshes.get(unitId);
    if (g) effects.push({ kind: "flash", mats: g.userData.mats, t: 0, dur: 0.28, color: crit ? 0xffd76a : 0xffffff });

    shake = crit ? 0.36 : 0.15;
  }

  function playMiss(x, y) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);
    spawnRing(wx, wz, 0x8b93a7, 0.3, true, e);
    floatDamage(wx, wz, "0", "#9aa3b5", e);   // 外れも0として出す(何も起きなかったのか判断できるように)
  }

  function stepEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      if (e.kind === "ring") {
        const s = 1 + k * (e.weak ? 1.4 : 2.6);
        e.obj.scale.set(s, s, s);
        e.obj.material.opacity = (1 - k) * (e.weak ? 0.5 : 0.9);
      } else if (e.kind === "float") {
        e.obj.position.y = e.y0 + k * 0.9;
        e.obj.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      } else if (e.kind === "flash") {
        for (const mat of e.mats) {
          mat.emissive.setHex(e.color);
          mat.emissiveIntensity = 1 - k;
        }
      }
      if (k < 1) continue;

      if (e.kind === "flash") {
        // 発光を戻す。対象ハイライトが必要なら次のsyncが塗り直す
        for (const mat of e.mats) {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 1;
        }
      } else {
        scene.remove(e.obj);
        e.obj.material.map?.dispose();
        e.obj.material.dispose();   // ジオメトリは使い回すので破棄しない
      }
      effects.splice(i, 1);
    }
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
    // ユニットを床より優先して拾う(敵の足元をクリックしても攻撃対象として扱えるように)。
    // ユニットはGroup(円錐+球など)なので再帰的に当てる
    const hits = raycaster.intersectObjects([...unitGroup.children, ...tiles.values()], true);
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
  let elapsed = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = clock.getDelta();

    // 回転はなめらかに寄せる(カメラを状態へ直結させない: build-game-camera-controls)。
    // 揺れは基本カメラの上に一時的に重ねるだけで、目標位置そのものは動かさない
    const want = Math.PI / 4 + dirIndex * (Math.PI / 2);
    const rotating = Math.abs(want - camAngle) > 0.001;
    if (rotating) camAngle += (want - camAngle) * 0.15;
    if (rotating || shake > 0) {
      placeCamera();
      if (shake > 0) {
        shake = Math.max(0, shake - dt * 1.8);
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        camera.position.z += (Math.random() - 0.5) * shake;
        if (shake === 0) placeCamera();   // 揺れ終わりに正位置へ戻す
      }
    }

    elapsed += dt;
    for (const l of lanterns) {
      // 係数を上げるほど速くなる。6ではせわしなかったので落としてある
      l.light.intensity = l.base * flicker(elapsed * 3.2 + l.phase);
    }

    stepEffects(dt);
    marker.rotation.y += 0.02;
    for (const [, m] of coinMeshes) m.rotation.y += 1.1 * dt;   // 拾えるものだと分かるよう回す
    renderer.render(scene, camera);
  };
  loop();

  return {
    sync,
    playHit,
    playMiss,
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
