import { generateWithRetry } from "./mapgen.js";
import { lit, run, start } from "./expedition.js";
import { corridorShapes, roomShapes } from "./draw.js";

const mapElement = document.querySelector("#map");
const placeElement = document.querySelector("#place");
const chapterElement = document.querySelector("#chapter");
const controlsElement = document.querySelector("#controls");
const labels = { north: ["↑", "北"], east: ["→", "東"], south: ["↓", "南"], west: ["←", "西"] };
const directions = ["north", "east", "south", "west"];
const VIEW = {
  width: 26,
  tilt: 24,
  perspective: 2600,
};
/* 倒し込み(rotateX)の補正はここでは掛けない。ドラッグ量の基準に使う矩形は
   #map の getBoundingClientRect() で、これは倒し込み前の素の大きさである(cameraSize も
   同じ矩形を使う)。以前は svg の矩形(倒し込み後。実測で素の0.924倍)を基準にした上に
   1/cos(24°)=1.095 を掛けており、縦に100px引くと111.3px分動いていた(実測)。
   横も svg の矩形では4.7%不足していた。基準を1つに揃えれば縦横とも合う(2026-08-20) */
const STEP_INTERVAL = 220;
let map;
let state;
let revision;
let camera = { follows: true, x: 0, y: 0 };
let walking;
let ignoreClickUntil = 0;
// 光源の位置の揺らぎ。常時のアニメーションではなく、移動した瞬間だけ新しい値に飛ばす
// (作者の指摘: 「位置の変化は常時は不要、移動した時だけ」)。SVGのtransform属性に直接
// 書くので、CSS transformで踏んだ「ユーザー単位≠画面px」の混同も起きない。
const SWAY_RANGE = 0.35;
const SWAY_HOLD = 180; // この時間だけずらして見せたら、静止時は必ず中心へ戻す
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let lightSway = { x: 0, y: 0 };
let swayTimer;
const randomSway = () => ({
  x: (Math.random() - 0.5) * SWAY_RANGE * 2,
  y: (Math.random() - 0.5) * SWAY_RANGE * 2,
});

const keyOf = (cell) => `${cell.x},${cell.y}`;
const roomIsSeen = (room) => {
  for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) {
    if (state.seen.has(`${x},${y}`)) return true;
  }
  return false;
};

/* 部屋のうち「見えたマス」だけを切り出すための矩形。
   部屋は1つの角丸矩形として描く（draw.js の方針。マス単位で描くと斜めの角に隙間が残る）。
   そのままだと、通路から灯りが対岸の部屋の角を1マス舐めた瞬間に間取りが丸ごと出ていた
   （実測: 300 seed × 未訪問6部屋 = 1800件すべてで、丸ごと描き始めた時点の既視マスは
   ちょうど1マス。部屋の平均5.0%しか見ていない）。通路は keepCell でマス単位に切って
   いるのに部屋だけ切っていない非対称だった。
   描く図形は1つのまま、clip-path で見えた範囲に限る。切り抜きの矩形はマスぴったりで
   隣と辺を共有するので、マス単位で描いた時のような隙間は出ない（2026-08-20） */
const roomClipCells = (room, has) => {
  const out = [];
  for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) {
    if (has(`${x},${y}`)) out.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
  return out.join("");
};
const centerOnPlayer = () => ({ x: state.pos.x + 0.5, y: state.pos.y + 0.5 });

/* 拡大は固定しない。探索済みが入りきる分だけ引き、VIEW.width を上限にする。
   固定にしていたら、開始時は1部屋しか無いのに26マス分を映し、地図領域の
   1.8%しか絵が無い画面になっていた（実測。作者の指摘「一部屋しかありませんぜ」）。
   26マスは3部屋歩いた状態のチューナーで決めた値で、開始時には合っていなかった。 */
const MIN_VIEW = 11;
const cameraSize = () => {
  const rect = mapElement.getBoundingClientRect();
  const aspect = (rect.width || 1) / (rect.height || 1);
  const player = centerOnPlayer();
  let width = MIN_VIEW;
  for (const key of state.seen) {
    const [x, y] = key.split(",").map(Number);
    width = Math.max(width,
      (Math.abs(x + .5 - player.x) + 1.5) * 2,
      (Math.abs(y + .5 - player.y) + 1.5) * 2 * aspect);
    if (width >= VIEW.width) break;
  }
  width = Math.min(width, VIEW.width);
  return { width, height: width / aspect };
};

