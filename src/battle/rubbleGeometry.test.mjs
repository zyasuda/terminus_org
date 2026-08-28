// 障害物の形すべてについて、面の向き(表裏)と「駒が立てるか」を検査する。
//
// なぜこの検査が要るか: Blenderのビューポートは既定で裏面も描くので、巻き順が逆でも
// 向こうでは正しく見える。ブラウザ側は three.js の既定(FrontSide)で裏面を捨てるため、
// 裏返っていると箱の中が見える。実際に一度これで間違えたので、目に頼らず数値で見る。
//
// 使う性質: 閉じた立体の符号付き体積 Σ v0·((v1-v0)×(v2-v0)) / 6 は、面が外向きなら正、
// 内向きなら負になる。底面はどの形も張っていないが、底面はy=0の平面上にあって原点を
// 含むので体積への寄与が0になる。つまり開いたままでも体積は本来の値と一致する。
import assert from "node:assert";
import { obstacleVertices, pickObstacleShape, gridSalt, SHAPES_BY_HEIGHT, RUBBLE_W } from "./view3d.js";

const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

const triangles = verts => {
  const out = [];
  for (let i = 0; i < verts.length; i += 9) out.push([verts.slice(i, i+3), verts.slice(i+3, i+6), verts.slice(i+6, i+9)]);
  return out;
};

// 上面が平らなら駒が立てる。錐は一点、アーチは稜線なので立てない。
// 高さ1.0は高さの規則で必ず壁なので、この表の対象は0.75以下だけにする
const FOOTHOLD = {
  cube: true, penta: true, hexa: true, frustum: true, barrel: true, slope: true,
  cone4: false, cone6: false, monolithArch: false, monolithFlat: true,
};

const HEIGHTS_OF = shape => Object.entries(SHAPES_BY_HEIGHT)
  .filter(([, pool]) => pool.includes(shape)).map(([h]) => Number(h));

for (const shape of Object.keys(FOOTHOLD)) {
  const heights = shape === "slope" ? [0.25] : HEIGHTS_OF(shape);
  assert.ok(heights.length, `${shape}: どの高さの候補にも入っていない`);
  for (const h of heights) {
    for (let seed = 0; seed < 120; seed++) {
      for (const facing of (shape === "slope" ? [0, 1, 2, 3] : [0])) {
        const where = `${shape} h=${h} seed=${seed} facing=${facing}`;
        const tris = triangles(obstacleVertices(shape, h, seed, facing));
        assert.ok(tris.length >= 4, `${where}: 三角形が足りない (${tris.length})`);

        let volume = 0, top = -Infinity;
        const span = { x: [Infinity, -Infinity], z: [Infinity, -Infinity] };
        for (const [v0, v1, v2] of tris) {
          const n = cross(sub(v1, v0), sub(v2, v0));
          volume += dot(v0, n) / 6;
          assert.ok(Math.hypot(...n) > 1e-12, `${where}: 面積0の面がある`);
          // 真下を向いた面は1つも無い。底面を張っていないので、真下向きは上面の裏返りの印。
          // 完全な水平(0)で切らないのは、埋まり樽の胴の膨らみが床のすぐ上でわずかに
          // 下を向くため(一番太い所が床より上にあるので、その下側は正しく下向きになる)
          const ny = n[1] / Math.hypot(...n);
          assert.ok(ny > -0.5, `${where}: 真下を向いた面がある n.y=${ny.toFixed(3)}`);
          // 上面以外は、形の中心軸から外へ向く
          if (Math.hypot(n[0], n[2]) > 1e-9) {
            const cx = (v0[0]+v1[0]+v2[0])/3, cz = (v0[2]+v1[2]+v2[2])/3;
            assert.ok(n[0]*cx + n[2]*cz > 0, `${where}: 側面が内を向いている`);
          }
          for (const v of [v0, v1, v2]) {
            top = Math.max(top, v[1]);
            span.x[0] = Math.min(span.x[0], v[0]); span.x[1] = Math.max(span.x[1], v[0]);
            span.z[0] = Math.min(span.z[0], v[2]); span.z[1] = Math.max(span.z[1], v[2]);
          }
        }

        assert.ok(volume > 0, `${where}: 体積が負(面が内向き) ${volume}`);
        const bbox = (span.x[1]-span.x[0]) * (span.z[1]-span.z[0]) * top;
        assert.ok(volume <= bbox + 1e-9, `${where}: 外接直方体より大きい ${volume} > ${bbox}`);
        assert.ok(Math.abs(top - h) < 1e-9, `${where}: 高さが ${top}、指定は ${h}`);
        assert.ok(Math.max(span.x[1]-span.x[0], span.z[1]-span.z[0]) <= 0.9,
          `${where}: 接地がマスからはみ出す ${span.x[1]-span.x[0]} / ${span.z[1]-span.z[0]}`);

        // 最高点にある「別々の」点が3つ以上あれば上面に平面がある = 駒が立てる。
        // 錐の頂点は三角形ごとに同じ座標が何度も現れるので、重複を数えてはいけない
        const flat = new Set(tris.flat().filter(v => Math.abs(v[1] - top) < 1e-9)
          .map(v => `${v[0].toFixed(6)},${v[2].toFixed(6)}`)).size;
        assert.equal(flat >= 3, FOOTHOLD[shape], `${where}: 上面の平らさが区分と合わない (頂点${flat})`);
      }
    }
  }
}

