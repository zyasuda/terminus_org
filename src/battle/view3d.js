/* =========================================================
   戦闘グリッドの3D描画(Phase 1)

   Three.jsを触る命令的な処理をここに閉じ込める。
   ゲームのルールは一切持たない。core.js が確定した盤面を「見せる」だけ。

   Phase 1ではキャラクターのアセットを使わず、色付きの箱で表示する。
   ビルボードか3Dモデルかは、本番のカメラ距離で見てから決める方針のため
   (build-hybrid-game-assets: 「アセットビューアではなくゲーム内で確認する」)。
   ========================================================= */

import * as THREE from "three";
import { STANDEE_VERSION } from "./standeeVersion.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { elevationAt, makeRng } from "./core.js";

// 床の紙は1マスちょうどで隙間なく敷く。TILEはマス内に物を置くときの
// 「はみ出さない範囲」の目安として、水溜りや瓦礫の大きさに使う。
const TILE = 0.92;
const WALL_H = 1.0;

// ランタンの色と強さ。夜の主光源。
// 元は0xffa848(濃い橙)だったが、床を石のモノトーンにしたところ床が橙に染まり、
// グレーに見えなくなった。scripts/lantern-tune.mjs で床の無彩色からの偏りを
// 実測して詰めた値(2026-08-25、偏り26.4%→3.3%)。橙みは残っているが、
// ランタンの存在は色ではなく明るさの落ち方で出る(近く明度53 / 遠く明度41)。
const LANTERN_COLOR = 0xffe3bd;
const LANTERN_INTENSITY = 4.6;   // 板の明るさの基準にも使う(applyPlateLight)
const LANTERN_RANGE = 3.0;
const LIGHT_PRESET_LANTERN_DEFAULT = true;   // 既定は夜プリセット

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

// ズームの可動域。スライダーと指のピンチで共通の上下限にする(作者の指示 2026-08-27)。
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5.0;
const CAMERA_DIST = 20;   // placeCamera()の r と同じ値。fogのnear/farはここからの相対距離で決める
const OCCLUDER_OPACITY = 0.35;

const modelTemplates = new Map();
const loadModel = path => {
  if (!modelTemplates.has(path)) {
    modelTemplates.set(path, new Promise((resolve, reject) => {
      new GLTFLoader().load(path, gltf => resolve(gltf.scene), undefined, reject);
    }));
  }
  return modelTemplates.get(path);
};

// 真のアイソメトリックに近い見下ろし角(atan(1/√2) ≒ 35.264度)。
// cameraElevationDegを省略した呼び出し(本編の会話バトル画面など)はこれまで通りの見た目になる。
const TRUE_ISO_ELEVATION_DEG = Math.atan(1 / Math.SQRT2) * 180 / Math.PI;