/* 見回してもプレイヤーを画面の外へ出さない。出てしまうと、どこに居るか分からないまま
   地図だけが動くことになり、「戻す」を押すまで現在地を見失う。
   縦は倒し込みで詰まる(cos24°で約9%)ぶん、横より余白を厚く取る。 */
const EDGE = { x: .08, y: .14 };
const clampToPlayer = (next) => {
  const size = cameraSize();
  const player = centerOnPlayer();
  const limitX = size.width * (.5 - EDGE.x);
  const limitY = size.height * (.5 - EDGE.y);
  const hold = (value, center, limit) => Math.min(Math.max(value, center - limit), center + limit);
  return { follows: false, x: hold(next.x, player.x, limitX), y: hold(next.y, player.y, limitY) };
};

// 厚みは地形なので記憶にも残し、照り返しの色だけを灯りの有無で分ける。
function carved(id, center, lamp, warm) {
  const dx = center.x - lamp.x, dy = center.y - lamp.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (dx / len) * .5, oy = (dy / len) * .5;
  const rim = warm ? { color: "#F0C078", opacity: .75 } : { color: "#8894A3", opacity: .5 };
  return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="3" seed="11" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="0.30" xChannelSelector="R" yChannelSelector="G" result="rock"/>
    <feOffset in="rock" dx="${ox.toFixed(3)}" dy="${oy.toFixed(3)}" result="away"/>
    <feGaussianBlur in="away" stdDeviation=".16" result="awayBlur"/>
    <feComposite in="rock" in2="awayBlur" operator="out" result="nearWall"/>
    <feFlood flood-color="#04070A" flood-opacity=".95" result="darkInk"/>
    <feComposite in="darkInk" in2="nearWall" operator="in" result="shadow"/>
    <feOffset in="rock" dx="${(-ox).toFixed(3)}" dy="${(-oy).toFixed(3)}" result="toward"/>
    <feGaussianBlur in="toward" stdDeviation=".11" result="towardBlur"/>
    <feComposite in="rock" in2="towardBlur" operator="out" result="farWall"/>
    <feFlood flood-color="${rim.color}" flood-opacity="${rim.opacity}" result="lightInk"/>
    <feComposite in="lightInk" in2="farWall" operator="in" result="rimShape"/>
    <feMerge><feMergeNode in="rock"/><feMergeNode in="rimShape"/><feMergeNode in="shadow"/></feMerge>
  </filter>`;
}

function render() {
  const visible = lit(state, map);
  const room = map.rooms.get(state.at);
  // ずらしたままでも、歩いた結果プレイヤーが画面の外へ出ることは許さない。
  // 判定はここ1か所に置く。ドラッグ側にも置くと、歩いて外れる経路が抜ける。
  camera = camera.follows ? { follows: true, ...centerOnPlayer() } : clampToPlayer(camera);
  const seenCell = (cell) => state.seen.has(keyOf(cell));
  const visibleCell = (cell) => visible.has(keyOf(cell));
  const lamp = { x: state.pos.x + 0.5 + lightSway.x, y: state.pos.y + 0.5 + lightSway.y };
  const pieces = [
    ...[...map.rooms.values()].filter(roomIsSeen).map((item) => ({
      center: { x: item.x + item.w / 2, y: item.y + item.h / 2 },
      memory: roomShapes(map.rooms, (candidate) => candidate.id === item.id),
      light: roomShapes(map.rooms, (candidate) => candidate.id === item.id),
      // 部屋は見えたマスの範囲だけに限る。通路は corridorShapes が既にマス単位で切るので clips は持たない
      clips: {
        memory: roomClipCells(item, (key) => state.seen.has(key)),
        light: roomClipCells(item, (key) => visible.has(key)),
      },
    })),
    ...map.corridors.filter((corridor) => corridor.path.some(seenCell)).map((corridor) => {
      const middle = corridor.path[Math.floor(corridor.path.length / 2)];
      return {
        center: { x: middle.x + .5, y: middle.y + .5 },
        memory: corridorShapes(map.corridors, map.rooms, (candidate) => candidate === corridor, seenCell),
        light: corridorShapes(map.corridors, map.rooms, (candidate) => candidate === corridor, visibleCell),
      };
    }),
  ];
  const size = cameraSize();
  const left = camera.x - size.width / 2;
  const top = camera.y - size.height / 2;
  // 灯りの広がりは【いま映している範囲】に対する比で決める。VIEW.width(上限)に対する
  // 比で固定すると、寄った時に画面全体が光で飛ぶ（実測: 11マスに寄ると床が白く潰れた）。
  const glowRadius = size.width / 2.6;
  const filters = pieces.map((piece, index) => carved(`m${index}`, piece.center, lamp, false)
    + carved(`l${index}`, piece.center, lamp, true)).join("");
  /* 中身が空の clipPath は「何も描かない」を意味する。部屋は clips を必ず持つので、
     1マスも見えていない部屋は灯り層に出ない(空文字を「切り抜き無し」と扱ってはならない) */
  const clips = pieces.map((piece, index) => (piece.clips
    ? `<clipPath id="cm${index}" clipPathUnits="userSpaceOnUse">${piece.clips.memory}</clipPath>`
      + `<clipPath id="cl${index}" clipPathUnits="userSpaceOnUse">${piece.clips.light}</clipPath>`
    : "")).join("");
  const layer = (kind, className) => pieces.map((piece, index) => {
    const clip = piece.clips ? ` clip-path="url(#${kind === "light" ? "cl" : "cm"}${index})"` : "";
    return `<g class="floor ${className}" filter="url(#${kind === "light" ? "l" : "m"}${index})"${clip}>${piece[kind]}</g>`;
  }).join("");
  const anchors = [...map.rooms.values()].filter((item) => state.visited.has(item.id))
    .map((item) => `<circle class="anchor" data-name="${item.name}" cx="${item.x + item.w / 2}" cy="${item.y - .35}" r=".02" fill="none"/>`).join("");
  mapElement.innerHTML = `<button type="button" id="reset-view">戻す</button><div id="floor"><svg viewBox="${left} ${top} ${size.width} ${size.height}" data-room-count="${map.rooms.size}" data-corridor-count="${map.corridors.length}" data-cell-count="${map.cells.size}" data-floor-count="${pieces.length}" aria-label="探索地図" role="img">
    <defs>${filters}${clips}
      <radialGradient id="torch" gradientUnits="userSpaceOnUse" cx="${lamp.x}" cy="${lamp.y}" r="${glowRadius * .86}"><stop stop-color="white" stop-opacity=".96"/><stop offset=".55" stop-color="white" stop-opacity=".38"/><stop offset="1" stop-color="black" stop-opacity="0"/></radialGradient>
      <mask id="torch-mask" maskUnits="userSpaceOnUse" x="${left}" y="${top}" width="${size.width}" height="${size.height}"><rect class="torch-mask" x="${left}" y="${top}" width="${size.width}" height="${size.height}" fill="url(#torch)"/></mask>
      <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${lamp.x}" cy="${lamp.y}" r="${glowRadius}">
        <stop stop-color="var(--flame)" stop-opacity=".42"/><stop offset=".5" stop-color="var(--flame)" stop-opacity=".14"/><stop offset="1" stop-color="var(--flame)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${layer("memory", "floor-memory")}
    <g mask="url(#torch-mask)">${layer("light", "floor-light")}</g>
    ${anchors}
    <circle class="lamp-glow" cx="${lamp.x}" cy="${lamp.y}" r="${glowRadius}" fill="url(#glow)"/>
    <circle class="player" cx="${state.pos.x + 0.5}" cy="${state.pos.y + 0.5}" r=".18"/>
  </svg></div><div id="labels"></div>`;
  const stage = mapElement.getBoundingClientRect();
  const labelLayer = mapElement.querySelector("#labels");
  for (const anchor of mapElement.querySelectorAll(".anchor")) {
    const box = anchor.getBoundingClientRect();
    if (!box.width && !box.height) continue;
    const x = box.left + box.width / 2 - stage.left;
    const y = box.top + box.height / 2 - stage.top;
    if (x < -80 || x > stage.width + 80 || y < -40 || y > stage.height + 40) continue;
    const element = document.createElement("div");
    element.className = "label";
    element.textContent = anchor.dataset.name;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    labelLayer.append(element);
  }
  placeElement.textContent = room?.name || "通路";
  chapterElement.textContent = `${revision} / seed ${mapSeed}`;
  controlsElement.innerHTML = directions.map((dir) => {
    const [arrow, name] = labels[dir];
    return `<button type="button" data-dir="${dir}">${arrow}<span>${name}</span></button>`;
  }).join("");
}

function walk(dir) {
  if (run(state, map, dir)) {
    if (!reducedMotion) {
      lightSway = randomSway();
      clearTimeout(swayTimer);
      // 静止したら必ず中心へ戻す。resetしないと、最後に引いた値のまま
      // プレイヤーからずれた位置に灯りが固定され続ける(作者の指摘の原因)。
      swayTimer = setTimeout(() => { lightSway = { x: 0, y: 0 }; render(); }, SWAY_HOLD);
    }
    render();
  }
}

controlsElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-dir]");
  if (button && Date.now() >= ignoreClickUntil) walk(button.dataset.dir);
});

controlsElement.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button[data-dir]");
  if (!button || walking) return;
  event.preventDefault();
  controlsElement.setPointerCapture(event.pointerId);
  walk(button.dataset.dir);
  walking = setInterval(() => walk(button.dataset.dir), STEP_INTERVAL);
});

function stopWalking(event) {
  if (!walking) return;
  clearInterval(walking);
  walking = null;
  ignoreClickUntil = Date.now() + 300;
  if (event && controlsElement.hasPointerCapture(event.pointerId)) controlsElement.releasePointerCapture(event.pointerId);
}

controlsElement.addEventListener("pointerup", stopWalking);
controlsElement.addEventListener("pointercancel", stopWalking);

let dragPointer = null;
mapElement.addEventListener("pointerdown", (event) => {
  if (event.target.closest("#reset-view")) return;
  /* 基準点(dragX/dragY/viewX/viewY)は1組しか持てない。pointerIdで区別せずに
     上書きしていたため、2本目の指を置いた後に1本目を動かすと視点が飛ぶ作りだった。
     最初の指だけを受け付ける(ピンチ操作は未実装なので、増えた指は無視でよい) */
  if (dragPointer !== null) return;
  dragPointer = event.pointerId;
  const svg = mapElement.querySelector("svg");
  if (!svg) return;
  // 基準は #map の素の大きさ。cameraSize() と同じ矩形を使う(svgは倒し込み後の投影サイズ)
  const rect = mapElement.getBoundingClientRect();
  mapElement.setPointerCapture(event.pointerId);
  mapElement.dataset.dragX = event.clientX;
  mapElement.dataset.dragY = event.clientY;
  mapElement.dataset.viewX = camera.x;
  mapElement.dataset.viewY = camera.y;
  mapElement.dataset.viewWidth = rect.width;
  mapElement.dataset.viewHeight = rect.height;
});

mapElement.addEventListener("pointermove", (event) => {
  if (!mapElement.hasPointerCapture(event.pointerId)) return;
  const width = Number(mapElement.dataset.viewWidth);
  const height = Number(mapElement.dataset.viewHeight);
  const size = cameraSize();
  camera = {
    follows: false,
    x: Number(mapElement.dataset.viewX) - (event.clientX - Number(mapElement.dataset.dragX)) * size.width / width,
    y: Number(mapElement.dataset.viewY) - (event.clientY - Number(mapElement.dataset.dragY)) * size.height / height,
  };
  render();
});

const endDrag = (event) => {
  if (mapElement.hasPointerCapture(event.pointerId)) mapElement.releasePointerCapture(event.pointerId);
  if (dragPointer === event.pointerId) dragPointer = null;
};
mapElement.addEventListener("pointerup", endDrag);
mapElement.addEventListener("pointercancel", endDrag);

mapElement.addEventListener("click", (event) => {
  if (!event.target.closest("#reset-view")) return;
  camera = { follows: true, ...centerOnPlayer() };
  render();
});

const chapter = await fetch("./data/lanternhill_ch1.json", { cache: "no-store" }).then((response) => response.json());
/* seedを画面に出す。生成は完全に決定的(1000 seedを昇順・降順で作ってSHA1一致)なので、
   seedが分かれば「この地図が変」という報告をそのまま再現できる。出ていなかったため、
   作者が見た地図を手元で開く手段が無かった(2026-08-20) */
let mapSeed;
({ map, seed: mapSeed } = generateWithRetry(chapter, 1));
state = start(map);
revision = chapter.revision;
mapElement.style.setProperty("--tilt", `${VIEW.tilt}deg`);
mapElement.style.setProperty("--depth", `${VIEW.perspective}px`);
/* 画面の大きさが変わったら描き直す。viewBoxもラベルの座標もrender()の中で
   #mapの実寸から決めているので、呼ばれなければ両方が古い値のまま残る。
   実測(390x844→900x400): viewBoxが更新されず地図が使える幅の約23%に縮み、
   部屋名が X-135.7px / Y+197.5px ずれていた。方向ボタンを1回押すと直る
   =render()が呼ばれれば直る、という症状だった。スマホの回転でも同じ。
   visualViewportはソフトキーボードやピンチでも動くので、両方を見る(2026-08-20) */
addEventListener("resize", render);
visualViewport?.addEventListener("resize", render);
render();
