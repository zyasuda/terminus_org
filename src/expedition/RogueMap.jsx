import React, { useMemo } from "react";
import { corridorShapes, roomShapes } from "./draw.js";
import { mapForFloor } from "./core.js";
import { lit } from "./mapwalk.js";
import "./rogueMap.css";

const keyOf = cell => `${cell.x},${cell.y}`;
const markerFor = (floor, room) => {
  if (room.id === "entrance") return "△";
  const event = floor.events.find(item => item.roomId === room.id && !item.done);
  if (room.kind === "junction") return event ? "T!" : "T";
  if (event) return event.kind === "guardian" ? "♛" : "!";
  if (floor.chest.roomId === room.id && !floor.chest.opened) return "□";
  return "";
};

export default function RogueMap({ floor, onMove }) {
  const map = useMemo(() => mapForFloor(floor), [floor.seed, floor.corridorSeed]);
  const state = useMemo(() => ({ pos: floor.pos, at: floor.at, visited: new Set(floor.visited), walked: new Set(floor.walked), seen: new Set(floor.seen) }), [floor]);
  const visible = useMemo(() => lit(state, map), [state, map]);
  const seenCell = cell => state.seen.has(keyOf(cell));
  const visibleCell = cell => visible.has(keyOf(cell));
  const roomSeen = room => {
    for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) if (state.seen.has(`${x},${y}`)) return true;
    return false;
  };
  // 部屋は記憶側と灯り側で同じ形を描く。明暗の差はtorchマスクが付けるので、二度組み立てない。
  // 通路だけは踏破の記憶(seen)と現在の視界(visible)で描く範囲が変わる。
  const rooms = roomShapes(map.rooms, roomSeen);
  const memoryCorridors = corridorShapes(map.corridors, map.rooms, corridor => corridor.path.some(seenCell), seenCell);
  const lightCorridors = corridorShapes(map.corridors, map.rooms, corridor => corridor.path.some(visibleCell), visibleCell);
  // 未探索の全体を縮小表示せず、既知の範囲だけを追う。現在地を見失わない地図にする。
  const known = [...state.seen].map(key => key.split(",").map(Number));
  const minX = Math.min(floor.pos.x - 4, ...known.map(([x]) => x));
  const maxX = Math.max(floor.pos.x + 4, ...known.map(([x]) => x));
  const minY = Math.min(floor.pos.y - 3, ...known.map(([, y]) => y));
  const maxY = Math.max(floor.pos.y + 3, ...known.map(([, y]) => y));
  const pad = 2, left = minX - pad, top = minY - pad;
  const width = Math.max(11, maxX - minX + 1 + pad * 2), height = Math.max(8, maxY - minY + 1 + pad * 2);
  const currentRoom = map.rooms.get(floor.at);
  const lamp = { x: floor.pos.x + .5, y: floor.pos.y + .5 };
  return <section className="rogue-map-shell" aria-label="探索地図">
    <header className="rogue-map-rail"><b>{currentRoom?.name || "通路"}</b><span>灯りの届く範囲</span></header>
    <div className="rogue-map">
      <svg viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-label="探索地図">
        <defs>
          <radialGradient id="expedition-torch" gradientUnits="userSpaceOnUse" cx={lamp.x} cy={lamp.y} r="5"><stop stopColor="white" stopOpacity=".95"/><stop offset=".55" stopColor="white" stopOpacity=".35"/><stop offset="1" stopColor="black" stopOpacity="0"/></radialGradient>
          <mask id="expedition-torch-mask" maskUnits="userSpaceOnUse" x={left} y={top} width={width} height={height}><rect x={left} y={top} width={width} height={height} fill="url(#expedition-torch)"/></mask>
          <radialGradient id="expedition-glow" gradientUnits="userSpaceOnUse" cx={lamp.x} cy={lamp.y} r="5"><stop stopColor="#e4b064" stopOpacity=".38"/><stop offset="1" stopColor="#e4b064" stopOpacity="0"/></radialGradient>
        </defs>
        <g className="rogue-floor rogue-memory" dangerouslySetInnerHTML={{ __html: rooms + memoryCorridors }}/>
        <g mask="url(#expedition-torch-mask)" className="rogue-floor rogue-light" dangerouslySetInnerHTML={{ __html: rooms + lightCorridors }}/>
        {Array.from(map.rooms.values()).filter(room => state.visited.has(room.id)).map(room => <g key={room.id} className="rogue-marker" transform={`translate(${room.x + room.w / 2} ${room.y + room.h / 2})`}><text y=".12">{markerFor(floor, room)}</text><text className="rogue-room-name" y="-.7">{room.name}</text></g>)}
        <circle className="rogue-lamp-glow" cx={lamp.x} cy={lamp.y} r="5" fill="url(#expedition-glow)"/>
        <circle className="rogue-player" cx={lamp.x} cy={lamp.y} r=".19"/>
      </svg>
    </div>
    <nav className="rogue-controls" aria-label="移動"><button onClick={() => onMove("north")}>↑<span>北</span></button><button onClick={() => onMove("west")}>←<span>西</span></button><button onClick={() => onMove("south")}>↓<span>南</span></button><button onClick={() => onMove("east")}>→<span>東</span></button></nav>
  </section>;
}
