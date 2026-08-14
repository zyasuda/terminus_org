import { generateWithRetry } from "./mapgen.js";
import { lit, start, step } from "./expedition.js";
import { corridorShapes, roomShapes, roughFilter } from "./draw.js";

const mapElement = document.querySelector("#map");
const placeElement = document.querySelector("#place");
const chapterElement = document.querySelector("#chapter");
const controlsElement = document.querySelector("#controls");
const labels = { north: ["↑", "北"], east: ["→", "東"], south: ["↓", "南"], west: ["←", "西"] };
const directions = ["north", "east", "south", "west"];
const VIEW_WIDTH = 18;
const STEP_INTERVAL = 220;
let map;
let state;
let revision;
let camera = { follows: true, x: 0, y: 0 };
let walking;
let ignoreClickUntil = 0;

const keyOf = (cell) => `${cell.x},${cell.y}`;
const roomIsSeen = (room) => {
  for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) {
    if (state.seen.has(`${x},${y}`)) return true;
  }
  return false;
};
const cameraSize = () => {
  const rect = mapElement.getBoundingClientRect();
  const height = VIEW_WIDTH * (rect.height || 1) / (rect.width || 1);
  return { width: VIEW_WIDTH, height };
};
const centerOnPlayer = () => ({ x: state.pos.x + 0.5, y: state.pos.y + 0.5 });

function render() {
  const visible = lit(state, map);
  const room = map.rooms.get(state.at);
  if (camera.follows) camera = { follows: true, ...centerOnPlayer() };
  const seenCell = (cell) => state.seen.has(keyOf(cell));
  const visibleCell = (cell) => visible.has(keyOf(cell));
  const shapes = (keepCell) => roomShapes(map.rooms, roomIsSeen)
    + corridorShapes(map.corridors, map.rooms, () => true, keepCell);
  const remembered = shapes(seenCell);
  const illuminated = shapes(visibleCell);
  const names = [...map.rooms.values()].flatMap((item) => state.visited.has(item.id)
    // 名前は部屋の【上】に出す。中央に置くと現在地の点と重なる（実画面で確認）
    ? [`<text class="room-name" x="${item.x + item.w / 2}" y="${item.y - 0.45}" text-anchor="middle">${item.name}</text>`] : []);
  const size = cameraSize();
  const left = camera.x - size.width / 2;
  const top = camera.y - size.height / 2;
  const floorCount = [...map.rooms.values()].filter(roomIsSeen).length + map.corridors.filter((corridor) => corridor.path.some(seenCell)).length;
  mapElement.innerHTML = `<button type="button" id="reset-view">戻す</button><svg viewBox="${left} ${top} ${size.width} ${size.height}" data-room-count="${map.rooms.size}" data-corridor-count="${map.corridors.length}" data-cell-count="${map.cells.size}" data-floor-count="${floorCount}" aria-label="探索地図" role="img">
    <defs>${roughFilter()}
      <radialGradient id="torch" gradientUnits="userSpaceOnUse" cx="${camera.x}" cy="${camera.y}" r="${VIEW_WIDTH / 3}"><stop stop-color="white" stop-opacity=".96"/><stop offset=".55" stop-color="white" stop-opacity=".38"/><stop offset="1" stop-color="black" stop-opacity="0"/></radialGradient>
      <mask id="torch-mask" maskUnits="userSpaceOnUse" x="${left}" y="${top}" width="${size.width}" height="${size.height}"><rect class="torch-mask" x="${left}" y="${top}" width="${size.width}" height="${size.height}" fill="url(#torch)"/></mask>
      <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${state.pos.x + 0.5}" cy="${state.pos.y + 0.5}" r="${VIEW_WIDTH / 2.6}">
        <stop stop-color="var(--flame)" stop-opacity=".42"/><stop offset=".5" stop-color="var(--flame)" stop-opacity=".14"/><stop offset="1" stop-color="var(--flame)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <g class="floor floor-memory" filter="url(#rough)">${remembered}</g>
    <g class="floor floor-light" filter="url(#rough)" mask="url(#torch-mask)">${illuminated}</g>${names.join("")}
    <circle class="lamp-glow" cx="${state.pos.x + 0.5}" cy="${state.pos.y + 0.5}" r="${VIEW_WIDTH / 2.6}" fill="url(#glow)"/>
    <circle class="player" cx="${state.pos.x + 0.5}" cy="${state.pos.y + 0.5}" r=".18"/>
  </svg>`;
  placeElement.textContent = room?.name || "通路";
  chapterElement.textContent = revision;
  controlsElement.innerHTML = directions.map((dir) => {
    const [arrow, name] = labels[dir];
    return `<button type="button" data-dir="${dir}">${arrow}<span>${name}</span></button>`;
  }).join("");
}

function walk(dir) {
  if (step(state, map, dir)) render();
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

mapElement.addEventListener("pointerdown", (event) => {
  if (event.target.closest("#reset-view")) return;
  const svg = mapElement.querySelector("svg");
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
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

mapElement.addEventListener("pointerup", (event) => {
  if (mapElement.hasPointerCapture(event.pointerId)) mapElement.releasePointerCapture(event.pointerId);
});

mapElement.addEventListener("click", (event) => {
  if (!event.target.closest("#reset-view")) return;
  camera = { follows: true, ...centerOnPlayer() };
  render();
});

const chapter = await fetch("./data/lanternhill_ch1.json", { cache: "no-store" }).then((response) => response.json());
({ map } = generateWithRetry(chapter, 1));
state = start(map);
revision = chapter.revision;
render();
