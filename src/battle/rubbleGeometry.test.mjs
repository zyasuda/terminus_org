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
import { obstacleVertices, obstacleColor, RUBBLE_COLORS, RUBBLE_W } from "./view3d.js";
import { SHAPES_BY_HEIGHT, assignObstacleShapes, isStandable, makeRng } from "./core.js";

const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

const triangles = verts => {
  const out = [];
  for (let i = 0; i < verts.length; i += 9) out.push([verts.slice(i, i+3), verts.slice(i+3, i+6), verts.slice(i+6, i+9)]);
  return out;
};

// 形の上面が平らかどうか(幾何の事実)。錐は一点、アーチは稜線、法面は斜面なので平らでない。
// 「駒が立てるか」(規則)は core.js の isStandable が持ち、法面だけが両者で食い違う。
// その1件だけを下で名指しして検査する。数を増やすなら、そのつもりがあるかを疑うこと
const FLAT_TOP = {
  cube: true, penta: true, hexa: true, frustum: true, barrel: true, monolithFlat: true,
  cone4: false, cone6: false, monolithArch: false, slope: false,
};

const HEIGHTS_OF = shape => Object.entries(SHAPES_BY_HEIGHT)
  .filter(([, pool]) => pool.includes(shape)).map(([h]) => Number(h));

for (const shape of Object.keys(FLAT_TOP)) {
  const heights = shape === "slope" ? [0.25] : HEIGHTS_OF(shape);
  assert.ok(heights.length, `${shape}: どの高さの候補にも入っていない`);
  for (const h of heights) {
    for (let seed = 0; seed < 120; seed++) {
      for (const facing of (shape === "slope" ? [0, 1, 2, 3] : [0])) {
        const where = `${shape} h=${h} seed=${seed} facing=${facing}`;
        const tris = triangles(obstacleVertices(shape, h, seed, facing));
        assert.ok(tris.length >= 4, `${where}: 三角形が足りない (${tris.length})`);

        // 先に立体の重心(頂点の平均)と外形を求める。面の向きは、面の重心から見て
        // 重心の反対側を向いているかで見る。「中心軸から外へ」で見ると、法面のように
        // 大きく傾いた面で誤判定する(面の重心が軸の向こう側へ回り込むため)。
        // 採用している形はすべて凸なので、この見方で足りる
        let top = -Infinity;
        const span = { x: [Infinity, -Infinity], z: [Infinity, -Infinity] };
        const mid = [0, 0, 0];
        let count = 0;
        for (const v of tris.flat()) {
          top = Math.max(top, v[1]);
          span.x[0] = Math.min(span.x[0], v[0]); span.x[1] = Math.max(span.x[1], v[0]);
          span.z[0] = Math.min(span.z[0], v[2]); span.z[1] = Math.max(span.z[1], v[2]);
          mid[0] += v[0]; mid[1] += v[1]; mid[2] += v[2]; count++;
        }
        mid[0] /= count; mid[1] /= count; mid[2] /= count;

        let volume = 0;
        for (const [v0, v1, v2] of tris) {
          const n = cross(sub(v1, v0), sub(v2, v0));
          volume += dot(v0, n) / 6;
          assert.ok(Math.hypot(...n) > 1e-12, `${where}: 面積0の面がある`);
          // 真下を向いた面は1つも無い。底面を張っていないので、真下向きは上面の裏返りの印。
          // 完全な水平(0)で切らないのは、埋まり樽の胴の膨らみが床のすぐ上でわずかに
          // 下を向くため(一番太い所が床より上にあるので、その下側は正しく下向きになる)
          const ny = n[1] / Math.hypot(...n);
          assert.ok(ny > -0.5, `${where}: 真下を向いた面がある n.y=${ny.toFixed(3)}`);
          const c = [(v0[0]+v1[0]+v2[0])/3, (v0[1]+v1[1]+v2[1])/3, (v0[2]+v1[2]+v2[2])/3];
          assert.ok(dot(n, sub(c, mid)) > 0, `${where}: 面が内を向いている`);
        }

        assert.ok(volume > 0, `${where}: 体積が負(面が内向き) ${volume}`);
        const bbox = (span.x[1]-span.x[0]) * (span.z[1]-span.z[0]) * top;
        assert.ok(volume <= bbox + 1e-9, `${where}: 外接直方体より大きい ${volume} > ${bbox}`);
        assert.ok(Math.abs(top - h) < 1e-9, `${where}: 高さが ${top}、指定は ${h}`);
        // どの形もマス(1.0)からはみ出さない。法面だけは登る向きにマスいっぱい(0.98)使う
        assert.ok(Math.max(span.x[1]-span.x[0], span.z[1]-span.z[0]) <= 0.98 + 1e-9,
          `${where}: 接地がマスからはみ出す ${span.x[1]-span.x[0]} / ${span.z[1]-span.z[0]}`);
        // 法面以外は左右に床を残す。ここを広げると到達マスの青が隠れ、指で狙いにくくなる
        if (shape !== "slope") {
          assert.ok(Math.max(span.x[1]-span.x[0], span.z[1]-span.z[0]) <= 0.9,
            `${where}: 床の余白が無い(青が隠れる) ${span.x[1]-span.x[0]} / ${span.z[1]-span.z[0]}`);
        } else {
          // 横は細いまま。両方が0.98になると青が完全に隠れる
          assert.ok(Math.min(span.x[1]-span.x[0], span.z[1]-span.z[0]) <= 0.9,
            `${where}: 法面の横幅も広げると青が隠れる`);
        }

        // 最高点にある「別々の」点が3つ以上あれば上面に平面がある = 駒が立てる。
        // 錐の頂点は三角形ごとに同じ座標が何度も現れるので、重複を数えてはいけない
        const flat = new Set(tris.flat().filter(v => Math.abs(v[1] - top) < 1e-9)
          .map(v => `${v[0].toFixed(6)},${v[2].toFixed(6)}`)).size;
        assert.equal(flat >= 3, FLAT_TOP[shape], `${where}: 上面の平らさが表と合わない (点${flat})`);
      }
    }
  }
}

