import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STANDEE_VERSION } from "../battle/standeeVersion.js";
import { DUST_TOP, dustMaterial, dustMote } from "../battle/dustLook.js";
import { FLICKER_SPEED, LANTERN_COLOR, LANTERN_DECAY, LANTERN_INTENSITY, LANTERN_RANGE, flicker } from "../battle/lanternLook.js";
import { DOORWAY_HEIGHT_TILES, FLOOR_BASE, FLOOR_TEX_TILES, FLOOR_TONE, stoneTexture, wallGradientTexture } from "../battle/stoneLook.js";
import { FACING_YAW, levelCells } from "./mapwalk.js";

// 一人称の3D。戦闘(view3d.js)と同じ「1マス=1タイル」の座標系で組み、
// 壁の有無は探索・戦闘と同じ isOpen / hallBlocked を読む。
// 隠面と奥行きはGPUに任せる。自前の投影・並べ替え・隠面判定は持たない。
//
/* CELL は**一人称の見せ方の倍率**であって、寸法ではない。

   地図の1マスを画面上で何単位の幅に描くか、それだけを決める。地図(draw.js)が部屋を
   角丸長方形、通路を線幅0.62マスのストロークで描く模式図なのと同じ立場で、
   一人称も模式図として好きな広さに描いてよい。

   **正本は「マス」の側にある。** どのマスが歩けるか、どの境目に出入口があるかが唯一の事実で、
   戦闘盤はそれを1マス=1タイルで組む(hallBattleBoard / corridorBattleBoard が
   room.w×room.h をそのまま行データにしている)。CELL はそこに一切関与しない。

   だから **CELL を export しない。** これを外から読むと、絵の都合が寸法として扱われ、
   戦闘盤の組み方まで引きずられる。実際に一度そうなった。読んでよいのはこのファイルだけで、
   `core.test.mjs` が見張っている。

   値は作者が絵を見て決めた(2026-09-01。小さくすると縦長のスリットになり、
   ゲームとして成立しない)。壁や開口が画面上でマスより広く描かれても、**扱いは1マス**。 */
const CELL = 3;
/* 天井の高さは1マス分。通路の断面が1マス角の正方形になる(2026-09-01、作者の決定)。
   それまで戦闘の stoneLook.js から値を借りていたが、坑道の広さは**見せ方**なので、
   マスの大きさに合わせて伸縮させる。戦闘に天井は無い(盤を見下ろす)ので、
   借りる相手がそもそも無かった。

   アーチの高さ(ARCH_H)だけは戦闘と共通のまま。あちらは「人が通れる高さ」という
   意味を持つ値で、戦闘の書き割りにも同じ入口が描いてある。
   天井は坑道の広さ(見せ方)、アーチは人の背丈(意味)、と分けている。

   目の高さは、アーチの高さから逆算した背丈(2.0/1.6 = 1.25)のやや下。 */
export const CEIL = CELL, EYE = 1.15;
// 入口アーチの寸法。高さは戦闘の書き割りに描いてある入口と同じ値(stoneLook.jsが正本)。
// 天井より低い。人が通れる高さであって、坑道の高さではない。
// 幅はマスに収める。CELLを縮めた時に、開口がマスより広くなって壁が消えるのを防ぐ。
const ARCH_W = Math.min(1.4, CELL * 0.7), ARCH_H = DOORWAY_HEIGHT_TILES;
const BG = 0x0a0d14, LINE = 0x8fb0d8, FLOOR_LINE = 0x6d8399;
/* 霧の色。背景(BG)と同じにすると「奥が暗くなる」だけで、灯りが届かないのと見分けが
   つかない。少し明るい青へずらすと、坑道の埃が灯りを拾って霞む感じが出る。

   2026-09-01に3案を並べて作者が選んだ(背景と同色 / これ(背景の2.1倍) / 3.4倍)。
   3.4倍は奥が読めるようになる代わりに、坑道全体に環境光が回っているように見え、
   カンテラが主光源だという設定とぶつかった。明るくしすぎないこと。 */
