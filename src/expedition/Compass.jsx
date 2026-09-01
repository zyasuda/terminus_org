import React from "react";

// 一人称・地図の両方で使う共通コンパス。バトル画面の方位ダイヤル(ExpeditionBattle.jsx)と
// 同じ大きさ・同じ見た目(円+N/E/S/Wの文字を配置)に揃えた(2026-09-01、作者の指示)。
// バトル側は常にNを強調してカメラの向きでダイヤルを回すが、こちらは「今向いている方角」を
// 強調する方が探索では意味が通るので、強調する文字だけ変えている。
// 方角の方位角(北=0、時計回り)。地図側の回転(RogueMap.jsx)もこの表を読む。
export const ANGLE = { north: 0, east: 90, south: 180, west: 270 };
const POINTS = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];

// headingUpは「進行方向を必ず上」モード(2026-09-01、作者の指示)。
// ダイヤルを向いている方角の分だけ回し、今の向きの文字が常に真上へ来るようにする。
//
// 画面角度θ(真上=0、時計回り)は「方位角deg」から基準ref(北固定なら常に0、
// heading-upなら今の向きの方位角)を引くだけでよい。x=sin(θ), y=-cos(θ)。
// 北固定でN(deg=0)がθ=0(真上)、E(deg=90)がθ=90(右)になるのを実際に確かめて決めた式
// (2026-09-01、「上はSでないとおかしい」で最初の式の90度ズレに気づいた)。
export default function Compass({ facing, headingUp = false }) {
  const bearing = ANGLE[facing] ?? 0;
  const ref = headingUp ? bearing : 0;
  return <svg width="58" height="58" viewBox="-29 -29 58 58" aria-hidden="true">
    <circle r="26" fill="rgba(10,14,22,.70)" stroke="#4a5366" strokeWidth="1"/>
    {POINTS.map(([label, deg]) => {
      const a = (deg - ref) * Math.PI / 180;
      const on = deg === bearing;
      return <text key={label} x={Math.sin(a) * 16} y={-Math.cos(a) * 16}
        textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight={on ? 700 : 400}
        fill={on ? "#e8b45c" : "#8f98ac"}>{label}</text>;
    })}
  </svg>;
}
