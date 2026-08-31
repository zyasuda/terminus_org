import React, { useMemo } from "react";
import { hallRoom, mapForFloor } from "./core.js";
import { hallEnemyPosition } from "./interior.js";
import { hasLineOfSight, viewCells } from "./mapwalk.js";

// Wizardry風の一人称・線画3D。
// 描き方は grid-based dungeon crawler の定石に合わせてある(Dungeons of Noudar 3D の解説など):
//   1. カメラ前方のマスを格子として取り出す(mapwalk.js の viewCells)
//   2. 壁のマスを「遠い順」に描き、手前の壁が奥を塗りつぶす(painter's algorithm)
//   3. 隣のマスを見て、隠れる面は最初から描かない
// 壁が「あるか」の判断は viewCells(=isOpen)だけが持つ。ここは座標を画面へ写すだけ。
// 画面の縦横比。戦闘盤に合わせると通路は幅4.5m×高さ3mの低く広い断面になるので、
// 縦長の枠だと床と天井の余白ばかりになる。横長の窓で覗く形にする。
const W = 300, H = 250, CX = W / 2, CY = H / 2 + 8;
const DEPTH = 5, SIDE = 3;
// 戦闘盤との換算。戦闘の通路盤は width 7 × height 3(battleConfig.js)で通路の幅は3マス。
// つまり探索の1マス = 戦闘の3タイル。床の目盛りはこの換算で刻む。
const TILES_PER_CELL = 3;
// 天井の高さ。戦闘3Dの入口アーチ(view3d.js の ARCH_HEIGHT_TILES = 2.0、1マス1.5m換算で3m)に合わせた。
// 目の高さはアーチのコメント「人の約1.6倍」から逆算した背丈(2.0/1.6 = 1.25タイル)のやや下。
// 天井が低い/高いと感じたらこの2つだけを触る。壁も床も敵影もここから位置が決まる。
const CEIL_TILES = 2.0, EYE_TILES = 1.15;
const CEIL_H = (CEIL_TILES - EYE_TILES) / TILES_PER_CELL, FLOOR_H = EYE_TILES / TILES_PER_CELL;
// 目は足元のマスの中心にある。マスdの手前の境目までの距離は d - 0.5 マス。
// NEAR_CLIPは目より手前へ回り込んだ面を画面外へ逃がすためのもので、見た目の調整値ではない。
const FOCAL = 150, NEAR_CLIP = 0.3;
const dist = d => Math.max(d, NEAR_CLIP);
const sx = (u, t) => CX + u * FOCAL / dist(t);
const sy = (h, t) => CY + h * FOCAL / dist(t);
// 天井から床まで届く1枚の面。(uA,tA)から(uB,tB)へ張る。
// tAとtBが違えば奥行き方向の側面、同じならこちらを向いた正面になる。
const face = (uA, tA, uB, tB) => [[sx(uA, tA), sy(-CEIL_H, tA)], [sx(uB, tB), sy(-CEIL_H, tB)],
  [sx(uB, tB), sy(FLOOR_H, tB)], [sx(uA, tA), sy(FLOOR_H, tA)]]
  .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
