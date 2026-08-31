import * as THREE from "three";

// 塵の「見た目」の正本。戦闘(view3d.js)と探索の一人称(firstPersonScene.js)が同じ絵になるよう、
// テクスチャ・材質・粒ごとのばらつきをここだけに置く。
// 動かし方は場面ごとに違う(戦闘は盤面の上、探索はカメラの周り)ので、ここには置かない。
//
// 元は view3d.js の中にあった値。数字の意味はそこでの調整の結果:
// - 数は少なめ。塵は雰囲気であって主役ではない
// - 上へ「ゆらゆら立ち上る」。頂点まで20〜50秒かかるほど遅い
// - PointsMaterialは全粒子が同じ大きさになるので、粒ごとに大きさを変えるためSpriteにする

export const DUST_TOP = 2.6;   // 立ち上る高さ。単位: タイル

export function dustTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,244,220,0.32)");
  grad.addColorStop(1, "rgba(255,244,220,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function dustMaterial() {
  return new THREE.SpriteMaterial({
    map: dustTexture(), transparent: true, opacity: 0.28,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// 粒1つ分のばらつき。揺れはXとZで周期を変えて重ね、円を描くように動かす
// (X方向だけだと単調に見えた)。
export function dustMote() {
  return {
    size: 0.08 + Math.random() * 0.02,
    speed: 0.05 + Math.random() * 0.07,
    swayAmpX: 0.14 + Math.random() * 0.16,
    swayFreqX: 0.5 + Math.random() * 0.5,
    swayAmpZ: 0.1 + Math.random() * 0.14,
    swayFreqZ: 0.35 + Math.random() * 0.4,
    swayPhase: Math.random() * Math.PI * 2,
  };
}