// 法面の高い辺がどちらを向くか。ここが裏返ると「登る向き」が逆になり、
// 隣の0.5へ上がれない見た目になる(数値でないと気づけない)
{
  const dirFor = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };   // facing → 高い辺の向き(x,z)
  for (const facing of [0, 1, 2, 3]) {
    const verts = triangles(obstacleVertices("slope", 0.25, 7, facing)).flat();
    const top = verts.filter(v => Math.abs(v[1] - 0.25) < 1e-9);
    assert.ok(top.length >= 2, `facing=${facing}: 上端の稜線が無い`);
    const cx = top.reduce((s, v) => s + v[0], 0) / top.length;
    const cz = top.reduce((s, v) => s + v[2], 0) / top.length;
    const [ex, ez] = dirFor[facing];
    assert.ok(cx * ex + cz * ez > 0.1,
      `facing=${facing}: 高い辺が (${ex},${ez}) を向いていない (重心 ${cx.toFixed(2)},${cz.toFixed(2)})`);
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

// 法面は、隣に高さ0.5のブロックがある0.25のマスにだけ出て、0.5の反対側を向く。
// 形を決めるのは生成側(core.js)。判定が形を見る必要があるため描画側には置けない
{
  const mk = heights => ({
    w: heights.length, h: 1,
    cells: heights.map(h => ({ walkable: true, void: false, obstacle: h ? { height: h } : null })),
  });
  const g = mk([0.25, 0.5, 0]);
  assignObstacleShapes(g, makeRng(1));
  assert.equal(g.cells[0].obstacle.shape, "slope", "隣が0.5なら法面になる");
  assert.equal(g.cells[0].obstacle.facing, 3, "0.5が+x側なら、法面は-x側を向く");

  const alone = mk([0.25, 0, 0]);
  assignObstacleShapes(alone, makeRng(1));
  assert.notEqual(alone.cells[0].obstacle.shape, "slope", "隣に0.5が無ければ法面にしない");

  // 上面が点(錐)・稜線(アーチ)の形には誰も立てない
  for (const shape of ["cone4", "cone6", "monolithArch"]) assert.equal(isStandable(shape), false, `${shape}は立てない`);
  for (const shape of ["cube", "penta", "hexa", "frustum", "barrel", "slope", "pillar", "monolithFlat"]) {
    assert.equal(isStandable(shape), true, `${shape}は立てる`);
  }
  assert.equal(isStandable(undefined), true, "shape未設定の既存ステージは従来どおり箱として扱う");

  // 幾何(上面が平らか)と規則(立てるか)が食い違うのは法面だけ。増やすなら意図の確認が要る
  const mismatch = Object.entries(FLAT_TOP).filter(([shape, flat]) => flat !== isStandable(shape)).map(([s]) => s);
  assert.deepEqual(mismatch, ["slope"], `上面の平らさと「立てる」の食い違いは法面だけ (今: ${mismatch})`);

  // 種と形が毎回入る。盤面が違えば形も違う(以前はマス座標だけを種にして分布が固定していた)
  const seen = new Set();
  for (let s = 0; s < 200; s++) {
    const g2 = mk([0.5, 0, 0]);
    assignObstacleShapes(g2, makeRng(s));
    assert.ok(Number.isInteger(g2.cells[0].obstacle.seed), "見た目用の種が入る");
    seen.add(g2.cells[0].obstacle.shape);
  }
  assert.deepEqual([...seen].sort(), [...SHAPES_BY_HEIGHT[0.5]].sort(), "高さ0.5の候補が全部出る");
}

// 高さ1.0の候補は柱と石板だけ(錐や柱を混ぜていない)
assert.deepEqual(SHAPES_BY_HEIGHT[1], ["pillar", "monolithFlat"], "高さ1.0の候補");
assert.ok(RUBBLE_W < 1, "キューブはマスより小さい(到達マスの青が見えるように)");

console.log("battle/rubbleGeometry: 9種すべて面が外向き、上面の平らさが区分と一致、法面の向きが正しい");

// 障害物の色は「岩の質感の幅」であって信号ではない。彩度を上げると、
// 到達マスの青・攻撃対象の赤・手番の黄と紛れ、プレイヤーが色に規則を探す
{
  const hsl = hex => {
    const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = (max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    return { h, s, l };
  };
  const UI = { 到達マスの青: 0x3d7fb5, 攻撃対象の赤: 0xb5533d, 手番の黄: 0xf2df7e };
  for (const hex of RUBBLE_COLORS) {
    const c = hsl(hex), name = "#" + hex.toString(16).padStart(6, "0");
    assert.ok(c.s <= 0.30, `${name}: 彩度が高すぎる ${c.s.toFixed(2)}`);
    assert.ok(c.l >= 0.15 && c.l <= 0.45, `${name}: 明度が帯から外れる ${c.l.toFixed(2)}`);
    for (const [label, ui] of Object.entries(UI)) {
      const u = hsl(ui);
      const near = Math.abs(c.l - u.l) < 0.08 && c.s > u.s * 0.6;
      assert.ok(!near, `${name}: ${label} と紛れる`);
    }
  }
  // 個体ごとの明度は動くが、色相と彩度は乗算なので変わらない
  const tones = new Set();
  for (let seed = 0; seed < 200; seed++) tones.add(obstacleColor(seed).tone.toFixed(3));
  assert.ok(tones.size > 50, `明度のばらつきが少なすぎる (${tones.size}種)`);
  assert.ok([...tones].every(t => Math.abs(Number(t) - 1) <= 0.12 + 1e-9), "明度のばらつきが指定を超える");
  const picked = new Set();
  for (let seed = 0; seed < 400; seed++) picked.add(obstacleColor(seed).hex);
  assert.equal(picked.size, RUBBLE_COLORS.length, "色は全種類出る");
  assert.ok(obstacleColor(7, true).tone < obstacleColor(7).tone, "高さ1.0の柱・石板は暗く落とす");
}

console.log("battle/rubbleGeometry: 色は低彩度・同じ明度帯で、UIの色と紛れない");
