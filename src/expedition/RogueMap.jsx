import React, { useEffect, useMemo, useRef, useState } from "react";
import Compass, { ANGLE } from "./Compass.jsx";
import { corridorShapes, roomShapes } from "./draw.js";
import { mapForFloor } from "./core.js";
import { hallWallCells } from "./interior.js";
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
  // 「進行方向を必ず上」モード(2026-09-01、作者の指示。実機で見比べた上で既定に採用)。
  // 地図全体を向いている方角の逆へ回し、代わりに部屋名・記号・コンパスのNだけ
  // 逆回転させて読める向きに戻す。
  const [headingUp, setHeadingUp] = useState(true);
  // 一指ドラッグで地図を見回す(2026-09-01、作者の指示)。マス単位のズレをviewBoxへ足す。
  // 1歩でも動いたら現在地の表示へ戻す(見回した状態のまま迷子にならないように)。
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const mapRef = useRef(null), drag = useRef(null);
  useEffect(() => { setPan({ x: 0, y: 0 }); }, [floor.pos.x, floor.pos.y]);
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
  // 部屋は角丸長方形で描くので、大広間の間仕切りは自分で塗り潰さないと地図から消える。
  // 隣のマスを見たことがある壁だけ出す(壁は隣に立って初めて分かる)。
  const partition = hallWallCells(map).filter(cell =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.seen.has(`${cell.x + dx},${cell.y + dy}`)));
  const currentRoom = map.rooms.get(floor.at);
  const lamp = { x: floor.pos.x + .5, y: floor.pos.y + .5 };
  const bearing = ANGLE[floor.facing] ?? 0;
  // 空間(部屋・通路・自分)は-bearingだけ回す。文字(部屋名・記号)は逆に+bearingで打ち消し、
  // 読める向きのまま位置だけ動く。北固定モード(headingUp=false)ではどちらも無回転。
  const spin = headingUp ? `rotate(${-bearing} ${lamp.x} ${lamp.y})` : undefined;
  const unspin = headingUp ? `rotate(${bearing})` : undefined;
  // ドラッグ量(画面px)を地図のマス単位へ直す。panはrotateする<g>の外側、viewBox自体に
  // 効くので、headingUpで中身が回っていてもpan側には回転補正は要らない
  // (2026-09-01、東向きで横ドラッグが縦に動くと判明して回転補正を削除)。
  const onPointerDown = e => {
    const rect = mapRef.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, rect, pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = e => {
    if (!drag.current) return;
    const { x, y, rect, pan: base } = drag.current;
    // 指についてくる向き(地図アプリの標準)。viewBoxの最小値を下げると中身は右へ動くので、
    // 引く(2026-09-01、南向きで逆に感じると指摘され、向きに依らない一貫した符号に直す)。
    const dxMap = (e.clientX - x) * (width / rect.width), dyMap = (e.clientY - y) * (height / rect.height);
    setPan({ x: base.x - dxMap, y: base.y - dyMap });
  };
  const onPointerUp = () => { drag.current = null; };
  return <section className="rogue-map-shell" aria-label="探索地図">
    <header className="rogue-map-rail">
      {/* 一人称側の見出し(FirstPerson3D.jsx)と表記を揃える(2026-09-01、作者の指示)。 */}
      <b>地下 1F : {currentRoom?.name || "通路"}</b>
      <div className="rogue-map-rail-right">
        {(pan.x || pan.y) ? <button className="rogue-heading-toggle" onClick={() => setPan({ x: 0, y: 0 })}>現在地へ</button> : null}
        <button className="rogue-heading-toggle" onClick={() => setHeadingUp(v => !v)}>{headingUp ? "北を上へ" : "進行方向を上へ"}</button>
      </div>
    </header>
    <div className="rogue-map" ref={mapRef}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {/* バトルと同じ位置・大きさのコンパス(2026-09-01、作者の指示)。 */}
      <div className="rogue-compass-slot"><Compass facing={floor.facing} headingUp={headingUp}/></div>
      <svg viewBox={`${left + pan.x} ${top + pan.y} ${width} ${height}`} role="img" aria-label="探索地図">
        <defs>
          <radialGradient id="expedition-torch" gradientUnits="userSpaceOnUse" cx={lamp.x} cy={lamp.y} r="5"><stop stopColor="white" stopOpacity=".95"/><stop offset=".55" stopColor="white" stopOpacity=".35"/><stop offset="1" stopColor="black" stopOpacity="0"/></radialGradient>
          <mask id="expedition-torch-mask" maskUnits="userSpaceOnUse" x={left} y={top} width={width} height={height}><rect x={left} y={top} width={width} height={height} fill="url(#expedition-torch)"/></mask>
          <radialGradient id="expedition-glow" gradientUnits="userSpaceOnUse" cx={lamp.x} cy={lamp.y} r="5"><stop stopColor="#e4b064" stopOpacity=".38"/><stop offset="1" stopColor="#e4b064" stopOpacity="0"/></radialGradient>
        </defs>
        <g transform={spin}>
          <g className="rogue-floor rogue-memory" dangerouslySetInnerHTML={{ __html: rooms + memoryCorridors }}/>
          <g mask="url(#expedition-torch-mask)" className="rogue-floor rogue-light" dangerouslySetInnerHTML={{ __html: rooms + lightCorridors }}/>
          {partition.map(cell => <rect key={`w${cell.x},${cell.y}`} className="rogue-partition" x={cell.x} y={cell.y} width="1" height="1"/>)}
          {Array.from(map.rooms.values()).filter(room => state.visited.has(room.id)).map(room => <g key={room.id} className="rogue-marker" transform={`translate(${room.x + room.w / 2} ${room.y + room.h / 2})`}><g transform={unspin}><text y=".12">{markerFor(floor, room)}</text><text className="rogue-room-name" y={-room.h / 2 - .35}>{room.name}</text></g></g>)}
          <circle className="rogue-lamp-glow" cx={lamp.x} cy={lamp.y} r="5" fill="url(#expedition-glow)"/>
          <g className="rogue-player-mark" transform={`translate(${lamp.x} ${lamp.y}) rotate(${bearing})`}>
            <circle className="rogue-player-halo" r=".42"/>
            <circle className="rogue-player" r=".17"/>
            <polygon className="rogue-player-arrow" points="0,-.95 .34,-.2 0,-.38 -.34,-.2"/>
          </g>
        </g>
      </svg>
    </div>
    {onMove && <nav className="rogue-controls" aria-label="移動"><button onClick={() => onMove("north")}>↑<span>北</span></button><button onClick={() => onMove("west")}>←<span>西</span></button><button onClick={() => onMove("south")}>↓<span>南</span></button><button onClick={() => onMove("east")}>→<span>東</span></button></nav>}
  </section>;
}
