import React from "react";

// 一人称・地図の両方で使う共通コンパス。北を上に固定し、向いている方角へ針を回す。
// (2026-09-01、作者の指示。それまで一人称は針つきアイコン、地図はテキストだけで別物だった)
const LABEL = { north: "北", east: "東", south: "南", west: "西" };
const ANGLE = { north: 0, east: 90, south: 180, west: 270 };

export default function Compass({ facing, showLabel = true, size = 22 }) {
  return <span style={S.wrap}>
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true">
      <circle r="11" fill="#171b24" stroke="#4a5366"/>
      <polygon points="0,-8 4,5 0,2 -4,5" fill="#e4b064" transform={`rotate(${ANGLE[facing] ?? 0})`}/>
    </svg>
    {showLabel && <span>{LABEL[facing] ?? "?"}を向いている</span>}
  </span>;
}
const S = { wrap: { display: "flex", alignItems: "center", gap: 6 } };
