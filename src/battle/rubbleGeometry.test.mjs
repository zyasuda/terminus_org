// 瓦礫の箱の面の向き(表裏)を検査する。
//
// なぜこの検査が要るか: Blenderのビューポートは既定で裏面も描くので、向きが逆でも
// 向こうでは正しく見える。ブラウザ側は THREE の既定(FrontSide)で裏面を捨てるため、
// 裏返っていると箱の中が見える。実際に一度これで間違えたので、目に頼らず数値で見る。
//
// 使う性質: 閉じた立体の符号付き体積 Σ v0·((v1-v0)×(v2-v0)) / 6 は、面が外向きなら正、
// 内向きなら負になる。底面は張っていないが、底面はy=0の平面上にあり原点を含むので
// 体積への寄与が0になる。つまり開いたままでも体積は本来の値と一致する。
import assert from "node:assert";
import { rubbleVertices, RUBBLE_W } from "./view3d.js";

const W = RUBBLE_W;            // 箱の一辺(view3d.js側の正本を使う)
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

const triangles = verts => {
  const out = [];
  for (let i = 0; i < verts.length; i += 9) {
    out.push([verts.slice(i, i+3), verts.slice(i+3, i+6), verts.slice(i+6, i+9)]);
  }
  return out;
};

for (const h of [0.25, 0.5, 0.75]) {
  for (let seed = 0; seed < 200; seed++) {
    const tris = triangles(rubbleVertices(h, seed));
    assert.ok(tris.length >= 10, `h=${h} seed=${seed}: 三角形が足りない`);

    let volume = 0;
    for (const [v0, v1, v2] of tris) {
      const n = cross(sub(v1, v0), sub(v2, v0));
      volume += dot(v0, n) / 6;
      // 下を向いた面は1つも無い(底面は張っていないので、真下向きは裏返りの印)
      assert.ok(n[1] >= -1e-9, `h=${h} seed=${seed}: 下を向いた面がある n.y=${n[1]}`);
      // 上面以外は、箱の中心軸から外へ向く
      const flat = Math.hypot(n[0], n[2]);
      if (flat > 1e-9) {
        const cx = (v0[0] + v1[0] + v2[0]) / 3, cz = (v0[2] + v1[2] + v2[2]) / 3;
        assert.ok(n[0]*cx + n[2]*cz > 0, `h=${h} seed=${seed}: 側面が内を向いている`);
      }
      // 面積0の三角形を混ぜない(重なった点の張り方を間違えた印)
      assert.ok(Math.hypot(n[0], n[1], n[2]) > 1e-9, `h=${h} seed=${seed}: 面積0の面がある`);
    }

    const box = W * W * h;
    assert.ok(volume > 0, `h=${h} seed=${seed}: 体積が負(面が内向き) ${volume}`);
    assert.ok(volume <= box + 1e-9, `h=${h} seed=${seed}: 箱より大きい ${volume} > ${box}`);
    assert.ok(volume > box * 0.9, `h=${h} seed=${seed}: 削りすぎ ${volume} / ${box}`);
  }
}

// 削る角の個数が0〜4まで実際に出る(rngが偏っていない)
const counts = new Set();
for (let seed = 0; seed < 400; seed++) {
  // 上端の輪の頂点数 = 4 + 削った角の数。上面の三角形は (頂点数-2) 枚
  const tris = triangles(rubbleVertices(0.5, seed));
  const topRing = tris.filter(t => t.every(v => Math.abs(v[1] - 0.5) < 1e-9)).length + 2;
  counts.add(topRing - 4);
}
assert.deepEqual([...counts].sort(), [0, 1, 2, 3, 4], "削る角は0〜4個すべて出る");

console.log("battle/rubbleGeometry: 面はすべて外向き、削る角は0〜4個");