// 奥ほど暗く霞ませる。灯りが届く範囲を濃さで表す。
const fade = d => Math.max(0.1, 1 - d * 0.2);
// 壁は不透明でなければならない(奥が透けると地図と食い違う)。
// 遠近は opacity ではなく、背景色へ寄せた色で表す。
const FOG = [10, 13, 20];
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * k + FOG[i] * (1 - k))).join(",")})`;
};
const COMPASS = { north: { label: "北", angle: 0 }, east: { label: "東", angle: 90 }, south: { label: "南", angle: 180 }, west: { label: "西", angle: 270 } };

export default function FirstPersonView({ floor, onForward, onBack, onTurn, onOpenMap }) {
  const map = useMemo(() => mapForFloor(floor), [floor.seed, floor.corridorSeed]);
  const cells = useMemo(() => viewCells(map, floor.pos, floor.facing, DEPTH, SIDE),
    [map, floor.pos.x, floor.pos.y, floor.facing]);
  const room = useMemo(() => hallRoom(floor), [floor.seed, floor.corridorSeed]);
  const openAt = useMemo(() => {
    const table = new Map(cells.map(c => [`${c.u},${c.d}`, c.open]));
    // 窓の外は壁として扱う。窓の縁で床が抜けて見えるのを防ぐ。
    return (u, d) => table.get(`${u},${d}`) === true;
  }, [cells]);
  const seen = useMemo(() => cell => hasLineOfSight(map, floor.pos, cell), [map, floor.pos.x, floor.pos.y]);

  // 床。見えている空きマスにだけ敷く。手前2マスは戦闘と同じ1タイルきざみ、奥はマスの枠だけ。
  const floorLines = [];
  for (const cell of cells) {
    if (!cell.open || !seen(cell)) continue;
    const near = cell.d - 0.5, far = cell.d + 0.5, left = cell.u - 0.5, right = cell.u + 0.5;
    const o = fade(cell.d) * 0.5, steps = cell.d <= 2 ? TILES_PER_CELL : 1;
    for (let k = 0; k <= steps; k += 1) {
      const t = near + k / steps, u = left + k / steps;
      floorLines.push(<line key={`h${cell.u},${cell.d},${k}`} opacity={k % steps ? o * 0.5 : o}
        x1={sx(left, t)} y1={sy(FLOOR_H, t)} x2={sx(right, t)} y2={sy(FLOOR_H, t)}/>);
      floorLines.push(<line key={`v${cell.u},${cell.d},${k}`} opacity={k % steps ? o * 0.5 : o}
        x1={sx(u, near)} y1={sy(FLOOR_H, near)} x2={sx(u, far)} y2={sy(FLOOR_H, far)}/>);
    }
  }

  // 壁。遠い順に描き、手前の面が奥を塗りつぶす。
  const walls = [...cells].filter(c => !c.open)
    .sort((a, b) => Math.hypot(b.u, b.d) - Math.hypot(a.u, a.d))
    .flatMap(cell => {
      const near = cell.d - 0.5, far = cell.d + 0.5, o = fade(cell.d);
      const faces = [];
      // こちらを向いた面。手前のマスが壁なら隠れるので描かない。
      if (openAt(cell.u, cell.d - 1)) faces.push(<polygon key={`f${cell.u},${cell.d}`}
        fill={shade("#232a3a", o)} stroke={shade("#8fb0d8", o)} points={face(cell.u - 0.5, near, cell.u + 0.5, near)}/>);
      // 側面。カメラから見える側だけ。正面(u=0)の壁は側面が見えない。
      if (cell.u > 0 && openAt(cell.u - 1, cell.d)) faces.push(<polygon key={`l${cell.u},${cell.d}`}
        fill={shade("#171d29", o)} stroke={shade("#8fb0d8", o)} points={face(cell.u - 0.5, near, cell.u - 0.5, far)}/>);
      if (cell.u < 0 && openAt(cell.u + 1, cell.d)) faces.push(<polygon key={`r${cell.u},${cell.d}`}
        fill={shade("#171d29", o)} stroke={shade("#8fb0d8", o)} points={face(cell.u + 0.5, near, cell.u + 0.5, far)}/>);
      return faces;
    });

  // 固定敵は地図に出さない。壁の向こうなら描かない。
  const enemyPos = room && !floor.hallDefeated ? hallEnemyPosition(room) : null;
  const enemyCell = enemyPos ? cells.find(c => c.x === enemyPos.x && c.y === enemyPos.y && c.d > 0 && seen(c)) : null;
  const canForward = openAt(0, 1);
  const compass = COMPASS[floor.facing];

  return <section style={S.shell} aria-label="一人称視点">
    <div style={S.hud}>
      <b>{room && floor.at === room.id ? room.name : map.rooms.get(floor.at)?.name || "通路"}</b>
      <span style={S.compass}>
        <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">
          <circle r="11" fill="#171b24" stroke="#4a5366"/>
          <polygon points="0,-8 4,5 0,2 -4,5" fill="#e4b064" transform={`rotate(${compass.angle})`}/>
        </svg>
        <span>{compass.label}を向いている</span>
      </span>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`正面の視界(${compass.label}向き)`} style={S.svg}>
      <defs>
        {/* 灯り: 手前だけを暖色で照らし、周辺は闇に落とす */}
        <radialGradient id="fp-lamp" gradientUnits="userSpaceOnUse" cx={CX} cy={CY + 20} r="150">
          <stop stopColor="#e4b064" stopOpacity=".24"/><stop offset="1" stopColor="#e4b064" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="fp-vignette" gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r="165">
          <stop offset=".35" stopColor="#05070c" stopOpacity="0"/><stop offset="1" stopColor="#05070c" stopOpacity=".9"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="#0a0d14"/>
      <g stroke="#6d8399" strokeWidth="0.8" fill="none">{floorLines}</g>
      <g strokeWidth="1.2">{walls}</g>
      {enemyCell && (() => {
        // 背丈は戦闘Configの見かけの高さ(0.9タイル)に合わせる。
        const t = enemyCell.d, feet = sy(FLOOR_H, t), head = sy(FLOOR_H - 0.9 / TILES_PER_CELL, t);
        const half = sx(0.22, t) - CX;
        return <polygon fill={shade("#171b26", fade(enemyCell.d))} stroke={shade("#c96b6b", fade(enemyCell.d))} strokeWidth="1.3"
          points={`${sx(enemyCell.u, t)},${head} ${sx(enemyCell.u, t) - half},${feet} ${sx(enemyCell.u, t) + half},${feet}`}/>;
      })()}
      <rect x="0" y="0" width={W} height={H} fill="url(#fp-lamp)" style={{ mixBlendMode: "screen" }}/>
      <rect x="0" y="0" width={W} height={H} fill="url(#fp-vignette)"/>
    </svg>
    <div style={S.controls}>
      <button style={S.turnBtn} onClick={() => onTurn("left")} aria-label="左へ旋回">↺</button>
      <div style={S.moveCol}>
        <button style={S.forwardBtn} onClick={onForward} disabled={!canForward} aria-label="前進">
          {canForward ? "前進" : "壁"}
        </button>
        <button style={S.backBtn} onClick={onBack} aria-label="後退">後退</button>
      </div>
      <button style={S.turnBtn} onClick={() => onTurn("right")} aria-label="右へ旋回">↻</button>
    </div>
    <button style={S.mapBtn} onClick={onOpenMap}>地図</button>
  </section>;
}
const S = {
  shell: { position: "relative", width: 300, background: "#0a0d14", borderRadius: 8, overflow: "hidden", border: "1px solid #3c4354" },
  hud: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px", color: "#c3ccdd", fontSize: 12, background: "rgba(20,24,32,.9)" },
  compass: { display: "flex", alignItems: "center", gap: 6 },
  svg: { display: "block", width: "100%", height: "auto" },
  controls: { display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: 10, background: "rgba(20,24,32,.9)" },
  turnBtn: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #4a5366", borderRadius: 8, width: 44, height: 44, fontSize: 18 },
  moveCol: { display: "flex", flexDirection: "column", gap: 6 },
  forwardBtn: { background: "#3d7fb5", color: "#fff", border: 0, borderRadius: 8, padding: "0 22px", height: 40, fontSize: 14 },
  backBtn: { background: "#2b303c", color: "#c3ccdd", border: "1px solid #4a5366", borderRadius: 8, padding: "0 22px", height: 32, fontSize: 12 },
  mapBtn: { position: "absolute", top: 4, right: 6, background: "rgba(43,48,60,.9)", color: "#e6e8ee", border: "1px solid #4a5366", borderRadius: 6, padding: "5px 10px", fontSize: 12 },
};