// キューブは削る角が0〜4個すべて出る(rngが偏っていない)
{
  const counts = new Set();
  for (let seed = 0; seed < 400; seed++) {
    const tris = triangles(obstacleVertices("cube", 0.5, seed));
    const topRing = tris.filter(t => t.every(v => Math.abs(v[1] - 0.5) < 1e-9)).length + 2;
    counts.add(topRing - 4);
  }
  assert.deepEqual([...counts].sort(), [0, 1, 2, 3, 4], "キューブの削る角は0〜4個すべて出る");
}

// 法面は、隣に高さ0.5のブロックがある0.25のマスにだけ出て、0.5の反対側を向く
{
  const grid = { w: 3, h: 1, cells: [{ obstacle: { height: 0.25 } }, { obstacle: { height: 0.5 } }, {}] };
  const picked = pickObstacleShape(grid, 0, 0, 0.25);
  assert.equal(picked.shape, "slope", "隣が0.5なら法面になる");
  assert.equal(picked.facing, 3, "0.5が+x側なら、法面は-x側を向く");
  const alone = { w: 3, h: 1, cells: [{ obstacle: { height: 0.25 } }, {}, {}] };
  assert.notEqual(pickObstacleShape(alone, 0, 0, 0.25).shape, "slope", "隣に0.5が無ければ法面にしない");
}

// 盤面ごとの塩で形が変わる。マス座標だけを種にすると、盤面が違っても同じ位置に
// 同じ形が出てしまう(実測で分布が固定され、六角柱が他の1/3しか出ていなかった)
{
  const cells = Array.from({ length: 25 }, () => ({ walkable: true, obstacle: null, void: false }));
  const grid = { w: 5, h: 5, cells };
  cells[12].obstacle = { height: 0.5 };
  const saltA = gridSalt(grid);
  cells[7].obstacle = { height: 0.75 };
  const saltB = gridSalt(grid);
  assert.notEqual(saltA, saltB, "盤面の中身が変われば塩も変わる");

  const shapesFor = salt => Array.from({ length: 25 }, (_, i) =>
    pickObstacleShape(grid, i % 5, Math.floor(i / 5), 0.5, salt).shape).join(",");
  assert.equal(shapesFor(saltA), shapesFor(saltA), "同じ塩なら同じ形(決定論)");
  assert.notEqual(shapesFor(saltA), shapesFor(saltB), "塩が変われば形も変わる");

  // 高さ0.5の候補が、盤面をまたげば全種類出る
  const seen = new Set();
  for (let salt = 0; salt < 200; salt++) seen.add(pickObstacleShape(grid, 1, 1, 0.5, salt).shape);
  assert.deepEqual([...seen].sort(), [...SHAPES_BY_HEIGHT[0.5]].sort(), "高さ0.5の候補が全部出る");
}

// 高さ1.0の候補は柱と石板だけ(錐や柱を混ぜていない)
assert.deepEqual(SHAPES_BY_HEIGHT[1], ["pillar", "monolithFlat"], "高さ1.0の候補");
assert.ok(RUBBLE_W < 1, "キューブはマスより小さい(到達マスの青が見えるように)");

console.log("battle/rubbleGeometry: 9種すべて面が外向き、上面の平らさが区分と一致、法面の向きが正しい");
