import * as THREE from "three";
import { makeRng } from "./core.js";

// 坑道の面(床・壁)と、通路の高さの正本。戦闘(view3d.js)と探索の一人称
// (firstPersonScene.js)が同じ坑道に見えるよう、ここだけに置く。
// 元は view3d.js の中にあった値。FLOOR_TONEとGRID_LINE_OPACITYは
// 2026-08-25に作者が比較画像から決めたもの。
//
// 石畳(stoneTexture)は床だけ。壁は wallGradientTexture を使う。

// 人が通る出入口の高さ。戦闘の書き割りの入口アーチと、探索が部屋と通路の境目に描く
// アーチが読む。1マス1.5m換算で3m。リディア(実測1.209タイル)の約1.65倍。
export const DOORWAY_HEIGHT_TILES = 2.0;

// 坑道の天井の高さ。探索の一人称が読む。出入口より高い。
// 2.0(=出入口と同じ)だとアーチの頂点が天井に接して「低い」と感じる。
// 作者が実機のスライダーで決めた値(2026-08-31、2.5タイル = 3.75m)。
//
// 戦闘の WALL_H(1.0)とは別物なので混同しないこと。あちらは「見下ろした時に駒が隠れない
// 高さ」で決めた盤上のブロックの高さで、通路の高さを表していない。
// 探索でWALL_Hを使うと天井が目の高さ(1.15)より低くなり、歩けない絵になる。
export const PASSAGE_HEIGHT_TILES = 2.5;

// 壁の色。戦闘の COLOR.wall もここを読む。
export const WALL_COLOR = 0x2b303c;

/* 壁の縦グラデーション。上が見えて、下へ向かうほど闇に沈む。
   元は view3d.js の書き割り(backdropTexture)の中にあった3点。
   探索の一人称も同じ壁に見えるよう、ここを正本にする(2026-09-01)。

   戦闘は書き割りなので透過させて床際を闇へ落とす。探索の壁は本物の面で、
   カメラが中を歩くので透過させられない。`opaque` を渡すと、同じ色を
   背景色 `over` の上へ焼き込んで不透明にする(見た目は透過版と同じになる)。 */
const WALL_STOPS = [[0, 30, 35, 49, 0.9], [0.45, 15, 18, 26, 0.5], [1, 5, 6, 10, 0]];
export function wallGradientTexture({ opaque = false, over = [10, 13, 20] } = {}) {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  for (const [at, r, gg, b, a] of WALL_STOPS) {
    const mix = (v, i) => Math.round(v * a + over[i] * (1 - a));
    grad.addColorStop(at, opaque ? `rgb(${mix(r, 0)},${mix(gg, 1)},${mix(b, 2)})` : `rgba(${r},${gg},${b},${a})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  // 色空間を指定しないとcanvasの値が線形として扱われ、出力時のsRGB変換で持ち上げられる
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const FLOOR_BASE = 0xb4b4b4;   // 石のモノトーン。明度はFLOOR_TONEで動かす
export const FLOOR_TONE = 0.8;
export const FLOOR_TEX_TILES = 3;     // テクスチャ1枚が何タイル分か。物理サイズを固定するため

// 石畳のモノトーン。画像ファイルは使わず、canvasで焼く。
// 大きな色むら→細かい粒の順に重ねる。決定論rngなので毎回同じ絵になる。
export function stoneTexture() {
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
}