const FOG_COLOR = 0x151d2b;
// 霧が効きはじめる距離と、見えなくなる距離。マスの大きさに合わせて伸縮させる。
const FOG_NEAR = CELL * 0.8, FOG_FAR = CELL * 4.2;
// 向きは角度で持つ(FACING_YAWが正本)。旋回の補間で北⇄西を跨ぐ時に長い方へ回らないよう、
// 目標角を現在地から±πの範囲へ畳んで使う。
const parse = key => key.split(",").map(Number);
// 歩行と旋回にかける時間。長いと待たされ、短いとどこへ動いたか分からない。単位: ミリ秒。
const STEP_MS = 190, TURN_MS = 170;
// カメラを立ち位置からどれだけ後ろへ引くか。マスの大きさに対する割合で持つ。
// 引くほど広く見えるが、マスの外へ出ると後ろの壁を突き抜けるので上限を設ける。
// 割合は作者が絵を見て決めた(2026-09-01、1.00に変更)。
export const CAM_BACK_DEFAULT = 1.0, CAM_BACK_MAX = CELL * 0.43;
// 塵の見た目は戦闘と同じ dustLook.js を読む(2画面で食い違わせない)。
// ここで決めるのは「どこに、何個置くか」だけ。
// 撒く範囲はカメラの周り±1マス。粒の数はそこが混みすぎず、まばらにも見えない数を選んだ。
const DUST_COUNT = 38, DUST_RANGE = CELL;