export function createBattleScene(container, grid, { voidBoundaryWalls = false, cameraElevationDeg = TRUE_ISO_ELEVATION_DEG, cameraZoom: initialCameraZoom = 1 } = {}) {
  let cameraElevation = cameraElevationDeg * Math.PI / 180;   // setCameraElevationDeg()で見た目を確認しながら調整できる
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);
  // 奥行き方向の霞み。書き割りの上下グラデーションとは軸が違う(fogは奥行き、
  // 書き割りは高さ)ので、役割が重ならず共存できる。標準マテリアルは既定でfogの
  // 影響を受けるので、追加でmaterial側の設定は要らない。
  // THREE.Fogは「カメラ位置からの実距離」で効く。正射影でも見た目の大きさは
  // 変わらないが距離自体はCAMERA_DIST(≒20)離れているので、盤面の大きさだけで
  // near/farを決めると実距離よりずっと小さくなり、全部霞んでしまう(実際に起きた)。
  // 8x8盤面・真のアイソメトリック(35.264度)では実測で手前角が約20.6、奥角が約28.7
  // だったので、その範囲を挟むようにnear/farを置く(手前はほぼ霞まず、奥だけはっきり沈む)。
  // 見下ろし角を変えると、水平距離(r)を保ったままカメラの実距離(r/cos(角度))が伸び縮みする。
  // near/farを固定のままにすると、角度を上げただけで盤面ごと霧の外(=背景色)に
  // 押し出されて真っ暗になる(cameraElevationDeg導入時に実際に起きた)。
  // 真のアイソメトリック時の実距離との比でnear/farを一緒に伸縮させ、
  // 「手前は霞まず奥だけ沈む」という見え方の相対関係を角度によらず保つ。
  const trueIsoDist = CAMERA_DIST / Math.cos(TRUE_ISO_ELEVATION_DEG * Math.PI / 180);
  const FOG_MIN_DENSITY = 0.05;   // 強さ0: ほぼ無効
  const FOG_MAX_DENSITY = 0.88;   // 強さ1: 従来のfar=CAMERA_DIST+10相当
  let FOG_NEAR, FOG_REF_DIST;
  const fogObj = new THREE.Fog(COLOR.bg, 1, 2);
  // 既定はOFF。奥の暗さは距離での暗転(depthStrength)が担い、fogは天候の演出として
  // 作者が明示的に点けるものにする。以前はここでONにしていたため、呼び出し側が
  // 必ずOFFにする一方で検証用シーンだけ霧が残る、という食い違いが起きていた。
  scene.fog = null;
  // setCameraElevationDeg()で角度を変えるたびにも呼び直し、fogが盤面を飲み込まないようにする。
  const applyFogRange = () => {
    const cameraDist = CAMERA_DIST / Math.cos(cameraElevation);
    const fogScale = cameraDist / trueIsoDist;
    FOG_NEAR = (CAMERA_DIST - 1) * fogScale;
    // 盤面奥角の実測距離(約28.7、真のアイソメトリック時)。フェーダーの強さをここでの
    // 霞み具合に対して線形にするための基準点(setFogIntensity参照)
    FOG_REF_DIST = (CAMERA_DIST + 8.7) * fogScale;
    fogObj.near = FOG_NEAR;
    fogObj.far = (CAMERA_DIST + 10) * fogScale;
  };
  applyFogRange();

  // グリッド中心を原点に置く。セル(x,y)はワールドの(x,·,y)へ写す
  const offX = (grid.w - 1) / 2;
  const offZ = (grid.h - 1) / 2;
  const worldOf = (x, y) => [x - offX, y - offZ];

  /* --- カメラ(戦闘は正射影、会話相手は一人称の透視投影) --- */
  const gridViewSize = Math.max(grid.w, grid.h) + 4;
  let cameraZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, initialCameraZoom));
  let baseViewSize = gridViewSize / cameraZoom;
  let viewSize = baseViewSize;
  const isoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  let camera = isoCamera;
  container.dataset.cameraProjection = "orthographic";
  let dirIndex = 0;
  let camAngle = Math.PI / 4;        // 実際の角度(なめらかに目標へ寄せる)
  const target = new THREE.Vector3(0, 0, 0);

  const applyFrustum = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    isoCamera.left = (-viewSize * aspect) / 2;
    isoCamera.right = (viewSize * aspect) / 2;
    isoCamera.top = viewSize / 2;
    isoCamera.bottom = -viewSize / 2;
    isoCamera.updateProjectionMatrix();
  };

  /* --- 距離での暗転(奥ほど暗くする) ---
     以前はTHREE.Fogでやっていたが、fogには2つの役割が乗っていた:
     「演出の枠としての奥の暗さ」と「天候としての霧」。呼び出し側2つはどちらも
     霧を既定OFFにしていたので、枠の方も一緒に消えていた(2026-08-25、検証用シーンだけ
     霧が残っていて、ゲームと違う絵で明るさを判断しかけた)。
     枠の方はfogから切り離して自前で持つ。fogは天候の演出として残す。
     fogと違って、床・障害物・駒の板それぞれに別の曲線を当てられる。
     とくに板の絵はfogではほとんど暗くならなかった(実測 手前76.2 / 奥72.8、比0.96)ので、
     fogのままだと奥の駒だけが暗い床から浮いていた。 */
  // 0で無効、1で最奥が真っ黒。0.8で床と板がほぼ同じ比で沈む(実測 床0.68 / 板0.69)。
  // 何もしないと奥の方が明るい(比1.33)。key光が(6,12,4)から差していて、
  // 盤面の奥ほど正面から当たるため。0.5あたりでようやく前後が同じ明るさになる。
  const DEPTH_DARKENING = 0.8;
  let depthStrength = DEPTH_DARKENING;
  const camPos = new THREE.Vector3();
  let depthNear = 0, depthFar = 1;
  const paperCells = [];    // 床の紙。頂点カラーで暗くする(材質は共有のまま)
  const depthTinted = [];   // 障害物・瓦礫・ステージの物。{ material, base }
  // カメラが動いたときに引き直す。回転中は毎フレーム走るが、
  // 8x8で64マス×4頂点なので負荷にならない。
  let onCameraMoved = () => {};

  const placeCamera = () => {
    if (camera !== isoCamera) return;
    // 注視点(target)と水平距離(r)は変えず、見下ろし角だけをcameraElevationで変える。
    // 角度を上げるほど、手前の障害物が奥の盤面と重なりにくくなる。
    const r = CAMERA_DIST, y = r * Math.tan(cameraElevation);
    // カメラの位置は注視点からの相対で決める。原点基準にすると、targetを動かしても
    // カメラが原点に留まったまま向きだけ変わり、寄ったつもりの駒が逆に枠外へ出る。
    isoCamera.position.set(target.x + Math.cos(camAngle) * r, target.y + y, target.z + Math.sin(camAngle) * r);
    isoCamera.lookAt(target);
    onCameraMoved();
  };
  // カメラからの距離を0〜1へ正規化して、明るさの係数にする。
  // 正規化の範囲は盤面のマスの最近・最遠なので、盤面の大きさや見下ろし角が
  // 変わっても「最奥がどれだけ暗いか」は同じに保たれる。
  const depthFactorAt = (x, y, z) => {
    if (!depthStrength || depthFar <= depthNear) return 1;
    const d = Math.hypot(camPos.x - x, camPos.y - y, camPos.z - z);
    const t = Math.min(1, Math.max(0, (d - depthNear) / (depthFar - depthNear)));
    return 1 - depthStrength * t;
  };

  /* --- ライト ---
     地の明かりは、盤面が読めなくならない程度まで落としてある(夜プリセット、既定)。
     暗くするのが目的ではなく、下のランタンの揺らぎが分かるようにするため。
     屋外・昼の場面では背景色を変えるだけだと地面が暗いままで浮くので、
     「昼」プリセットでは太陽光相当まで両方の強さを上げる */
  // lantern: そのプリセットでランタンを点けるか。
  // 昼は太陽光(key)だけにする。屋外の昼にランタンが点いていると、
  // 持ち主の足元だけが橙に染まって太陽光と喧嘩する。
  const LIGHT_PRESET = {
    night: { ambient: 0.34, key: 0.36, keyColor: 0xdfe6ff, lantern: true },
    day: { ambient: 0.85, key: 1.05, keyColor: 0xfff3da, lantern: false }
  };
  const ambientLight = new THREE.AmbientLight(0xffffff, LIGHT_PRESET.night.ambient);
  scene.add(ambientLight);
  const key = new THREE.DirectionalLight(LIGHT_PRESET.night.keyColor, LIGHT_PRESET.night.key);
  key.position.set(6, 12, 4);
  scene.add(key);

  /* --- ランタン(ゆらぐ炎) ---
     盤面に固定で置くのはやめ、味方(ガレス・リディア)が持ち歩く形にした。
     ユニットのGroupに光源を入れてあるので、移動すれば明かりも一緒に動く。
     倒れると visible=false になり、Three.jsは非表示のライトを集計しないので
     明かりも自然に消える。敵は光源を持たない。
     見た目だけの演出で、射線や明暗による判定には一切関与しない */
  const lanterns = [];
  // ユニットは各手番の描画(meshFor)で遅延生成されるため、生成タイミングによらず
  // 既存の設定を新しいランタンにも適用できるよう、ユニットIDごとの状態をここに持つ。
  // ガレスだけ消す、リディアの手番でリディアだけ消す、といった個別操作のため
  // (以前は全員一括on/offだったが、個別に制御したいとの要望で変更した)
  const lanternOverrides = new Map();   // id → boolean(未設定なら既定でtrue)

  /* --- 板の印刷面の明るさ ---
     スタンディの絵はMeshBasicMaterial(光源を計算しない)で貼っている。陰影が描き
     込まれた完成イラストなので、直接照らすと濃い衣装だけが白飛びするため。
     その代わり、カンテラを消しても絵だけ元の明るさのまま残り、暗い床の上で駒が
     浮いて見えていた(2026-08-25、板の内側の画素が84%完全に同一だと実測)。
     照らすのではなく、部屋の明るさに応じて絵の色を乗算で落とす。白飛びしない性質は
     保ったまま、暗さに追随する。
     LANTERN_LIGHT_WEIGHTは「カンテラが部屋の明るさにどれだけ足しているか」で、
     床の明度の実測(点灯56.5 / 消灯37.7、環境光+key=0.70)から逆算した値。
     基準は「夜+カンテラ点灯」で、そこを1.0(絵をそのままの明るさで出す)とする。 */
  // カンテラが部屋の明るさに足す量。床の明度の見かけ(0.35と見積もっていた)ではなく、
  // 「点灯/消灯で板と床の明るさの比が変わらない」条件を実測して決めた値。
  // 0.35では板が床ほど落ちず、消灯するとかえって駒が目立っていた
  // (実測 板/床が点灯1.41→消灯1.79)。1.8にすると点灯1.38 / 消灯1.36で揃う。
  // 見かけより大きいのは、色の乗算が線形空間で効くのに対して画面の値がガンマ後だから。
  let LANTERN_LIGHT_WEIGHT = 1.8;
  const PLATE_LIGHT_MIN = 0.22;   // 真っ暗にはしない下限
  // 基準は重みから毎回引き直す。定数にしてしまうと、重みを変えても
  // 消灯時の分母が古い値のままになり、いくら重みを動かしても効かない。
  const plateLightRef = () => LIGHT_PRESET.night.ambient + LIGHT_PRESET.night.key + LANTERN_LIGHT_WEIGHT;
  const plateMaterials = [];     // { material, base, owner } 印刷面だけ。板の縁(Rim)は元から照明を受ける
  // THREE.PointLight(decay=0, distance=D)の減衰と同じ式。
  // 板は照明を受けないので、板に当たる光の量はここで自分で計算する必要がある。
  // three側の実装: attenuation = (1 - (d/D)^4)^2 (saturate済み)。
  const lanternAttenuation = (dx, dy, dz) => {
    const d = Math.hypot(dx, dy, dz);
    const t = Math.max(0, 1 - (d / lanternRange) ** 4);
    return t * t;
  };
  const applyPlateLight = () => {
    // カンテラの寄与は、点いているかどうかだけでなく
    //   ・実際の強さ (下げたときに床だけ暗くなって板が浮かないように)
    //   ・その駒からカンテラまでの距離 (射程を詰めたときに、光の輪の外の駒も暗くなるように)
    // の両方に比例させる。射程3.0では光の輪の外に出る駒があるので、距離が要る。
    const share = LANTERN_LIGHT_WEIGHT * (lanternIntensity / LANTERN_INTENSITY);
    const ref = plateLightRef();
    for (const { material, base, owner } of plateMaterials) {
      const p = owner.position;
      let lantern = 0;
      for (const l of lanterns) {
        if (!l.light.visible) continue;
        const gp = l.light.parent.position;   // カンテラは持ち主のGroupの子
        lantern += share * lanternAttenuation(gp.x - p.x, gp.y + l.light.position.y - p.y, gp.z - p.z);
      }
      const room = ambientLight.intensity + key.intensity + lantern;
      const roomFactor = Math.max(PLATE_LIGHT_MIN, Math.min(1, room / ref));
      // 部屋の明るさ × カメラからの距離。床と同じ曲線で沈むので、奥の駒が浮かない。
      material.color.copy(base).multiplyScalar(roomFactor * depthFactorAt(p.x, p.y, p.z));
    }
  };
  // ランタンの色。元は0xffa848(濃い橙)だったが、床を石のモノトーンにしたところ
  // 石が橙に染まってグレーに見えなくなった。橙みを残しつつ、床の色の偏りを
  // 実測して詰めた値(2026-08-25、scripts/lantern-tune.mjsで測定)。
  let lanternColor = LANTERN_COLOR;
  let lanternIntensity = LANTERN_INTENSITY;
  // 届く範囲。減衰0なのでこの距離までほぼ一様に照らし、縁でなめらかに落ちる。
  // 6.4では8x8の盤面をほぼ全面照らしてしまい「カンテラのまわりだけ明るい」感が
  // 出なかったので、3.0にして光の輪を作った(2026-08-25、作者が並べて選定)。
  let lanternRange = LANTERN_RANGE;
  // プリセット(昼/夜)による一括の点灯。個別のsetLanternEnabledより優先する
  // (昼はランタンを消す、という決めごとを個別設定で破らせない)。
  let lanternPresetOn = LIGHT_PRESET_LANTERN_DEFAULT;
  const lanternVisibleFor = id =>
    lanternPresetOn && (lanternOverrides.has(id) ? lanternOverrides.get(id) : true);
  const applyLanternPreset = on => {
    lanternPresetOn = on !== false;
    for (const l of lanterns) l.light.visible = lanternVisibleFor(l.id);
    applyPlateLight();
  };

  // 周期の違う正弦を重ねて、繰り返しに気づきにくいゆらぎを作る。
  // 速い成分を厚めにすると「ゆっくり明滅」ではなく炎のチラつきに寄る
  const flicker = t =>
    0.68 + 0.32 * (Math.sin(t) * 0.34 + Math.sin(t * 2.3) * 0.3 + Math.sin(t * 5.7) * 0.22 + Math.sin(t * 9.1) * 0.14);

  /* --- 床と壁(戦闘中は変化しないので一度だけ作る) ---
     床はタイルの箱ではなく、厚みのない紙として描く。マスの切れ目ではなく細い線で
     グリッドを表す。層を3つに分けてあるのが肝:
       1. 紙   マスごとの平面。材質は1つを共有し、UVを盤面座標から振るので
               1枚のテクスチャが盤面全体に連続して乗る
       2. 覆い マスごとの透明な平面。ハイライトの塗りと当たり判定を担う
       3. 線   全部の辺を1つのLineSegmentsで引く。1ドローコール
     材質を共有した紙はマスごとに色を塗れないので、ハイライトは2層目が持つ。
     以前はタイルの材質をcloneして塗り替えていた(2026-08-25にこの形へ変えた)。
     線を覆いより上に置いてあるのは、ハイライト中もグリッドを見せるため。 */
  const PAPER_Y = 0;              // 歩く面。箱だった頃の上面(y=0)と同じ高さに保つ
  const HIGHLIGHT_Y = 0.004;
  const GRID_LINE_Y = 0.008;
  const HIGHLIGHT_OPACITY = 0.42;
  const GRID_LINE_OPACITY = 0.5;   // 比較画像から作者が決めた値(2026-08-25)
  const FLOOR_TONE = 0.8;          // 同上
  const FLOOR_TEX_TILES = 3;      // テクスチャ1枚が何マス分か。物理サイズを固定するため
  const FLOOR_BASE = 0xb4b4b4;    // 石のモノトーン。明度はsetFloorToneで動かす

  const wallGeo = new THREE.BoxGeometry(0.98, WALL_H, 0.98);
  // 石畳のモノトーン。画像ファイルは使わず、水面と同じくcanvasで焼く。
  // 大きな色むら→細かい粒の順に重ねる。決定論rngなので毎回同じ絵になる。
  const stoneTexture = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#8f8f8f";
    g.fillRect(0, 0, 256, 256);
    const rng = makeRng(20260825);
    for (let i = 0; i < 130; i++) {
      const v = Math.round(118 + rng() * 62);
      g.fillStyle = `rgba(${v},${v},${v},0.32)`;
      g.beginPath();
      g.ellipse(rng() * 256, rng() * 256, 12 + rng() * 44, 10 + rng() * 36, rng() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 9000; i++) {
      const v = Math.round(88 + rng() * 92);
      g.fillStyle = `rgba(${v},${v},${v},0.2)`;
      g.fillRect(rng() * 256, rng() * 256, 1.4, 1.4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const stoneTex = stoneTexture();
  let floorTone = FLOOR_TONE;
  const floorMat = new THREE.MeshLambertMaterial({ map: stoneTex, color: FLOOR_BASE, vertexColors: true });
  const applyFloorTone = () => floorMat.color.setHex(FLOOR_BASE).multiplyScalar(floorTone);
  // マスごとに、テクスチャ座標を盤面位置から振った紙を1枚作る。
  // 材質は共有なので、continuityはUVだけで作る(tex.repeatでは出せない)。
  const paperGeo = new THREE.PlaneGeometry(1, 1);
  const paperAt = (x, y, wx, wz) => {
    const geo = paperGeo.clone();
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (x + uv.getX(i)) / FLOOR_TEX_TILES, (y + uv.getY(i)) / FLOOR_TEX_TILES);
    }
    // 距離での暗転を頂点カラーで載せる。材質を共有したままマスごと(さらに頂点ごと)に
    // 明るさを変えられるのがこの方法の利点。マス単位で塗ると段差が出るので頂点単位にする。
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count * 3).fill(1), 3));
    const m = new THREE.Mesh(geo, floorMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(wx, PAPER_Y, wz);
    // 頂点のワールド座標。rotation.x=-90度で局所(px,py,0)は世界(px,0,-py)へ写る。
    const pos = geo.attributes.position;
    const world = [];
    for (let i = 0; i < pos.count; i++) world.push([wx + pos.getX(i), wz - pos.getY(i)]);
    paperCells.push({ mesh: m, world });
    return m;
  };
  const wallMat = new THREE.MeshLambertMaterial({ color: COLOR.wall });
  const pillarMat = new THREE.MeshLambertMaterial({ color: COLOR.pillar });
  const rubbleMat = new THREE.MeshLambertMaterial({ color: COLOR.rubble });
  // 水面: canvasで焼いたノイズをタイル状に貼り、時間で少しずつスクロールして
  // さざ波っぽく見せる(本物の水面シェーダーではなく、あくまで簡易な近似)。
  // 画像ファイルは使わず、ダメージ数値や書き割りと同じくcanvasで手描きする
  const waterTexture = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#1c4d57";
    g.fillRect(0, 0, 64, 64);
    const rng = makeRng(777);
    for (let i = 0; i < 90; i++) {
      const x = rng() * 64, y = rng() * 64, r = 2 + rng() * 5;
      g.fillStyle = rng() > 0.5 ? "rgba(150,210,215,0.22)" : "rgba(10,30,35,0.22)";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.6, 1.6);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const waterTex = waterTexture();
  const waterMat = new THREE.MeshBasicMaterial({
    map: waterTex, color: 0x6fb0b8, transparent: true, opacity: 0.68,
    depthWrite: false, side: THREE.DoubleSide
  });

  // 水溜りの輪郭を、正円ではなく水たまりらしい不定形にする。角度ごとに半径を
  // 揺らした多角形を作るだけの素朴な方法。マス位置から作る決定論rngなので、
  // 同じ盤面なら毎回同じ形になる(演出用の形だけの話で、core.js側の当たり判定は
  // 常にマス単位のまま変わらない)
  const puddleShape = seed => {
    const rng = makeRng(seed);
    const points = 10;
    const shape = new THREE.Shape();
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const r = (TILE * 0.36) * (0.75 + rng() * 0.4);   // 0.36: 前回の0.3よりひと回り大きく、タイルの縁は越えない範囲
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    return shape;
  };

  // 障害物(柱・瓦礫)と水溜りは、それぞれの見え方だけをまとめてon/offできるよう
  // 専用のGroupへ入れる。非表示にしても当たり判定・移動コストはgrid側にそのまま
  // 残るので、盤面のルールには一切影響しない(あくまで見た目の検証用)
  // 床だけを暗くすると、奥の障害物と瓦礫が明るいまま残って浮く。
  // これらは個別のメッシュなので、材質をcloneして色を直接落とす。
  // 盤面あたり十数個なので材質が増えても問題にならない。
  const depthTint = mesh => {
    mesh.material = mesh.material.clone();
    depthTinted.push({ material: mesh.material, base: mesh.material.color.clone(), obj: mesh });
    return mesh;
  };

  const obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);
  const waterGroup = new THREE.Group();
  scene.add(waterGroup);
  const groundPatchGroup = new THREE.Group();
  scene.add(groundPatchGroup);

  const tiles = new Map();   // "x,y" → 床メッシュ(ハイライトで色を塗り替える)
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const [wx, wz] = worldOf(x, y);
      const cell = grid.cells[y * grid.w + x];

      if (!cell.walkable) {
        // void: 盤面の外形を削った結果できた「そもそも盤面の外」のマス。
        // 柱・地形の壁とは違い、何も置かない(完全な空白のまま)
        if (cell.void) continue;

        // 木柵はステージ固有の板で描く。通行不可という規則はセル側が持つ。
        if (cell.obstacle?.kind === "barrier") {
          groundPatchGroup.add(paperAt(x, y, wx, wz));
          continue;
        }

        const m = depthTint(new THREE.Mesh(wallGeo, cell.obstacle ? pillarMat : wallMat));
        m.position.set(wx, WALL_H / 2, wz);
        (cell.obstacle ? obstacleGroup : scene).add(m);

        groundPatchGroup.add(paperAt(x, y, wx, wz));
        continue;
      }

      scene.add(paperAt(x, y, wx, wz));
      // 覆い。opacity 0 で見えないが visible のままなので、当たり判定には常に効く
      // (visible=falseにするとraycastが素通りしてマスを拾えなくなる)。
      const m = new THREE.Mesh(paperGeo, new THREE.MeshBasicMaterial({
        color: COLOR.reach, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(wx, HIGHLIGHT_Y, wz);
      m.userData = { kind: "cell", x, y };
      scene.add(m);
      tiles.set(x + "," + y, m);

      // 乗り越えられる瓦礫。床の上に低い箱を置くだけで、進入は妨げない
      if (cell.obstacle) {
        const h = cell.obstacle.height;
        const r = depthTint(new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), rubbleMat));
        r.position.set(wx, h / 2, wz);
        obstacleGroup.add(r);
      }

      // 水溜り: 進入は妨げないが移動コストが2倍。床の色を直接塗ると
      // ハイライト(到達可能マス等)で上書きされて見分けられなくなるため、
      // 別の薄い板をわずかに浮かせて重ねる。形はマスごとに不定形(丸みのある水たまり風)
      if (cell.terrain?.type === "water") {
        const w = new THREE.Mesh(new THREE.ShapeGeometry(puddleShape(x * 7919 + y * 104729)), waterMat);
        w.rotation.x = -Math.PI / 2;
        w.position.set(wx, 0.012, wz);
        waterGroup.add(w);
      }
    }
  }

  /* --- グリッド線 --- */
  // 盤面にある(voidでない)マスの辺を集めて、1つのLineSegmentsにする。
  // 隣り合うマスが共有する辺は1本だけ引く(2本重ねると濃さが倍になる)。
  // LineBasicMaterialのlinewidthはほとんどの環境で無視され常に1pxになる。
  // ズームで太らせたくなったら、線ではなく細い板に置き換えること。
  const gridLineVerts = [];
  {
    const drawn = new Set();
    const edge = (ax, az, bx, bz) => {
      const key = [ax, az, bx, bz].map(n => n.toFixed(3)).join(",");
      const flipped = [bx, bz, ax, az].map(n => n.toFixed(3)).join(",");
      if (drawn.has(key) || drawn.has(flipped)) return;
      drawn.add(key);
      gridLineVerts.push(ax, GRID_LINE_Y, az, bx, GRID_LINE_Y, bz);
    };
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
      if (grid.cells[y * grid.w + x].void) continue;
      const [wx, wz] = worldOf(x, y);
      const x0 = wx - 0.5, x1 = wx + 0.5, z0 = wz - 0.5, z1 = wz + 0.5;
      edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
    }
  }
  // カメラが動いたら、正規化の範囲を測り直して全部を引き直す。
  const updateDepthDarkening = () => {
    isoCamera.getWorldPosition(camPos);
    let min = Infinity, max = -Infinity;
    for (const c of paperCells) for (const [wx, wz] of c.world) {
      const d = Math.hypot(camPos.x - wx, camPos.y, camPos.z - wz);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    if (!Number.isFinite(min)) return;
    depthNear = min;
    depthFar = Math.max(max, min + 0.001);
    for (const c of paperCells) {
      const attr = c.mesh.geometry.attributes.color;
      for (let i = 0; i < attr.count; i++) {
        const [wx, wz] = c.world[i];
        const f = depthFactorAt(wx, 0, wz);
        attr.setXYZ(i, f, f, f);
      }
      attr.needsUpdate = true;
    }
    for (const { material, base, obj } of depthTinted) {
      const p = obj.getWorldPosition(worldScratch);
      material.color.copy(base).multiplyScalar(depthFactorAt(p.x, p.y, p.z));
    }
    applyPlateLight();
  };
  const worldScratch = new THREE.Vector3();
  onCameraMoved = updateDepthDarkening;

  const gridLineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: GRID_LINE_OPACITY });
  const gridLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridLineVerts, 3)),
    gridLineMat);
  scene.add(gridLines);

  /* --- 駒の接地影 ---
     紙の床には厚みが無いので、駒がそのまま浮いて見える。足元に暗い楕円を1枚
     敷いて接地を作る。大きさはGLBを読み終えてから実測して合わせる(板の幅が
     キャラごとに違うため、身長からの推定では錆喰いのような横長の駒が合わない)。 */
  const shadowTexture = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.85)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.42)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const shadowTex = shadowTexture();
  let contactShadowOpacity = 0.55;
  // 影の広がり。板は薄いので、板の幅どおりに敷くと影が板の真下へ潰れて見えなくなる
  // (実測: 影あり/なしで違う画素が2001しかなかった)。板より広げて地面へはみ出させる。
  // 見下ろし角が浅いほど地面は縮んで見えるので、適正値は角度によって変わる。
  let contactShadowScale = 1.6;
  const CONTACT_SHADOW_DEPTH = 0.7;   // 幅に対する奥行きの比。1で真円
  const contactShadows = [];
  const sizeContactShadow = m => {
    const w = m.userData.plateWidth * contactShadowScale;
    m.scale.set(w, w * CONTACT_SHADOW_DEPTH, 1);
  };
  const makeContactShadow = () => {
    const m = new THREE.Mesh(paperGeo, new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, opacity: contactShadowOpacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.002, 0);
    m.userData.plateWidth = 0.55;   // 読込前の暫定。GLBを実測して上書きする
    sizeContactShadow(m);
    contactShadows.push(m);
    return m;
  };

  // ステージ固有の物は盤面規則と切り離して描く。重要物の座標はgrid.stageに残る。
  const propGroup = new THREE.Group();
  scene.add(propGroup);
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x6f4024 });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x655c54 });
  for (const prop of grid.stage?.props || []) {
    const [wx, wz] = worldOf(prop.x, prop.y);
    if (prop.kind === "barrier") {
      const fence = new THREE.Group();
      for (const offset of [-0.28, 0, 0.28]) {
        const plank = depthTint(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), woodMat));
        plank.position.set(offset, 0.45, 0);
        fence.add(plank);
      }
      for (const y of [0.28, 0.66]) {
        const rail = depthTint(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.12), woodMat));
        rail.position.set(0, y, 0);
        fence.add(rail);
      }
      fence.position.set(wx, 0, wz);
      fence.userData = { kind: "stage-prop", role: prop.role };
      propGroup.add(fence);
    }
    if (prop.kind === "collapse") {
      for (const [x, z, size] of [[-0.22, -0.12, 0.34], [0.16, -0.18, 0.26], [0.04, 0.2, 0.3]]) {
        const rock = depthTint(new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat));
        rock.position.set(wx + x, size * 0.55, wz + z);
        rock.rotation.set(x * 4, z * 5, x - z);
        rock.userData = { kind: "stage-prop", role: prop.role };
        propGroup.add(rock);
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
  /* アーチ型の入口の輪郭。下は床まで真っ直ぐ、上は半円。
     壁のくり抜きと、穴の中の闇で同じ形を使う(別々に書くとふちがずれる)。

     canvasは必ず「1マス=ARCH_PX_PER_TILE ピクセル」の等倍で作る。
     横だけマス数に比例させて縦を固定すると、半円が楕円に潰れて壁の高さを
     突き抜ける(2026-08-27に実測。幅3マスで頂点がcanvasの上端を超えていた)。 */
  const ARCH_PX_PER_TILE = 96;
  const ARCH_WIDTH_TILES = 1.4;    // 入口の幅。狭い枝では枝幅に収める
  const ARCH_HEIGHT_TILES = 2.0;   // 入口の高さ(1マス1.5m換算で3m)。人の約1.6倍
  const archPath = (g, w, h) => {
    const aw = Math.min(w * 0.72, ARCH_PX_PER_TILE * ARCH_WIDTH_TILES);
    const x0 = (w - aw) / 2, r = aw / 2;
    const shoulder = h - ARCH_PX_PER_TILE * ARCH_HEIGHT_TILES + r;   // 半円の中心(canvasは上が0)
    g.beginPath();
    g.moveTo(x0, h);
    g.lineTo(x0, shoulder);
    g.arc(x0 + r, shoulder, r, Math.PI, 0);
    g.lineTo(x0 + aw, h);
    g.closePath();
  };
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
  // on/offをまとめて切り替えられるようGroupに入れる(検証パネルからのトグル用)
  const backdropGroup = new THREE.Group();
  scene.add(backdropGroup);
  // グリッド外周の書き割り。[幅, 位置, Y回転] … PlaneGeometryの法線は+Z。Y回転で内側へ向ける。
  //
  // 三叉路のように盤外セル(void)を含む盤面では出さない。歩けるマスの縁は
  // 下の voidBoundaryWalls が全て描くので、外周まで出すと壁が2枚平行に並んで見える
  // (作者の指摘 2026-08-27。7x7の外周と、その内側のT字の縁が二重になっていた)。
  // グリッドいっぱいに床がある盤面では外周とマスの縁が一致するので、この分岐は効かない。
  if (!voidBoundaryWalls) [
    [grid.w, [0, BACKDROP_H / 2, -halfH], 0],              // 奥(-Z)側 → +Zを向く
    [grid.w, [0, BACKDROP_H / 2, halfH], Math.PI],         // 手前(+Z)側 → -Zを向く
    [grid.h, [-halfW, BACKDROP_H / 2, 0], Math.PI / 2],    // 左(-X)側 → +Xを向く
    [grid.h, [halfW, BACKDROP_H / 2, 0], -Math.PI / 2]     // 右(+X)側 → -Xを向く
  ].forEach(([width, pos, rotY]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, BACKDROP_H), backdropMat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    backdropGroup.add(m);
  });
  // 三叉路の内側は、既存の背景壁と同じ片面の書き割りで縁取る。盤外セルを
  // 壁マスに変えないため、移動・射線・障害物の規則には一切影響しない。
  let voidBoundaryWallCount = 0;
  const openings = [];   // 枝先の縁 {x, y, dx, dy}。dx/dyはグリッド外を向く方向
  if (voidBoundaryWalls) {
    const edgeWall = (x, y, dx, dy) => {
      const [wx, wz] = worldOf(x, y);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, BACKDROP_H), backdropMat);
      wall.position.set(wx + dx * 0.5, BACKDROP_H / 2, wz + dy * 0.5);
      // PlaneGeometryの法線は+Z。必ず床側を向け、カメラの反対側からは消える。
      wall.rotation.y = dy < 0 ? 0 : dy > 0 ? Math.PI : dx < 0 ? Math.PI / 2 : -Math.PI / 2;
      backdropGroup.add(wall);
      voidBoundaryWallCount += 1;
    };
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
      const cell = grid.cells[y * grid.w + x];
      // 判定は walkable ではなく「盤外(void)かどうか」で行う。
      // 高さ1.0の障害物が置かれたマスは core.scatterObstacles が walkable=false に
      // するため、walkable で弾くとそのマスの縁の壁と開口部がまるごと欠ける
      // (作者の指摘 2026-08-27。ブロックの後ろの壁がブロック幅ぶん抜けていた)。
      // 障害物が乗っていても盤面の一部なので、その外側には壁が必要。
      if (!cell || cell.void) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        // グリッド外の三つの枝先は出口として開けておく。ここで描くのは
        // グリッド内の盤外セルとの境目だけで、T字の凹角も自然に含まれる。
        // 枝先は openings に控えておき、下で「奥へ続いている」見せ方を載せる。
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) { openings.push({ x, y, dx, dy }); continue; }
        if (grid.cells[ny * grid.w + nx]?.void) edgeWall(x, y, dx, dy);
      }
    }
  }
  container.dataset.voidBoundaryWallCount = String(voidBoundaryWallCount);

  /* --- 枝先(通路が続く開口部)の見せ方 ---
     枝先は壁を立てず開けてある(通路が続く想定)。ただし開口部の先が背景色そのままだと、
     壁の作り忘れと区別がつかない(作者の指摘 2026-08-27)。
     そこで枝先も他と同じ書き割りで塞ぎ、そこにアーチ型の入口をくり抜いて、
     くり抜いた中だけを真っ暗にする。「壁が無い」ではなく「壁に入口が空いている」と読ませる。

     入口の造作(縁取りや石組みの枠)は付けない。他の壁と同じデザインに揃える(作者の指示)。
     壁のグラデーションは backdropTexture と同じ3点の数値を使う。

     2026-08-27に4案を並べて決めた。採用しなかった案と、なぜ落ちたか:
       暗い床を2マス置く … 奥へ続く感じは出たが、歩けない床が歩ける床に見える
       上が暗い書き割り  … 既存の壁と見分けがつかず、壁が増えたようにしか見えない
       縁の床を暗く落とす … 効果が弱く、開口部の先が背景色である事実が変わらない
       アーチに縁取りを足す … 造作が不要と判断された(引きでは読めたが実プレイ倍率では
                              上半分が枠外に出て、明るい縦線2本にしか見えなかった)

     移動・射線・障害物の規則には一切触らない、見た目だけの追加。 */
  // 壁側。既存の書き割りと同じグラデーションを塗ってから、アーチを抜くだけ。
  // 縁取りは付けない(作者の指示 2026-08-27。他の壁と同じデザインに揃える)。
  const archWallTexture = tiles => {
    const c = document.createElement("canvas");
    c.width = Math.round(ARCH_PX_PER_TILE * tiles);
    c.height = Math.round(ARCH_PX_PER_TILE * BACKDROP_H);
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "rgba(30,35,49,0.9)");     // backdropTextureと同じ3点
    grad.addColorStop(0.45, "rgba(15,18,26,0.5)");
    grad.addColorStop(1, "rgba(5,6,10,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "destination-out";
    archPath(g, c.width, c.height);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  /* 穴側。アーチの内側だけを塗る。壁の下端は透けているので、四角で塗ると
     下からはみ出る。形はアーチに合わせておく。

     天井側をいちばん暗く、床側をわずかに明るくする。通路の中に光源は無く、
     届くのは盤面側のカンテラの光だけなので、床は拾うが天井は何も受けない。
     床が奥へ続いている示唆にもなる。

     2026-08-27に4案を並べて決めた。落ちた案とその理由:
       均一な黒        … 輪郭はいちばん立つが、黒が強すぎて浮く
       壁と同じ向き     … 下端を透明にしたら輪郭が消え、「壁の抜け」に見え方が戻った。
                         壁は下端を抜いてよいが、抜きもの(穴・入口)は輪郭が情報なので残す
       奥へ放射で暗く   … 奥行きは出るが輪郭がいちばん柔らかく、壁との境界が曖昧になる */
  const archHoleTexture = tiles => {
    const c = document.createElement("canvas");
    c.width = Math.round(ARCH_PX_PER_TILE * tiles);
    c.height = Math.round(ARCH_PX_PER_TILE * BACKDROP_H);
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "rgba(0,1,3,0.99)");      // 天井: 何も光を受けない
    grad.addColorStop(0.55, "rgba(4,6,12,0.98)");
    grad.addColorStop(1, "rgba(17,22,34,0.95)");   // 床: 手前の光をわずかに拾う
    g.fillStyle = grad;
    archPath(g, c.width, c.height);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  if (openings.length) {
    // 枝ごとに連続した開口部を1枚の壁へまとめる。1マスずつ立てるとアーチが枝の数だけ並ぶ。
    const byDir = new Map();
    for (const o of openings) {
      const k = `${o.dx},${o.dy}`;
      if (!byDir.has(k)) byDir.set(k, []);
      byDir.get(k).push(o);
    }
    for (const [k, list] of byDir) {
      const [dx, dy] = k.split(",").map(Number);
      const along = dx !== 0 ? "y" : "x";       // 壁が伸びる向き
      list.sort((a, b) => a[along] - b[along]);
      const runs = [[list[0]]];
      for (let i = 1; i < list.length; i++) {
        const run = runs[runs.length - 1];
        if (list[i][along] === run[run.length - 1][along] + 1) run.push(list[i]);
        else runs.push([list[i]]);
      }
      for (const seg of runs) {
        const first = seg[0], last = seg[seg.length - 1];
        const tiles = seg.length;
        const [wx, wz] = worldOf((first.x + last.x) / 2, (first.y + last.y) / 2);
        const rotY = dy < 0 ? 0 : dy > 0 ? Math.PI : dx < 0 ? Math.PI / 2 : -Math.PI / 2;
        const geo = new THREE.PlaneGeometry(tiles, BACKDROP_H);
        const wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: archWallTexture(tiles), transparent: true, depthWrite: false, side: THREE.FrontSide }));
        wall.position.set(wx + dx * 0.5, BACKDROP_H / 2, wz + dy * 0.5);
        wall.rotation.y = rotY;
        // 「壁」のトグルで他の書き割りと一緒に切り替わるよう、同じGroupへ入れる。
        backdropGroup.add(wall);
        // 穴の中の闇。壁のわずかに奥へ置いて、アーチの内側だけが黒く見えるようにする。
        const hole = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
          map: archHoleTexture(tiles), transparent: true, depthWrite: false, side: THREE.FrontSide }));
        hole.position.set(wx + dx * 0.52, BACKDROP_H / 2, wz + dy * 0.52);
        hole.rotation.y = rotY;
        backdropGroup.add(hole);
      }
    }
  }
  container.dataset.openingCount = String(openings.length);
  container.dataset.backdropWallCount = String(backdropGroup.children.length);

  /* --- 空気感の粒子(ゆらゆら立ち上る塵・埃) ---
     地面から上へ、少量だけゆっくり上がっていく演出。数を少なめにして
     (会話が「戦闘グリッドの雰囲気作り」であって主役ではないため)、
     頂点まで達したら下へ戻して延々ループさせる。盤面のルールには一切関与しない */
  const dustTexture = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,244,220,0.32)");
    grad.addColorStop(1, "rgba(255,244,220,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  };
  // THREE.PointsMaterialは全粒子で同じsizeしか持てない(粒ごとに変えるには
  // カスタムシェーダーが要る)ため、粒ごとにサイズが違って見えるように
  // 個別のSpriteにした。数が少ない(22個)ので描画コストは気にしなくてよい
  const dustMat = new THREE.SpriteMaterial({
    map: dustTexture(), transparent: true, opacity: 0.28,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  // on/offをまとめて切り替えられるようGroupに入れる(検証パネルからのトグル用)
  const dustGroup = new THREE.Group();
  scene.add(dustGroup);

  const DUST_COUNT = 22;
  const DUST_TOP = 2.6;
  const dustState = Array.from({ length: DUST_COUNT }, () => {
    const sprite = new THREE.Sprite(dustMat);
    const size = 0.08 + Math.random() * 0.02;   // 0.08〜0.10。前回(0.16〜0.18)からさらに縮小
    sprite.scale.setScalar(size);
    dustGroup.add(sprite);
    return {
      sprite,
      x: (Math.random() - 0.5) * (grid.w - 1),
      z: (Math.random() - 0.5) * (grid.h - 1),
      y: Math.random() * DUST_TOP,
      speed: 0.05 + Math.random() * 0.07,   // 頂点まで約20〜52秒。前回(0.14〜0.36)より遅く
      // ゆらゆら感はX方向だけだと単調に見えたため、Z方向にも周期違いの
      // 揺れを重ねて円を描くように動かす。振幅・周期も以前よりはっきり効かせる
      swayAmpX: 0.14 + Math.random() * 0.16,
      swayFreqX: 0.5 + Math.random() * 0.5,
      swayAmpZ: 0.1 + Math.random() * 0.14,
      swayFreqZ: 0.35 + Math.random() * 0.4,
      swayPhase: Math.random() * Math.PI * 2
    };
  });

  function stepDust(dt) {
    for (const d of dustState) {
      d.y += d.speed * dt;
      if (d.y > DUST_TOP) d.y -= DUST_TOP;   // 頂点まで来たら地面へ戻し、また立ち上らせる
      const swayX = Math.sin(elapsed * d.swayFreqX + d.swayPhase) * d.swayAmpX;
      const swayZ = Math.cos(elapsed * d.swayFreqZ + d.swayPhase) * d.swayAmpZ;
      d.sprite.position.set(d.x + swayX, d.y, d.z + swayZ);
    }
  }

  /* --- 雨(屋外マップ向けの演出) ---
     塵と同じ「個別Spriteをまとめて表示/非表示」の作りを流用し、上から下へ
     速く落として地面で頂点(実際は底)に着いたら上へ戻す。既定は非表示
     (暗い地下的な盤面には合わないため、屋外マップで使う時だけonにする想定)。
     見た目だけの演出で、盤面のルールには一切関与しない */
  const rainTexture = () => {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 48;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 48);
    grad.addColorStop(0, "rgba(210,230,255,0)");
    grad.addColorStop(0.5, "rgba(210,230,255,0.55)");
    grad.addColorStop(1, "rgba(210,230,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 48);
    return new THREE.CanvasTexture(c);
  };
  const rainMat = new THREE.SpriteMaterial({
    map: rainTexture(), transparent: true, opacity: 0.55, depthWrite: false
  });
  const rainGroup = new THREE.Group();
  rainGroup.visible = false;   // 既定オフ。屋外マップでトグルする想定
  scene.add(rainGroup);

  const RAIN_COUNT = 90;
  const RAIN_TOP = 5.2;
  const rainSpan = Math.max(grid.w, grid.h) + 3;   // 盤面の外側からも降らせて途切れ感を無くす
  const rainState = Array.from({ length: RAIN_COUNT }, () => {
    const sprite = new THREE.Sprite(rainMat);
    sprite.scale.set(0.035 + Math.random() * 0.015, 0.3 + Math.random() * 0.14, 1);
    rainGroup.add(sprite);
    return {
      sprite,
      x: (Math.random() - 0.5) * rainSpan,
      z: (Math.random() - 0.5) * rainSpan,
      y: Math.random() * RAIN_TOP,
      speed: 1.6 + Math.random() * 1.2   // 屋外での見え方を確認しつつ落下速度を半分程度に落とした
    };
  });

  function stepRain(dt) {
    for (const d of rainState) {
      d.y -= d.speed * dt;
      if (d.y < 0) {
        d.y += RAIN_TOP;
        d.x = (Math.random() - 0.5) * rainSpan;
        d.z = (Math.random() - 0.5) * rainSpan;
      }
      d.sprite.position.set(d.x, d.y, d.z);
    }
  }

  /* --- ユニット(低ポリの仮フィギュア)と手番マーカー --- */
  const unitMeshes = new Map();  // id → メッシュ
  const unitGroup = new THREE.Group();
  const loadedModelPaths = new Set();
  let enemiesVisible = true;
  let occlusionTarget = null;
  scene.add(unitGroup);

  const markerGeo = new THREE.ConeGeometry(0.18, 0.4, 4);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: COLOR.active }));
  marker.rotation.x = Math.PI;      // 下向きの三角錐
  marker.visible = false;
  scene.add(marker);

  // Blenderモデルを置く前の比較用フィギュア。味方は人型、敵は甲殻獣型にし、
  // どちらも少数プリミティブと同じ単色材質だけで低ポリの輪郭を作る。
  const makeUnitObject = unit => {
    const g = new THREE.Group();
    const fallback = new THREE.Group();
    g.add(fallback);
    const h = unit.height ?? 2;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    // GLBのテンプレートは全ユニットで共有される。材質までcloneしないと、1人だけを
    // 透過したつもりで同じモデルの全員が透けるため、透過対象の材質は駒ごとに記録する。
    const opacityMaterials = [{ material: mat, transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite }];
    const part = (geometry, x, y, z, rotation = null) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      if (rotation) m.rotation.set(...rotation);
      m.userData = { kind: "unit", id: unit.id };
      fallback.add(m);
      return m;
    };
    const shadow = makeContactShadow();
    g.add(shadow);

    const addModel = (path, scale, y = 0) => {
      loadModel(path).then(template => {
        if (!g.parent) return;
        const model = template.clone(true);
        model.scale.set(...scale);
        model.position.y = y;
        model.rotation.y = unit.modelFacingOffset ?? 0;
        model.traverse(obj => {
          if (!obj.isMesh) return;
          const source = Array.isArray(obj.material) ? obj.material : [obj.material];
          const cloned = source.map(material => {
            let copy = material.clone();
            if (unit.modelId?.endsWith("-standee") && copy.map) {
              // 人物絵は印刷面として扱う。光源で直接照らすと、濃い衣装だけが白飛びする。
              // 表裏は別メッシュなので片面描画にし、PNGのアルファだけで型抜きする。
              // アクリル板の外形と縁はテクスチャに焼き込んであるので、板のうっすらした
              // アルファ(約0.12)が消えないよう、切り捨てのしきい値はそれより低くする。
              copy = new THREE.MeshBasicMaterial({ map: copy.map, alphaMap: copy.alphaMap, transparent: true, alphaTest: 0.04, side: THREE.FrontSide, depthWrite: true });
              plateMaterials.push({ material: copy, base: copy.color.clone(), owner: g });
            }
            // 個体差の色調(例: 守護者を同じモデルのまま黒っぽくする)。元の色に乗算するだけなので、
            // テクスチャの模様そのものは変えない。
            if (unit.tint !== undefined) {
              copy.color.multiply(new THREE.Color(unit.tint));
              const entry = plateMaterials.find(x => x.material === copy);
              if (entry) entry.base.copy(copy.color);   // 個体差の色調を基準色に含める
            }
            opacityMaterials.push({ material: copy, transparent: copy.transparent, opacity: copy.opacity, depthWrite: copy.depthWrite });
            return copy;
          });
          obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
          obj.userData = { kind: "unit", id: unit.id };
        });
        fallback.visible = false;
        g.add(model);
        // 印刷面は今作られたので、現在の明るさを反映する
        // (GLBは非同期に届くため、照明の切り替えより後になることがある)。
        applyPlateLight();
        // 接地影の大きさを実測して合わせる。板の幅はキャラごとに違うので、
        // 身長からの推定では錆喰いのような横長の駒に合わない。
        // 奥行きは板の厚みしかないため、幅の0.42倍に潰した楕円にする。
        const box = new THREE.Box3().setFromObject(model);
        shadow.userData.plateWidth = Math.max(0.25, box.max.x - box.min.x);
        sizeContactShadow(shadow);
        loadedModelPaths.add(path);
        container.dataset.loadedModels = [...loadedModelPaths].join(",");
        if (g.userData.occluded) setUnitOccluded(g, true);
      }).catch(error => {
        // 開発中だけモデル読込失敗を見えるようにし、代替フィギュアへ黙って落ちないようにする。
        if (import.meta.env?.DEV) console.error(`[battle] model load failed: ${path}`, error);
      });
    };

    if (unit.side === "party" || unit.side === "npc") {
      part(new THREE.ConeGeometry(0.28, h * 0.46, 4), 0, h * 0.37, 0, [0, Math.PI / 4, 0]);
      part(new THREE.DodecahedronGeometry(h * 0.14, 0), 0, h * 0.76, 0);
      for (const x of [-0.11, 0.11]) part(new THREE.BoxGeometry(0.11, h * 0.28, 0.12), x, h * 0.14, 0);
      // 味方はランタンを提げている。光源をGroupに入れてあるので移動に追従する。
      // decay=0(距離減衰なし)にしてあるのが肝。既定の逆二乗系のままだと、
      // 光源のすぐ隣にある持ち主の体だけが白飛びして陣営の色まで失われる。
      // 減衰を切ると範囲内が一様に照らされ、distanceの縁でなめらかに落ちるので、
      // 「ぼんやり明るい範囲」がそのまま出る
      const base = lanternIntensity;
      const light = new THREE.PointLight(lanternColor, base, lanternRange, 0);
      light.position.set(0, h * 0.9, 0);   // 頭のあたり。光源だけを置き、球体は出さない
      light.visible = lanternVisibleFor(unit.id);
      g.add(light);
      if (unit.side === "party") lanterns.push({ id: unit.id, light, base, phase: lanterns.length * 2.7 });
      // スタンディの版は standeeVersion.js が正本。ここに数字を書かない
      const modelVersion = unit.modelId?.endsWith("-standee") ? STANDEE_VERSION : "v02";
      addModel(`/models/${unit.modelId || unit.id}-${modelVersion}.glb`, [1, 1, 1]);
    } else {
      const shell = part(new THREE.DodecahedronGeometry(0.34, 0), 0, h * 0.44, 0);
      shell.scale.set(1.15, 0.7, 0.9);
      part(new THREE.DodecahedronGeometry(0.2, 0), 0, h * 0.4, 0.26);
      for (const [x, z] of [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.16], [0.22, 0.16]]) {
        part(new THREE.ConeGeometry(0.07, h * 0.36, 3), x, h * 0.18, z, [Math.PI, 0, 0]);
      }
      const modelId = unit.modelId || "rust-eater";
      // スタンディ(厚みのあるアクリル板)はGLBが実寸(メートル)で作られているので等倍。
      // 版は standeeVersion.js が正本なので、ここに数字を書かない。
      const model = modelId.endsWith("-standee")
        ? { path: `/models/${modelId}-${STANDEE_VERSION}.glb`, scale: [1, 1, 1], y: 0 }
        : modelId === "mine-bat"
          ? { path: "/models/mine-bat-v02.glb", scale: [0.62, 0.62, 0.62], y: 0.03 }
          : { path: "/models/rust-eater-v02.glb", scale: [0.8, 0.8, 0.8], y: 0 };
      addModel(model.path, model.scale, model.y);
    }

    g.userData = { kind: "unit", id: unit.id, side: unit.side, modelId: unit.modelId, mats: [mat], opacityMaterials, occluded: false };
    return g;
  };

  const meshFor = unit => {
    let g = unitMeshes.get(unit.id);
    if (g && g.userData.modelId !== unit.modelId) {
      unitGroup.remove(g);
      unitMeshes.delete(unit.id);
      g = null;
    }
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
    marker.visible = false;
    const unitFacings = {};
    const unitPositions = {};
    const modelFacingOffsets = {};
    // 駒が動くとカメラからの距離が変わるので、板の明るさを引き直す。
    applyPlateLight();
    // ハイライトは覆いの層が持つ。紙の材質は共有なので、マスごとには塗れない。
    for (const [, m] of tiles) m.material.opacity = 0;
    for (const h of highlights) {
      const t = tiles.get(h.x + "," + h.y);
      if (!t) continue;
      t.material.color.setHex(h.kind === "target" ? COLOR.target : COLOR.reach);
      t.material.opacity = HIGHLIGHT_OPACITY;
    }

    for (const u of units) {
      const g = meshFor(u);
      // 戦闘不能の駒は盤面から退く(その場にはコインが残る)
      if (u.hp <= 0) { g.visible = false; continue; }

      const [wx, wz] = worldOf(u.x, u.y);
      unitPositions[u.id] = { x: u.x, y: u.y };
      const h = u.height ?? 2;
      // 瓦礫のマスでは、その上に立つ(足元の高さぶん持ち上げる)。
      // 0固定にしていた頃は瓦礫の箱にめり込んで見えていた
      const e = elevationAt(grid, u.x, u.y);
      g.position.set(wx, e, wz);
      if (u.facing !== undefined) { g.rotation.y = u.facing; unitFacings[u.id] = u.facing; }
      if (u.modelFacingOffset !== undefined) modelFacingOffsets[u.id] = u.modelFacingOffset;
      // 攻撃できる相手は自身を光らせる。足元のマスを塗っても本体に隠れて見えないため
      const glow = targetIds.includes(u.id) ? COLOR.target : 0x000000;
      for (const mat of g.userData.mats) {
        mat.color.setHex(u.side === "party" ? COLOR.party : COLOR.enemy);
        mat.emissive.setHex(glow);
      }
      g.visible = u.side !== "enemy" || enemiesVisible;
      if (u.id === activeId && g.visible) {
        marker.visible = true;
        marker.position.set(wx, e + h + 0.5, wz);
      }
    }
    // stateから完全に消えた駒は、透過を戻してから取り除く。戦闘不能(hp=0)は
    // 同じstateに残るので、従来どおり非表示のまま扱う。
    const unitIds = new Set(units.map(u => u.id));
    for (const [id, g] of unitMeshes) {
      if (unitIds.has(id)) continue;
      setUnitOccluded(g, false);
      unitGroup.remove(g);
      unitMeshes.delete(id);
      const lanternIndex = lanterns.findIndex(l => l.id === id);
      if (lanternIndex >= 0) lanterns.splice(lanternIndex, 1);
    }
    if (!activeId) marker.visible = false;
    container.dataset.unitFacings = JSON.stringify(unitFacings);
    container.dataset.unitPositions = JSON.stringify(unitPositions);
    container.dataset.modelFacingOffsets = JSON.stringify(modelFacingOffsets);

    syncCoins(coins);
    // 通常のアイソメトリック表示では、現在選べる敵を対象として遮蔽を確認する。
    // 攻撃演出中はsetCombatCameraが確定対象を持っているため、ここで上書きしない。
    if (camera === isoCamera) setOcclusionTarget(targetIds[0] || null);
  }

  /* --- ヒット演出 --- */
  // 衝撃の輪・ダメージ数値・被弾者の発光・画面の揺れ。すべて一時的な見た目だけで、
  // 盤面の状態は一切変えない。演出中でもcore.jsが確定した結果は動かない
  const clock = new THREE.Clock();
  const effects = [];
  const ringGeo = new THREE.RingGeometry(0.18, 0.42, 24);
  let shake = 0;

  function damageSprite(text, color, fontSize = 44) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    const g = c.getContext("2d");
    g.font = `bold ${fontSize}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = fontSize * 0.16;
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

  // ダメージ値を浮かび上がらせる(ハズレは専用の小さめフォントサイズで呼ばれる)
  function floatDamage(wx, wz, text, color, elev = 0, fontSize = 44) {
    const num = damageSprite(text, color, fontSize);
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

  // ふわっと広がって消える丸い煙/光のパフ(パリィの閃光・ドッジの土煙で使う)。
  // dustと同じ「canvasに焼いた放射グラデーション」のスプライトだが、
  // 色は呼び出し側で変えられるようmaterial.colorで着色する
  const puffTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  function spawnPuff(wx, wz, color, dur, size, elev = 0) {
    const mat = new THREE.SpriteMaterial({
      map: puffTexture, color, transparent: true, depthWrite: false, depthTest: false
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size * 0.4);
    s.position.set(wx, elev + 0.5, wz);
    scene.add(s);
    effects.push({ kind: "puff", obj: s, t: 0, dur, size });
  }

  // 2点を結ぶ一瞬の閃光の線(カウンターの反撃・体当たりの押し出し方向を示す)。
  // 短命でジオメトリを使い回さないので、消える時にちゃんとdisposeする
  function spawnStreak(x1, z1, x2, z2, color, dur, elev = 0) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, elev + 0.7, z1),
      new THREE.Vector3(x2, elev + 0.7, z2)
    ]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, depthTest: false });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    effects.push({ kind: "streak", obj: line, t: 0, dur });
  }

  // tint: いなす(deflect)の時だけ、通常の赤橙ではなく涼しい水色にして
  // 「軽減された/受け流された」印象を出す(クリティカルの金色が最優先なのは変わらない)
  function playHit(x, y, { crit = false, damage = 0, unitId = null, tint = null } = {}) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);   // 瓦礫の上なら演出もその高さで出す
    const ringColor = crit ? 0xffd76a : (tint ?? 0xff8f6a);
    spawnRing(wx, wz, ringColor, crit ? 0.5 : 0.36, false, e);
    floatDamage(wx, wz, String(damage), crit ? "#ffd76a" : tint ? "#bdeef5" : "#ffffff", e);

    const g = unitId && unitMeshes.get(unitId);
    if (g) effects.push({ kind: "flash", mats: g.userData.mats, t: 0, dur: 0.28, color: crit ? 0xffd76a : 0xffffff });

    shake = crit ? 0.36 : 0.15;
  }

  function playMiss(x, y) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);
    spawnRing(wx, wz, 0x8b93a7, 0.3, true, e);
    floatDamage(wx, wz, "ハズレ", "#9aa3b5", e, 30);   // ダメージ数値と紛らわしくないよう、小さめの文字で出す
  }

  // パリィ成功: 素早く強い白光の輪+パフ+被弾者(受けた側)の一瞬の閃光。
  // 「金属がぶつかる」感を、既存のヒット演出より速く・鋭く出す
  function playParry(x, y, unitId) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);
    spawnRing(wx, wz, 0xf2f4ff, 0.2, false, e);
    spawnPuff(wx, wz, 0xffffff, 0.24, 0.9, e);
    const g = unitId && unitMeshes.get(unitId);
    if (g) effects.push({ kind: "flash", mats: g.userData.mats, t: 0, dur: 0.18, color: 0xffffff });
    shake = Math.max(shake, 0.1);
  }

  // ドッジ成功: 足元に土煙のパフだけを残す(移動先は次のsyncで反映されるので、
  // ここでは「元いた場所から素早く離れた」ことだけを示す)
  function playDodge(x, y) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);
    spawnPuff(wx, wz, 0xd6d9de, 0.32, 1.1, e);
  }

  // カウンター成功: 防御側→攻撃側へ向かう一瞬の閃光(反撃の軌跡)。
  // この直後に呼び出し側がplayHit/playMissで実際の反撃結果を重ねる
  function playCounter(fromX, fromY, toX, toY) {
    const [fx, fz] = worldOf(fromX, fromY);
    const [tx, tz] = worldOf(toX, toY);
    const e = elevationAt(grid, fromX, fromY);
    spawnStreak(fx, fz, tx, tz, 0xffd76a, 0.2, e);
  }

  // 体当たり成功(押し出し): 土色の大きめの衝撃波+押し出す方向への閃光
  function playShove(x, y, toX, toY) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);
    spawnRing(wx, wz, 0xc9a06a, 0.4, false, e);
    const [tx, tz] = worldOf(toX, toY);
    spawnStreak(wx, wz, tx, tz, 0xc9a06a, 0.25, e);
  }

  // 薙ぎ払い: 攻撃側自身の位置から広がる、通常より大きく涼しい色の輪(振り回した
  // 範囲を示す)。この後、各対象ごとの命中/外れの演出が個別に重なる
  function playSweep(x, y) {
    const [wx, wz] = worldOf(x, y);
    const e = elevationAt(grid, x, y);
    spawnRing(wx, wz, 0xbfe0ea, 0.45, false, e);
  }

  // 移動はstate同期で位置を確定する前に、出発点→到着点の軌跡と足元のパフを出す。
  // 盤面の結果を持たない描画層なので、経路・移動可否はcore.js側の確定値だけを受け取る。
  function playMove(fromX, fromY, toX, toY) {
    const [fx, fz] = worldOf(fromX, fromY), [tx, tz] = worldOf(toX, toY);
    spawnPuff(fx, fz, 0xd6d9de, 0.24, 0.8, elevationAt(grid, fromX, fromY));
    spawnStreak(fx, fz, tx, tz, 0xd6d9de, 0.32, elevationAt(grid, fromX, fromY));
    spawnPuff(tx, tz, 0xd6d9de, 0.3, 0.95, elevationAt(grid, toX, toY));
  }

  // 光る弾(魔法の飛翔体)。始点から終点へdur秒かけて弧を描いて移動し、
  // 着弾した瞬間にonImpactを呼ぶ(ダメージ演出・state更新は呼び出し側の責務)。
  // 暗闇での戦闘を想定しているため、弾自体が周囲を照らす光源を持つ
  // (ランタンと同じdecay=0の一様減衰。持ち主の体だけが白飛びするのを避ける)。
  function spawnProjectile(fx, fz, tx, tz, color, dur, elev, onImpact) {
    const mat = new THREE.SpriteMaterial({
      map: puffTexture, color, transparent: true, depthWrite: false, depthTest: false
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.55);
    const y = elev + 0.9;
    s.position.set(fx, y, fz);
    scene.add(s);
    const light = new THREE.PointLight(color, 6.5, 6, 0);
    light.position.copy(s.position);
    scene.add(light);
    effects.push({ kind: "projectile", obj: s, light, t: 0, dur, from: { x: fx, z: fz }, to: { x: tx, z: tz }, y, onImpact });
  }

  // 着弾の爆発。通常のヒット輪(spawnRing単体)より大きく、輪+2色のパフを重ねて破裂感を出す。
  function spawnBurst(wx, wz, color, elev = 0) {
    spawnRing(wx, wz, color, 0.5, false, elev);
    spawnPuff(wx, wz, color, 0.4, 1.7, elev);
    spawnPuff(wx, wz, 0xffe0a8, 0.3, 1.0, elev);
  }

  // リディアの遠隔攻撃(ファイアボール)用。炎の弾が発射点から着弾点へ飛び、着弾で爆発する。
  // onImpactは弾が着弾した瞬間に呼ばれ、呼び出し側はそこでダメージ演出とstate更新を行う。
  const FIREBALL_COLOR = 0xff6a2a;
  function playRanged(fromX, fromY, toX, toY, { onImpact } = {}) {
    const [fx, fz] = worldOf(fromX, fromY), [tx, tz] = worldOf(toX, toY);
    const fromElev = elevationAt(grid, fromX, fromY), toElev = elevationAt(grid, toX, toY);
    const dist = Math.hypot(tx - fx, tz - fz);
    const dur = Math.min(0.6, Math.max(0.28, dist * 0.09));   // 距離に応じて飛行時間を伸ばす
    spawnProjectile(fx, fz, tx, tz, FIREBALL_COLOR, dur, fromElev, () => {
      spawnBurst(tx, tz, FIREBALL_COLOR, toElev);
      onImpact?.();
    });
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
      } else if (e.kind === "puff") {
        // ふわっと広がりながら消える(ringより緩やかに大きくする)
        const s = e.size * (0.4 + k * 0.5);
        e.obj.scale.set(s, s, 1);
        e.obj.material.opacity = 1 - k;
      } else if (e.kind === "streak") {
        e.obj.material.opacity = 1 - k;   // 拡大はせず、ただ薄れて消える
      } else if (e.kind === "projectile") {
        // 弧を描かせる(発射と着弾で低く、中間で高くなる)。飛び方に生っぽさを出すためだけの装飾。
        e.obj.position.x = e.from.x + (e.to.x - e.from.x) * k;
        e.obj.position.z = e.from.z + (e.to.z - e.from.z) * k;
        e.obj.position.y = e.y + Math.sin(k * Math.PI) * 0.35;
        e.light.position.copy(e.obj.position);
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
        e.obj.material.dispose();
        if (e.kind === "streak") e.obj.geometry.dispose();   // streakだけジオメトリを使い回さない
        if (e.kind === "projectile") { scene.remove(e.light); e.onImpact?.(); }   // 弾が消えた後に着弾演出(spawnBurst)を発火する
      }
      effects.splice(i, 1);
    }
  }

  /* --- 入力(クリックでマス/ユニットを拾う) --- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const floorPoint = new THREE.Vector3();
  let pickHandler = null, preferCells = false;

  function setUnitOccluded(g, on) {
    if (!g || g.userData.occluded === on) return;
    for (const entry of g.userData.opacityMaterials || []) {
      const { material, transparent, opacity, depthWrite } = entry;
      material.transparent = on ? true : transparent;
      material.opacity = on ? OCCLUDER_OPACITY : opacity;
      material.depthWrite = on ? false : depthWrite;
      material.needsUpdate = true;
    }
    g.userData.occluded = on;
  }

  function clearOcclusion() {
    for (const g of unitMeshes.values()) setUnitOccluded(g, false);
    occlusionTarget = null;
    container.dataset.occlusionTarget = "";
    container.dataset.occludingUnits = "";
    container.dataset.occlusionOpacity = "";
  }

  // カメラ→敵の見通しにある味方だけを透過する。マス座標ではなく表示中の
  // 駒のboundsを使うため、斜めカメラや実モデルの大きさにも従う。
  function refreshOcclusion() {
    if (!occlusionTarget) return;
    const targetUnit = unitMeshes.get(occlusionTarget.id);
    if (!targetUnit?.visible) { clearOcclusion(); return; }

    targetUnit.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(targetUnit);
    const targetPoint = box.isEmpty() ? targetUnit.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
    const cameraPoint = camera.getWorldPosition(new THREE.Vector3());
    const direction = targetPoint.clone().sub(cameraPoint);
    const targetDistance = direction.length();
    if (!targetDistance) { clearOcclusion(); return; }
    raycaster.set(cameraPoint, direction.normalize());
    raycaster.far = Math.max(0, targetDistance - 0.04);

    const occluders = [];
    for (const [id, g] of unitMeshes) {
      const shouldTest = g.visible && g.userData.side === "party" && id !== occlusionTarget.ignoreId && id !== occlusionTarget.id;
      if (!shouldTest) { setUnitOccluded(g, false); continue; }
      g.updateWorldMatrix(true, false);
      // GLBの細い部位の隙間を通るとRaycasterの三角形単位では「見えている」判定に
      // なってしまう。画面上で駒が敵を隠すかを扱うため、表示中の駒全体のboundsで
      // 判定する。boundsの手前交点が敵より近い時だけ透過する。
      const bounds = new THREE.Box3().setFromObject(g);
      const intersection = bounds.isEmpty() ? null : raycaster.ray.intersectBox(bounds, new THREE.Vector3());
      const blocked = !!intersection && intersection.distanceTo(cameraPoint) < targetDistance - 0.04;
      setUnitOccluded(g, blocked);
      if (blocked) occluders.push(id);
    }
    container.dataset.occludingUnits = occluders.join(" ");
    container.dataset.occlusionOpacity = occluders.length ? String(OCCLUDER_OPACITY) : "";
  }

  function setOcclusionTarget(target = null, ignoreId = null) {
    const id = typeof target === "string" ? target : target?.id;
    if (!id) { clearOcclusion(); return; }
    occlusionTarget = { id, ignoreId };
    container.dataset.occlusionTarget = id;
    refreshOcclusion();
  }

  // 指を離した時に呼ぶ。押した瞬間に拾うと、スワイプやピンチのたびにマスを選んでしまう。
  const doPick = e => {
    if (!pickHandler) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    // ユニットを床より優先して拾う(敵の足元をクリックしても攻撃対象として扱えるように)。
    // ユニットはGroup(円錐+球など)なので再帰的に当てる
    const hits = raycaster.intersectObjects([...unitGroup.children, ...propGroup.children, ...tiles.values()], true);
    const unitHit = hits.find(h => h.object.userData.kind === "unit");
    const cellHit = hits.find(h => h.object.userData.kind === "cell");
    let hit = preferCells ? (cellHit || unitHit || hits[0]) : (unitHit || hits[0]);
    let data = hit?.object.userData.kind ? hit.object.userData : hit?.object.parent?.userData || {};
    // 駒や演出で床メッシュに当たらない場合でも、移動中だけは床平面からマスを復元する。
    // 攻撃時は従来どおりユニットを優先する。
    if (preferCells && !cellHit && raycaster.ray.intersectPlane(floorPlane, floorPoint)) {
      const x = Math.round(floorPoint.x + offX), y = Math.round(floorPoint.z + offZ);
      if (tiles.has(x + "," + y)) { data = { kind: "cell", x, y }; hit = true; }
    }
    if (hit) pickHandler(data);
  };

  /* --- レンダラーとループ --- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";

  /* --- 指の操作 ---
     スマホ縦持ちではマウスが無いので、カメラの5つのパラメータを全て指で動かせるようにする。
       1本指ドラッグ  → 見ている場所を平行移動(上下左右)
       2本指ピンチ    → ズーム
       2本指の横移動  → 向き(方位角)
       2本指の縦移動  → 高さ(見下ろし角)
       ダブルタップ    → 既定へ戻す(呼び出し側が決める)
     マスのタップは「指が TAP_SLOP px 以上動かなかった時」だけ成立させる。
     押した瞬間に拾っていると、スワイプのたびに移動先を選んでしまう。 */
  const TAP_SLOP = 10;        // これ以下の移動はタップ扱い(px)
  const DOUBLE_TAP_MS = 400;  // 2回目のタップをダブルタップとみなす間隔(iOSの標準に寄せた)
  const ORBIT_GAIN = 0.4;     // 横1pxあたり何度回すか
  const ELEVATION_GAIN = 0.25;// 縦1pxあたり何度起こすか
  const pointers = new Map();
  /* 指の本数は touch イベントの e.touches.length を正本にする。
     pointerup / pointercancel は取りこぼすことがある(iOS Safariでシステムジェスチャに
     取られた時など)。取り残しがあると pointers.size が2のままになり、1本指で
     スワイプしただけでズームと向きと高さが動く。
     2026-08-27に実測した: 片方のtouchEndを送らずに1本だけ動かすと
     zoom 2.5→1.03 / 向き 107→125度 / 高さ 20→26.25度 になった。 */
  let touchCount = 0;
  let dragMoved = 0, lastTapAt = 0, lastTapX = 0, lastTapY = 0;
  let pinchStartDist = 0, pinchStartZoom = 1, twoStartX = 0, twoStartY = 0, twoStartAzim = 0, twoStartElev = 0;
  let doubleTapHandler = null, cameraChangeHandler = null;

  const centerOf = () => {
    let x = 0, y = 0;
    for (const p of pointers.values()) { x += p.x; y += p.y; }
    return { x: x / pointers.size, y: y / pointers.size };
  };
  const distOf = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  // 画面のドラッグ量を、カメラの向きに合わせて盤面上の移動へ変換する。
  // 指で盤面をつかんで動かす向き(指を右へ→盤面が右へ)にする。
  const panBy = (dxPx, dyPx) => {
    const h = container.clientHeight || 1;
    const perPx = viewSize / h;                 // 正射影なので1pxは常に同じワールド距離
    const cos = Math.cos(camAngle), sin = Math.sin(camAngle);
    // 画面右方向の水平ベクトルは (sin, -cos)。画面上方向は視線の逆 (cos, sin)。
    // 見下ろし角が浅いほど奥行き方向は画面上で潰れるので、その分だけ縦の移動量を伸ばす。
    const depthScale = 1 / Math.max(0.25, Math.sin(cameraElevation));
    const dx = -dxPx * perPx, dy = -dyPx * perPx * depthScale;
    target.x += sin * dx + cos * dy;
    target.z += -cos * dx + sin * dy;
    placeCamera();
  };
  const notifyCamera = () => cameraChangeHandler?.({
    azimuthDeg: ((camAngle * 180 / Math.PI) % 360 + 360) % 360,
    elevationDeg: cameraElevation * 180 / Math.PI,
    zoom: cameraZoom,
  });
  const applyZoom = z => {
    cameraZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    baseViewSize = gridViewSize / cameraZoom;
    viewSize = baseViewSize;
    applyFrustum();
    placeCamera();
  };

  const beginTwoFinger = () => {
    pinchStartDist = distOf(); pinchStartZoom = cameraZoom;
    const c = centerOf(); twoStartX = c.x; twoStartY = c.y;
    twoStartAzim = camAngle * 180 / Math.PI;
    twoStartElev = cameraElevation * 180 / Math.PI;
  };
  const onPointerDown = e => {
    renderer.domElement.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { dragMoved = 0; return; }
    if (pointers.size === 2) beginTwoFinger();
  };
  const onPointerMove = e => {
    const prev = pointers.get(e.pointerId);
    // 取り残しを刈った直後はMapに無い。ここで登録し直して次のmoveから追う。
    if (!prev) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved += Math.hypot(dx, dy);
    // touchCountが0ならマウス操作。その時だけMapのサイズを本数として使う。
    const fingers = touchCount || pointers.size;
    if (fingers === 1) { if (dragMoved > TAP_SLOP) panBy(dx, dy); return; }
    // 本数と手元のMapが食い違っている間は何もしない(取り残しがある状態)。
    if (fingers !== 2 || pointers.size !== 2) return;
    // ピンチ(距離)→ズーム、重心の横→向き、重心の縦→高さ。3つを同時に効かせる。
    //
    // 2026-08-27に「最初に大きく動いた成分ひとつに決め打ちする」案を試して撤回した。
    // 実機ではチャタリングした(指が2本→1本→2本と揺れるたびに軸を取り直すため、
    // 意図した軸に入らない)。3つ同時のままでも作者の実機確認では違和感が無かった。
    //
    // どれも「開始時の値からの差」で決める。1フレームごとの差分を足し込むと、
    // 指を元の位置へ戻しても値が戻らない。
    const c = centerOf();
    if (pinchStartDist > 0) applyZoom(pinchStartZoom * (distOf() / pinchStartDist));
    const deg = ((twoStartAzim + (c.x - twoStartX) * ORBIT_GAIN) % 360 + 360) % 360;
    camAngle = deg * Math.PI / 180;
    dirIndex = (camAngle - Math.PI / 4) / (Math.PI / 2);
    cameraElevation = Math.max(10, Math.min(80, twoStartElev + (c.y - twoStartY) * ELEVATION_GAIN)) * Math.PI / 180;
    applyFogRange();
    placeCamera();
    notifyCamera();
  };
  const onPointerUp = e => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    try { renderer.domElement.releasePointerCapture?.(e.pointerId); } catch { /* 既に解放済み */ }
    if (pointers.size === 2) beginTwoFinger();   // 3本目が離れた時は残り2本で取り直す
    if (!wasSingle) { if (pointers.size === 0) notifyCamera(); return; }
    if (dragMoved > TAP_SLOP) { notifyCamera(); return; }
    // e.timeStampは環境によって基準がまちまちなので、自前の時計で測る。
    const now = performance.now();
    const near = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40;
    if (doubleTapHandler && near && now - lastTapAt < DOUBLE_TAP_MS) { lastTapAt = 0; doubleTapHandler({ clientX: e.clientX, clientY: e.clientY }); return; }
    lastTapAt = now; lastTapX = e.clientX; lastTapY = e.clientY;
    doPick(e);
  };
  // 指が離れた通知を取りこぼすと、次のタップで「2本指」と誤認してマス選択が効かなくなる。
  // pointercancelとlostpointercaptureも同じように消す。
  const forgetPointer = e => {
    pointers.delete(e.pointerId);
    try { renderer.domElement.releasePointerCapture?.(e.pointerId); } catch { /* 既に解放済み */ }
  };
  // 指の本数を追う。全部離れた時点で、取りこぼした分も含めてMapを空にする。
  const onTouchChange = e => {
    touchCount = e.touches.length;
    if (touchCount === 0) pointers.clear();
    // ここで beginTwoFinger を呼んではいけない。touchmove ごとに開始値が
    // 更新され、2本指の「開始時からの差」が毎フレームの差分に化ける。
    // 開始値の取得は pointerdown 側の1回だけにする。
    // 指の本数を画面へ出す。実機で「1本指のつもりが2本触れている」かを見分けるため。
    container.dataset.fingers = String(touchCount);
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", forgetPointer);
  renderer.domElement.addEventListener("lostpointercapture", forgetPointer);
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    renderer.domElement.addEventListener(type, onTouchChange, { passive: true });
  }

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h); // 第3引数を省略しCSS寸法も更新する。falseだとDPR2以上でcanvasが2倍にはみ出す
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
      // 消えているカンテラは揺らがせない。Three.jsは非表示の光を照明計算から
      // 除外するので見た目は同じだが、「消灯中は環境光だけ」を意図として明示する。
      if (!l.light.visible) continue;
      // 係数を上げるほど速くなる。6ではせわしなかったので落としてある
      l.light.intensity = l.base * flicker(elapsed * 3.2 + l.phase);
    }

    stepEffects(dt);
    stepDust(dt);
    if (rainGroup.visible) stepRain(dt);
    marker.rotation.y += 0.02;
    for (const [, m] of coinMeshes) m.rotation.y += 1.1 * dt;   // 拾えるものだと分かるよう回す
    // 水面のテクスチャをゆっくり流す(全水溜りが同じテクスチャを共有しているので、
    // 1箇所ずらすだけで全部にさざ波が付く)。ごく低速: 速いと安っぽいスクロールに見える
    waterTex.offset.x = (waterTex.offset.x + dt * 0.05) % 1;
    waterTex.offset.y = (waterTex.offset.y + dt * 0.032) % 1;
    refreshOcclusion();
    renderer.render(scene, camera);
  };
  loop();

  return {
    sync,
    playHit,
    playMiss,
    playParry,
    playDodge,
    playCounter,
    playShove,
    playSweep,
    playMove,
    playRanged,
    rotate(delta) { dirIndex += delta; },
    // 戦闘専用。投影方式は盤面と同じ正射影のまま、攻撃者と対象へ寄る。
    // 盤面と攻撃演出で透視投影を混在させると、駒の大きさ・紙の質感が急に変わるため。
    setCombatCamera(attacker, subject) {
      if (!attacker || !subject) return;
      camera = isoCamera;
      container.dataset.cameraProjection = "orthographic";
      const [ax, az] = worldOf(attacker.x, attacker.y);
      const [sx, sz] = worldOf(subject.x, subject.y);
      target.set((ax + sx) / 2, 0, (az + sz) / 2);
      viewSize = Math.max(3.8, baseViewSize * 0.72);
      applyFrustum();
      placeCamera();
      setOcclusionTarget(subject, attacker.id);
    },
    setCameraFocus(unit = null, subject = null) {
      if (unit) {
        clearOcclusion();
        camera = isoCamera;
        container.dataset.cameraProjection = "orthographic";
        const [x, z] = worldOf(unit.x, unit.y);
        const [subjectX, subjectZ] = subject ? worldOf(subject.x, subject.y) : [x, z];
        target.set((x + subjectX) / 2, 0, (z + subjectZ) / 2);
        viewSize = Math.max(3.8, baseViewSize * 0.72);
        applyFrustum();
        placeCamera();
        return;
      }
      clearOcclusion();
      camera = isoCamera;
      container.dataset.cameraProjection = "orthographic";
      viewSize = baseViewSize;
      target.set(0, 0, 0);
      applyFrustum();
      placeCamera();
    },
    setPickHandler(fn, { preferCells: nextPreferCells = false } = {}) { pickHandler = fn; preferCells = nextPreferCells; },
    // 指の操作の通知先。onDoubleTapは「既定へ戻す」、onCameraChangeは
    // 指で動かしたカメラの値をUI(スライダー)へ返すためのもの。
    setGestureHandlers({ onDoubleTap = null, onCameraChange = null } = {}) {
      doubleTapHandler = onDoubleTap; cameraChangeHandler = onCameraChange;
    },
    // 検証パネル用のトグル・フェーダー。強さ0〜1: 0=ほぼ無効(farを遠くへ逃がす)、
    // 1=現状のチューニング値(near=CAMERA_DIST-1 / far=CAMERA_DIST+10)
    setFogEnabled(on) { scene.fog = on ? fogObj : null; },
    // fogの見え方は「far」に対して線形ではない。Three.jsのfogは
    // (far-距離)/(far-near) で不透明度が決まるため、farをただ等間隔にずらすと
    // 盤面奥(距離D)での実際の霞み具合(density = (D-near)/(far-near))は
    // 強さが高い側(farがnearに近い側)でのみ急に動き、低い側ではほとんど動かない
    // (実際に「50%以下はほぼ反映されない/50%以上は粗い」という指摘どおりの現象)。
    // そこで「盤面奥での霞み具合(density)」そのものをスライダーに対して線形にし、
    // そこから逆算してfarを求める(far = near + (D-near)/density)
    setFogIntensity(t) {
      const density = FOG_MIN_DENSITY + t * (FOG_MAX_DENSITY - FOG_MIN_DENSITY);
      fogObj.far = FOG_NEAR + (FOG_REF_DIST - FOG_NEAR) / density;
    },
    // --- 紙の盤面の見た目つまみ(検証パネル用)。盤面の規則には影響しない ---
    setGridLinesEnabled(on) { gridLines.visible = on; },
    setGridLineColor(hex) { gridLineMat.color.set(hex); },
    setGridLineOpacity(t) { gridLineMat.opacity = Math.max(0, Math.min(1, t)); },
    // 床の明度。石のモノトーンの基準色に掛けるだけなので、色味は変わらない。
    setFloorTone(t) { floorTone = Math.max(0, Math.min(2, t)); applyFloorTone(); },
    // テクスチャを外すと、無地のグレーの石になる(テクスチャ差し替え前の状態)。
    setFloorTextureEnabled(on) { floorMat.map = on ? stoneTex : null; floorMat.needsUpdate = true; },
    setContactShadowOpacity(t) {
      contactShadowOpacity = Math.max(0, Math.min(1, t));
      for (const m of contactShadows) m.material.opacity = contactShadowOpacity;
    },
    // 影の広がり。板の幅に対する倍率。1.0で板と同じ幅、大きいほど地面へはみ出す。
    setContactShadowScale(t) {
      contactShadowScale = Math.max(0.5, Math.min(4, t));
      for (const m of contactShadows) sizeContactShadow(m);
    },
    // 奥ほど暗くする強さ。0で無効、1で最奥が真っ黒。床・障害物・駒の板に同じ曲線で効く。
    setDepthDarkening(t) { depthStrength = Math.max(0, Math.min(1, t)); updateDepthDarkening(); },
    // 調整用。カンテラが部屋の明るさに足す量。大きいほど消灯時に板が暗くなる。
    setPlateLightWeight(w) { LANTERN_LIGHT_WEIGHT = Math.max(0, w); applyPlateLight(); },
    setDustEnabled(on) { dustGroup.visible = on; },
    setRainEnabled(on) { rainGroup.visible = on; },
    setWallsEnabled(on) { backdropGroup.visible = on; },
    // 見た目を確認しながらカメラの見下ろし角を調整するための検証用API。
    // 正本はbattleConfig.jsのpresentation.cameraElevationDeg。ここでは反映するだけ。
    setCameraElevationDeg(deg) { cameraElevation = deg * Math.PI / 180; applyFogRange(); placeCamera(); },
    // ズーム倍率をその場で反映する。1より大きいほど盤面へ近づく。
    setCameraZoom(zoom) {
      cameraZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(zoom) || 1));
      baseViewSize = gridViewSize / cameraZoom;
      viewSize = baseViewSize;
      applyFrustum();
      placeCamera();
    },
    // 水平方向の向きをスライダーでリニアに操作するためのAPI。「視点を回す」(rotate)と
    // 同じdirIndex/camAngleを共有するが、なめらかな追従は挟まず即座に反映する
    // (ドラッグ操作の追従遅れを避けるため。挙動はcameraElevationDegと合わせてある)。
    // 注視点を1マスへ寄せる。縦画面ではズームを上げると、盤面の中心を見ているだけでは
    // 端の駒が枠外へ出る(iPhone 16縦・ズーム2.5で味方2人が画面外だった)。
    // 攻撃演出の setCameraFocus と違い、ズーム(viewSize)には触らない。
    // 手番が回るたびに寄り引きが変わると盤面の読み方が毎回変わってしまうため。
    // 引数なしで呼ぶと盤面の中心へ戻る。yは足元ではなく駒の胸のあたりを見る高さ。
    // ダブルタップした画面上の点を、カメラの注視点にする(作者の指示 2026-08-27)。
    // その点が画面の中心へ来る。床の平面と交わらなかった時は何もしない。
    // 注視点の高さ(target.y)は今の値を保つ。ズームと見下ろし角にも触らない。
    lookAtScreenPoint(clientX, clientY) {
      if (camera !== isoCamera) return false;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, isoCamera);
      if (!raycaster.ray.intersectPlane(floorPlane, floorPoint)) return false;
      target.set(floorPoint.x, target.y, floorPoint.z);
      placeCamera();
      return true;
    },
    setCameraCenter(x, y) {
      // 高さは 0(床) に合わせる。setCameraFocus も target.set(..., 0, ...) なので、
      // ここだけ 0.5 にすると経路によって注視点の高さが変わる。さらに
      // lookAtScreenPoint は床面(y=0)との交点を使うので、0.5 のままだと
      // ダブルタップした床の点が画面中央に正確に来ない(Codexのレビュー指摘 2026-08-27)。
      if (x === undefined || x === null) target.set(0, 0, 0);
      else { const [wx, wz] = worldOf(x, y); target.set(wx, 0, wz); }
      placeCamera();
    },
    setCameraAzimuthDeg(deg) {
      const rad = deg * Math.PI / 180;
      dirIndex = (rad - Math.PI / 4) / (Math.PI / 2);
      camAngle = rad;
      placeCamera();
    },
    setObstaclesEnabled(on) { obstacleGroup.visible = on; },
    setWaterEnabled(on) { waterGroup.visible = on; },
    setHolesEnabled(on) { groundPatchGroup.visible = !on; },
    setEnemiesVisible(on) {
      enemiesVisible = on;
      for (const g of unitMeshes.values()) {
        if (g.userData.side === "enemy") g.visible = on;
      }
      if (!on) marker.visible = false;
    },
    // 光源は各ユニットのGroupの子なのでGroup化できない。lanterns配列のlightに
    // 直接visibleを立てる(Three.jsはvisible=falseの光を照明計算から除外する)
    // ユニットごとに個別で点灯/消灯する(ガレスだけ消す、リディアの手番でリディアの
    // ランタンだけ消す、といった使い方のため)。まだそのユニットの光源が生成されて
    // いない(手番が回ってきていない)場合でも、Mapに覚えておいて生成時に反映する
    setLanternEnabled(id, on) {
      lanternOverrides.set(id, on);
      const entry = lanterns.find(l => l.id === id);
      if (entry) entry.light.visible = lanternVisibleFor(id);
      applyPlateLight();
    },
    setLightPreset(name) {
      const p = LIGHT_PRESET[name] || LIGHT_PRESET.night;
      ambientLight.intensity = p.ambient;
      key.intensity = p.key;
      key.color.setHex(p.keyColor);
      applyLanternPreset(p.lantern);   // この中でapplyPlateLightも走る
    },
    // ランタンの色。橙が濃いほど石が橙に染まる。石をグレーに見せる調整用。
    setLanternColor(hex) { lanternColor = hex; for (const l of lanterns) l.light.color.set(hex); },
    setLanternIntensity(t) {
      lanternIntensity = Math.max(0, t);
      for (const l of lanterns) l.base = lanternIntensity;
      applyPlateLight();
    },
    // 届く範囲。小さくすると「持ち主のまわりだけ明るい」局所照明になる。
    setLanternRange(r) {
      lanternRange = Math.max(0.5, r);
      for (const l of lanterns) l.light.distance = lanternRange;
      applyPlateLight();
    },
    // 背景とfogの色は別々に持つ(白い霧など、背景とは違う色にしたい場合があるため)。
    // 呼び出す側(BattleView)で、既定値は揃えて渡している
    setBackgroundColor(hex) { scene.background.set(hex); },
    setFogColor(hex) { fogObj.color.set(hex); },
    dispose() {
      clearOcclusion();
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", forgetPointer);
      renderer.domElement.removeEventListener("lostpointercapture", forgetPointer);
      for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
        renderer.domElement.removeEventListener(type, onTouchChange);
      }
      renderer.dispose();
      // materialだけでなく、そこに貼ったテクスチャも捨てる。開口部のアーチは
      // 戦闘のマウントごとに CanvasTexture を作る(出口3つで壁と穴の6枚)ので、
      // mapを残すと戦闘の出入りのたびにGPUテクスチャが積む(Codexのレビュー指摘 2026-08-27)。
      // disposeは冪等なので、共有materialが traverse で何度出てきても問題ない。
      const disposeMaterial = m => {
        for (const slot of ["map", "alphaMap", "normalMap", "emissiveMap", "aoMap", "roughnessMap", "metalnessMap"]) {
          m[slot]?.dispose();
        }
        m.dispose();
      };
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
      });
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };
}