export function createFirstPersonScene(container, map, { ceilTiles = CEIL, obstacles = [] } = {}) {
  const ceil = ceilTiles;   // 天井の高さ。開発用スライダーで動かして決める
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  const { open, solid } = levelCells(map);

  const dark = hex => new THREE.MeshLambertMaterial({ color: hex, fog: true });
  /* 壁は戦闘の書き割りと同じ縦グラデーション(stoneLook.js が正本)。上が見えて、
     下へ向かうほど闇に沈む。戦闘は透過で床際を落とすが、こちらはカメラが中を歩くので
     不透明に焼き込む(opaque。背景色の上へ合成するので見た目は同じ)。
     色はテクスチャが持つので、材質の color は白にして光だけ乗せる。 */
  // 倍率1.5は、上端がそれまでの壁色(43,48,60)とほぼ同じ明るさに戻る値。
  // これを入れないと、カンテラの光を掛けたぶん全体が暗くなりグラデーションが潰れる。
  const wallTex = wallGradientTexture({ opaque: true, gain: 1.5,
    over: [BG >> 16 & 255, BG >> 8 & 255, BG & 255] });
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, fog: true });
  const ceilMat = dark(0x232833);
  // 床は戦闘と同じ石。石の目の細かさを戦闘に揃えるため、stoneLook.js の FLOOR_TEX_TILES で
  // repeat を決める。マス1枚にテクスチャを1回だけ貼ると、石が細かくなりすぎる。
  const stoneTex = stoneTexture();
  stoneTex.repeat.set(CELL / FLOOR_TEX_TILES, CELL / FLOOR_TEX_TILES);
  const floorMat = new THREE.MeshLambertMaterial({ map: stoneTex, fog: true,
    color: new THREE.Color(FLOOR_BASE).multiplyScalar(FLOOR_TONE) });
  const lineMat = new THREE.LineBasicMaterial({ color: LINE, fog: true });
  const floorLineMat = new THREE.LineBasicMaterial({ color: FLOOR_LINE, fog: true, transparent: true, opacity: .45 });

  const boxGeo = new THREE.BoxGeometry(CELL, ceil, CELL);
  // 床の板。1マス(=CELL タイル)にテクスチャを1枚ぴったり貼る。
  // 戦闘は盤面座標でUVを振って連続させているが、こちらは1マスで閉じるので既定のUVでよい。
  const planeGeo = new THREE.PlaneGeometry(CELL, CELL);
  const ceilGeo = new THREE.PlaneGeometry(CELL, CELL);
  const wallGroup = new THREE.Group(), floorGroup = new THREE.Group();
  scene.add(wallGroup, floorGroup);

  for (const key of solid) {
    const [x, y] = parse(key);
    const m = new THREE.Mesh(boxGeo, wallMat);
    m.position.set(x * CELL, ceil / 2, y * CELL);
    wallGroup.add(m);
  }

  // 壁の稜線。空きマスに面している辺だけ引く(線画に見せるため)。
  // 面そのものはGPUが隠すので、ここは見た目の線だけの話。
  const edges = [];
  const push = (ax, az, bx, bz) => { edges.push(ax, 0, az, bx, 0, bz, ax, ceil, az, bx, ceil, bz, ax, 0, az, ax, ceil, az, bx, 0, bz, bx, ceil, bz); };
  for (const key of solid) {
    const [x, y] = parse(key);
    const cx = x * CELL, cz = y * CELL, h = CELL / 2;
    if (open.has(`${x},${y - 1}`)) push(cx - h, cz - h, cx + h, cz - h);
    if (open.has(`${x},${y + 1}`)) push(cx - h, cz + h, cx + h, cz + h);
    if (open.has(`${x - 1},${y}`)) push(cx - h, cz - h, cx - h, cz + h);
    if (open.has(`${x + 1},${y}`)) push(cx + h, cz - h, cx + h, cz + h);
  }
  // 入口アーチ。部屋と通路の境目に、戦闘の書き割りと同じ寸法(幅1.4 × 高さ2.0タイル)で置く。
  // 通路の高さが人の出入口に対してどのくらいかを、絵の中で見比べるための物差し。
  const archLines = [];
  const kindOf = key => map.cells.get(key)?.kind;
  /* 入口の壁。戦闘(view3d.js)は開口部にアーチを抜いた書き割りを立てているので、
     線だけだと探索側にその壁が無いことになる。同じ寸法で実体を置いて揃える。
     戦闘は平らな絵(MeshBasic・下端は透過)でよいが、こちらはカメラが潜るので実体にする。
     アーチの穴は上の arcAt と同じ式。片方だけ直すとふちがずれる。 */
  const archWallShape = () => {
    const r = ARCH_W / 2, straight = ARCH_H - r, h = CELL / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-h, 0); shape.lineTo(h, 0); shape.lineTo(h, ceil); shape.lineTo(-h, ceil); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-r, 0); hole.lineTo(-r, straight);
    hole.absarc(0, straight, r, Math.PI, 0, true);   // 真上を通す(falseだと下へ回る)
    hole.lineTo(r, 0); hole.closePath();
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape);
  };
  const archWallGeo = archWallShape();
  // 部屋からも通路からも見えるので両面。稜線とアーチの線が同じ面に載るので、面だけ奥へ押す。
  /* ShapeGeometry のUVは頂点座標そのものなので、y(0〜ceil)をvの0〜1へ畳む。
     畳まないとグラデーションが天井の高さぶん繰り返して縞になる。
     横は2pxの縦グラデーションなので、uがどう伸びても見た目は変わらない。 */
  const archWallTex = wallTex.clone();
  archWallTex.needsUpdate = true;
  archWallTex.repeat.set(1, 1 / ceil);
  const archWallMat = new THREE.MeshLambertMaterial({ map: archWallTex, fog: true,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const arcAt = (cx, cz, dirX, dirZ) => {
    // 境目に垂直な面へ描く。境目の向き(dirX,dirZ)に直交する軸が開口の幅になる。
    const ux = -dirZ, uz = dirX, r = ARCH_W / 2, straight = ARCH_H - r, SEG = 12;
    const at = (u, y) => [cx + ux * u, y, cz + uz * u];
    const seg = (a, b) => archLines.push(...a, ...b);
    seg(at(-r, 0), at(-r, straight));
    seg(at(r, 0), at(r, straight));
    for (let i = 0; i < SEG; i += 1) {
      const t0 = Math.PI * i / SEG, t1 = Math.PI * (i + 1) / SEG;
      seg(at(-r * Math.cos(t0), straight + r * Math.sin(t0)), at(-r * Math.cos(t1), straight + r * Math.sin(t1)));
    }
  };
  for (const key of open) {
    const [x, y] = parse(key);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {   // 各境目を1回だけ見るため、右と下だけ調べる
      const nextKey = `${x + dx},${y + dy}`;
      if (!open.has(nextKey)) continue;
      // 部屋と通路の境目だけを入口とする。部屋の中や通路の途中には置かない。
      if ((kindOf(key) === "corridor") === (kindOf(nextKey) === "corridor")) continue;
      const wx = (x + dx / 2) * CELL, wz = (y + dy / 2) * CELL;
      arcAt(wx, wz, dx, dy);
      // 上端の稜線。他の壁と同じ線として引く(2026-09-01、作者の指示)。
      // 引かないとアーチ壁だけ上の縁が無く、他の壁と違う面に見える。
      const ux = -dy, uz = dx, h = CELL / 2;   // 境目に沿う軸
      edges.push(wx - ux * h, ceil, wz - uz * h, wx + ux * h, ceil, wz + uz * h);
      const wall = new THREE.Mesh(archWallGeo, archWallMat);
      wall.position.set(wx, 0, wz);
      wall.rotation.y = dx ? Math.PI / 2 : 0;   // 幅の軸を境目に沿わせる
      wallGroup.add(wall);
    }
  }
  const archGeo = new THREE.BufferGeometry();
  archGeo.setAttribute("position", new THREE.Float32BufferAttribute(archLines, 3));
  // 線の色は他の稜線と同じ(2026-09-01、作者の指示)。橙で描き分けていたが、
  // 一人称の線画の中でアーチだけ浮いていた。
  scene.add(new THREE.LineSegments(archGeo, lineMat));

  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
  scene.add(new THREE.LineSegments(edgeGeo, lineMat));

  /* 床と天井。床の目盛りは**マスの境目だけ**に引く。1マスの中を3分割していた頃の名残を
     消したもの(2026-09-01、作者の指示)。マスの中に線を入れると「1マスは分割されている」と
     読まれ、混乱の元になっていた。地図の1マスと、床の1区画が1対1で対応する。 */
  const grid = [];
  for (const key of open) {
    const [x, y] = parse(key);
    const cx = x * CELL, cz = y * CELL, h = CELL / 2;
    const floor = new THREE.Mesh(planeGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floorGroup.add(floor);
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(cx, ceil, cz);
    floorGroup.add(ceilMesh);
    for (const i of [0, CELL]) {
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

  // 同行者。戦闘と同じスタンディをそのまま置く。
  // 立ち位置はパーティのマスの中心から見た「横」と「前」(単位: タイル)。
  // カメラは中心より CAM_BACK 分だけ後ろにいるので、この位置だと背中が視界に入る。
  /* 同行者。1マス=1タイルだと通路の幅が1タイルしかなく、板の幅(リディア0.638・
     ガレス0.884)では横に2人並べられない。縦一列にする。
     主人公(ガレス)はカメラそのものなので置かない。 */
  const PARTY = [
    { model: "lydia", side: 0, ahead: 0.35 },   // カメラ側(自分寄り)に立つ(2026-09-01、作者の指示)
  ];
  const partyGroup = new THREE.Group();
  scene.add(partyGroup);
  const members = [];
  let companionDisposed = false;
  // 同行者の板はMeshBasicMaterialで光源の影響を受けないので、灯りのON/OFFに
  // 自分で追従させる(2026-09-01、作者の指示。消灯してもリディアだけ明るいままだった)。
  const plateMaterials = [];
  const LANTERN_OFF_DIM = 0.2;
  const applyPlateLantern = () => {
    for (const material of plateMaterials) material.color.setScalar(lanternOn ? 1 : LANTERN_OFF_DIM);
  };
  for (const spec of PARTY) {
    const g = new THREE.Group();
    partyGroup.add(g);
    members.push({ ...spec, group: g });
    new GLTFLoader().load(`/models/${spec.model}-standee-${STANDEE_VERSION}.glb`, gltf => {
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
        plateMaterials.push(...made);
        obj.material = Array.isArray(obj.material) ? made : made[0];
      });
      g.add(gltf.scene);
      applyPlateLantern();
    }, undefined, () => { /* モデルが無くても探索は続けられる。その駒が出ないだけ */ });
  }

  /* 通路戦・大部屋戦の障害物。位置と高さは戦闘盤(battleState.createExpeditionBattleLayout)と
     同じ計算から来るので、ここで見えたものと戦闘開始後の配置は一致する
     (2026-09-01、作者の要望。まだ当たり判定は持たず、見た目だけ)。

     壁や床と違って部屋をまたぐたびに変わる(floor.at が部屋⇄通路でnullとroom idを
     行き来する)ので、地図と同じ組み直し(createFirstPersonScene)にぶら下げると
     1マス移動するたびシーン全体が壊れて作り直され、tick()の歩行アニメが毎回リセットされる
     (2026-09-01、実際にこの不具合を作って踏んだ)。setObstacles だけを別に持ち、
     壁・床・カメラは触らずに障害物の見た目だけ差し替える。 */
  const obstacleMat = new THREE.MeshLambertMaterial({ color: 0x3a4150, fog: true });
  const obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);
  const clearObstacles = () => {
    for (const child of [...obstacleGroup.children]) { child.geometry?.dispose(); obstacleGroup.remove(child); }
  };
  const setObstacles = list => {
    clearObstacles();
    for (const o of list) {
      const w = CELL * 0.8, h = Math.max(0.15, o.height) * CELL;
      const geo = new THREE.BoxGeometry(w, h, w);
      const m = new THREE.Mesh(geo, obstacleMat);
      m.position.set(o.x * CELL, h / 2, o.y * CELL);
      obstacleGroup.add(m, new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat));
    }
  };
  setObstacles(obstacles);

  // 敵影。位置は外から差し込む(地図には出さない固定敵)。
  const markerGeo = new THREE.ConeGeometry(CELL * 0.22, 0.9, 4);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x6b3a3a, fog: true }));
  marker.visible = false;
  scene.add(marker);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, CELL * 12);
  camera.position.y = EYE;
  // カンテラ。色・強さ・減衰・揺らぎは戦闘と同じ lanternLook.js を読む。
  // 射程だけは場面で違う。戦闘は盤を見下ろすので短くて足りるが、一人称は
  // 進行方向の奥まで見えるため、灯りが届かないと真っ暗な穴を覗くことになる。
  // ここでは LANTERN_RANGE_CELLS マス先までを照らす。
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
  let lanternOn = true;
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
    // 炎の揺らぎ。戦闘と同じ式・同じ速さ。灯り角ボタンでOFFにした間は0のまま(環境光だけ残る)。
    lantern.intensity = lanternOn ? LANTERN_INTENSITY * flicker(elapsed * FLICKER_SPEED) : 0;
    camera.position.set(state.x + Math.sin(state.yaw) * camBack, EYE, state.z + Math.cos(state.yaw) * camBack);
    camera.rotation.set(0, state.yaw, 0);
    // 味方は進行方向を向いて歩く。
    // スタンディは+Zを正面に作ってあるので、カメラの前方(-sin,-cos)へ向けるには yaw + π。
    const fwdX = -Math.sin(state.yaw), fwdZ = -Math.cos(state.yaw);
    for (const m of members) {
      m.group.position.set(
        state.x + fwdX * m.ahead - fwdZ * m.side, 0,
        state.z + fwdZ * m.ahead + fwdX * m.side);
      m.group.rotation.y = state.yaw + Math.PI;
    }
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
    setObstacles,
    // カメラの引き。決まったら CAM_BACK_DEFAULT に固定して、この口ごと消してよい。
    setBack(value) {
      camBack = Math.max(0, Math.min(CAM_BACK_MAX, value));
      draw();
    },
    // 灯りの角ボタン(FirstPerson3D.jsx)から呼ぶ。カンテラの光だけ消す(環境光は残す)。
    setLanternOn(on) {
      lanternOn = on;
      applyPlateLantern();
      draw();
    },
    dispose() {
      companionDisposed = true;
      partyGroup.traverse(o => { o.geometry?.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose(); x.dispose(); }); });
      document.removeEventListener("visibilitychange", onVisible);
      if (raf) cancelAnimationFrame(raf);
      renderer.domElement.remove();
      renderer.dispose();
      for (const geo of [boxGeo, planeGeo, ceilGeo, edgeGeo, archGeo, archWallGeo, gridGeo, markerGeo]) geo.dispose();
      clearObstacles();
      for (const tex of [wallTex, archWallTex]) tex.dispose();
      dustMat.map?.dispose();
      stoneTex.dispose();
      for (const mat of [wallMat, floorMat, ceilMat, lineMat, floorLineMat, dustMat, marker.material, obstacleMat]) mat.dispose();
    },
  };
}
