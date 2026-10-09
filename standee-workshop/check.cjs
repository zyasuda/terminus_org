// 状態遷移と合成順の検査。見た目の自然さは測らない（作者が画面で判断する）。
// 実行：node check.cjs
const assert = require('assert/strict');
const fs = require('fs'), path = require('path');
const W = require('./wardrobe.js');

const names = (s, v) => W.layers(s, v).map((l) => path.basename(l.src) + (l.clip ? (l.clip.x === 0 ? '#scabbard' : '#cuff') : '') + (l.crop ? (l.crop === W.CURVED.blade.crop ? '#blade' : '#hilt') : ''));
const HILTS = ['sheathed-front.png', 'sheathed-back.png', 'hand-sword-front.png', 'grip-back.png'];
let s = W.initialState();

// 素手：素体だけ
assert.deepEqual(names(s, 'front'), ['body-front.png']);
assert.deepEqual(names(s, 'back'), ['body-back.png']);
assert.equal(W.outfitLabel(s), '素手');

// 鞘を着けていなければ剣は鞘へ入らない
assert.equal(W.giveSword(s, 'scabbard'), s);

// 剣を手へ（鞘なし）：背面は刀身→素体→握り→袖口の順、素体に手のマスク
s = W.giveSword(s, 'hand');
assert.deepEqual(names(s, 'back'), ['blade-back.png', 'body-back.png', 'grip-back.png', 'scabbard-empty-and-cuff-back.png#cuff']);
assert.deepEqual(names(s, 'front'), ['body-front.png', 'hand-sword-front.png']);
assert.ok(W.layers(s, 'front')[0].mask && W.layers(s, 'back')[1].mask);

// 抜刀：空の鞘＋手の剣
s = W.wearScabbard(s);
assert.equal(W.outfitLabel(s), '抜刀');
assert.deepEqual(names(s, 'front'), ['body-front.png', 'scabbard-empty-front.png', 'hand-sword-front.png']);
assert.deepEqual(names(s, 'back'), ['blade-back.png', 'body-back.png', 'grip-back.png', 'scabbard-empty-and-cuff-back.png#scabbard', 'scabbard-empty-and-cuff-back.png#cuff']);

// 納刀：手は空、素体のマスクは外れる
const drawn = s;
s = W.sheathe(s);
assert.equal(W.outfitLabel(s), '納刀');
assert.deepEqual(names(s, 'front'), ['body-front.png', 'sheathed-front.png']);
assert.ok(!W.layers(s, 'front')[0].mask);
assert.deepEqual(W.draw(s), drawn);

// どの状態でも柄は1か所だけ（腰と手に同時に出ない）
for (const sword of ['shelf', 'hand', 'scabbard']) for (const scabbard of ['shelf', 'waist']) {
  if (sword === 'scabbard' && scabbard === 'shelf') continue;
  const st = { ...W.initialState(), sword, scabbard };
  for (const v of ['front', 'back']) assert.ok(names(st, v).filter((n) => HILTS.includes(n)).length <= 1, `${sword}/${scabbard}/${v}`);
}

// 鞘の調整：許容範囲で止まる。前後は独立。動かした面の反対が未確認になり、見たら消える
s = W.nudgeScabbard(s, 'front', 100, -5);
assert.deepEqual(s.offset.front, { x: W.SCABBARD_RANGE, y: -5 });
assert.deepEqual(s.offset.back, { x: 0, y: 0 });
assert.equal(s.unchecked, 'back');
assert.equal(W.nudgeScabbard(s, 'front', 1, 0), s, '上限では変化しない');
for (const l of W.layers(s, 'front')) if (l.src.endsWith('sheathed-front.png')) assert.equal(l.x, W.SCABBARD_RANGE);
for (const l of W.layers(s, 'back')) if (l.src.endsWith('sheathed-back.png')) assert.equal(l.x, 0);
s = W.setView(s, 'back');
assert.equal(s.unchecked, null);
// 抜刀へ切り替えても鞘の位置は同じ（空鞘も同じずれで描く）
const d = W.draw(s);
assert.equal(W.layers(d, 'front').find((l) => l.src.endsWith('scabbard-empty-front.png')).x, W.SCABBARD_RANGE);
// 袖口は鞘と一緒に動かない
const b2 = W.nudgeScabbard(W.setView(d, 'back'), 'back', -10, 0);
assert.equal(W.layers(b2, 'back').find((l) => l.clip && l.clip.x > 0).x, 0);

// 鞘を剣ごと外すと剣も棚へ。鞘が無いときは調整しない
const off = W.removeScabbard(s);
assert.equal(off.sword, 'shelf');
assert.equal(W.nudgeScabbard(off, 'front', 1, 1), off);

// 落とした位置で剣の行き先が決まる
const worn = W.wearScabbard(W.initialState());
assert.equal(W.swordTarget(worn, 'front', W.WAIST_POINT.front), 'scabbard');
assert.equal(W.swordTarget(worn, 'front', W.HAND_POINT.front), 'hand');
assert.equal(W.swordTarget(W.initialState(), 'front', W.WAIST_POINT.front), 'hand');
assert.ok(W.hitScabbard(worn, 'back', W.WAIST_POINT.back));
assert.ok(!W.hitScabbard(W.initialState(), 'back', W.WAIST_POINT.back));

// 操作カード：着けている品だけ出す。剣は今の状態でできることだけ並べる
const bare = W.initialState();
assert.equal(W.cardActions(bare, 'sword'), null);
assert.equal(W.cardActions(bare, 'scabbard'), null);
assert.deepEqual(W.cardActions(W.giveSword(bare, 'hand'), 'sword'), ['return']);
assert.deepEqual(W.cardActions(drawn, 'sword'), ['sheathe', 'return']);
assert.deepEqual(W.cardActions(W.sheathe(drawn), 'sword'), ['draw', 'return']);
assert.deepEqual(W.cardActions(drawn, 'scabbard'), ['return']);
assert.equal(W.cardActions(W.removeScabbard(drawn), 'scabbard'), null, '棚へ戻したらカードは出ない');
// カードの操作で状態が順に移る：抜刀→納刀→抜刀→剣を棚へ→鞘を棚へ
let t = W.sheathe(drawn);
assert.equal(t.sword, 'scabbard');
t = W.draw(t);
assert.deepEqual(t, drawn);
t = W.returnSword(t);
assert.equal(W.outfitLabel(t), '鞘だけ（剣は棚）');
assert.equal(W.cardActions(t, 'sword'), null);
assert.equal(W.outfitLabel(W.removeScabbard(t)), '素手');

// 人物の上で押した品。手は剣を持っているときだけ、鞘は着けているときだけ
for (const v of ['front', 'back']) {
  assert.equal(W.hitItem(drawn, v, W.HAND_POINT[v]), 'sword', v);
  assert.equal(W.hitItem(drawn, v, W.WAIST_POINT[v]), 'scabbard', v);
  assert.equal(W.hitItem(W.sheathe(drawn), v, W.HAND_POINT[v]), null, `${v}: 納刀中の手は空`);
  assert.equal(W.hitItem(bare, v, W.WAIST_POINT[v]), null, `${v}: 素手`);
  assert.equal(W.hitItem(drawn, v, { x: 0, y: 0 }), null);
}
// ずらした鞘は、ずらした先で拾い、カードもそこに出る
const moved = W.nudgeScabbard(drawn, 'front', W.SCABBARD_RANGE, 0);
assert.deepEqual(W.itemPoint(moved, 'front', 'scabbard'), { x: W.WAIST_POINT.front.x + W.SCABBARD_RANGE, y: W.WAIST_POINT.front.y });
assert.deepEqual(W.itemPoint(moved, 'front', 'sword'), W.HAND_POINT.front);
assert.deepEqual(W.itemPoint(W.sheathe(moved), 'front', 'sword'), W.itemPoint(moved, 'front', 'scabbard'), '納刀中の剣は鞘の位置');

// クリックとドラッグの判別：DRAG_SLOP(6px)未満の動きはクリック
const o0 = { x: 100, y: 100 };
assert.equal(W.isDrag(o0, o0), false);
assert.equal(W.isDrag(o0, { x: 103, y: 104 }), false, '5px はクリック');
assert.equal(W.isDrag(o0, { x: 106, y: 100 }), true, '6px はドラッグ');

// 参照する素材はこのフォルダにある（旧試作のフォルダを見に行かない）
const srcs = new Set();
for (const sword of ['hand', 'scabbard']) for (const v of ['front', 'back']) for (const l of W.layers({ ...worn, sword }, v)) srcs.add(l.src);
for (const src of srcs) assert.ok(fs.existsSync(path.join(__dirname, src)), src);
assert.ok(![...srcs].some((p) => p.includes('..')));
for (const f of ['index.html', 'app.js']) assert.ok(!fs.readFileSync(path.join(__dirname, f), 'utf8').includes('trpg-gm-mock3'), f);

// ── 反りのある片手剣：剣と鞘は組で替わる。2組×剣3×鞘2×前後（鞘なしの納刀は除く） ──
const C = W.CURVED, CS = C.sword, CB = C.scabbard;
const HF = C.handFront, GB = C.gripBack;
const STRAIGHT_ONLY = ['sheathed-front.png', 'sheathed-back.png', 'scabbard-empty-front.png', 'hand-sword-front.png', 'grip-back.png', 'blade-back.png', 'scabbard-empty-and-cuff-back.png#scabbard'];
const SET_HILTS = [...HILTS, HF, GB, CS + '#hilt'];
// 反りのある組の合成順。手は新しい握りの絵、背面の刀身（#blade）は体の奥。納刀は鞘＋柄の切り出し（#hilt）
const CURVED_WANT = {
  'shelf/shelf': [['body-front.png'], ['body-back.png']],
  'shelf/waist': [['body-front.png', CB], ['body-back.png', CB]],
  'hand/shelf': [['body-front.png', HF], [CS + '#blade', 'body-back.png', GB, 'scabbard-empty-and-cuff-back.png#cuff']],
  'hand/waist': [['body-front.png', CB, HF], [CS + '#blade', 'body-back.png', GB, CB, 'scabbard-empty-and-cuff-back.png#cuff']],
  'scabbard/waist': [['body-front.png', CB, CS + '#hilt'], ['body-back.png', CB, CS + '#hilt']],
};
assert.equal(W.initialState().swordSet, 'straight');
let combos = 0;
for (const swordSet of W.SWORD_SETS) for (const sword of ['shelf', 'hand', 'scabbard']) for (const scabbard of ['shelf', 'waist']) for (const v of ['front', 'back']) {
  if (sword === 'scabbard' && scabbard === 'shelf') continue;
  combos++;
  const st = { ...W.initialState(), swordSet, sword, scabbard, view: v }, snap = JSON.stringify(st), tag = `${swordSet}/${sword}/${scabbard}/${v}`;
  const ns = names(st, v), swap = swordSet === 'curved' ? 'straight' : 'curved';
  if (swordSet === 'curved') assert.deepEqual(ns, CURVED_WANT[`${sword}/${scabbard}`][v === 'front' ? 0 : 1], tag);
  else assert.ok(!ns.some((n) => n.startsWith(CS) || [CB, HF, GB].includes(n)), `${tag} 通常の組に反りの素材を出さない`);
  if (swordSet === 'curved') assert.ok(!ns.some((n) => STRAIGHT_ONLY.includes(n)), `${tag} 旧剣・旧鞘を出さない`);
  assert.equal(ns.filter((n) => SET_HILTS.includes(n)).length, sword === 'shelf' ? 0 : 1, `${tag} 柄はちょうど1か所`);
  // 切替は組だけ替える。居場所・ずれ・向きはそのまま、元の state は変えない（取り消しに必要）
  const sw = W.setSwordSet(st, swap);
  assert.deepEqual(sw, { ...st, swordSet: swap }, tag);
  assert.equal(W.setSwordSet(st, swordSet), st, `${tag} 同じ組は変化なし`);
  assert.equal(W.setSwordSet(st, 'katana'), st, `${tag} 知らない組は変化なし`);
  assert.deepEqual(W.setSwordSet(sw, swordSet), st, `${tag} 戻すと元どおり`);
  assert.equal(JSON.stringify(st), snap, `${tag} 元の state を変えない`);
  // 組で変わらないもの：素体（手のマスク＝表示寸法）、表示名、カード、当たり
  const body = (x) => W.layers(x, v).find((l) => l.src.endsWith(`body-${v}.png`));
  assert.deepEqual(body(sw), body(st), `${tag} 素体は同じ`);
  assert.equal(W.outfitLabel(sw), W.outfitLabel(st));
  for (const item of W.ITEMS) assert.deepEqual(W.cardActions(sw, item), W.cardActions(st, item), `${tag} ${item}`);
  for (const p of [W.HAND_POINT[v], W.WAIST_POINT[v]]) assert.equal(W.hitItem(sw, v, p), W.hitItem(st, v, p), tag);
}
assert.equal(combos, 20);
// 反りのある組の遷移：抜刀→納刀→抜刀→鞘を剣ごと外す。組はずっと反りのまま
let cv = W.setSwordSet(W.wearScabbard(W.giveSword(W.initialState(), 'hand')), 'curved');
const cvDrawn = cv;
cv = W.sheathe(cv);
assert.deepEqual([cv.sword, cv.swordSet], ['scabbard', 'curved']);
assert.deepEqual(W.draw(cv), cvDrawn);
const cvOff = W.removeScabbard(cv);
assert.deepEqual([cvOff.sword, cvOff.scabbard, cvOff.swordSet], ['shelf', 'shelf', 'curved'], '鞘を外すと剣も棚へ、組はそのまま');
// 取り消し（app.js と同じく前の state を向きだけ今に合わせて戻す）
const hist = [cvDrawn];
const back1 = W.setView(hist.pop(), 'back');
assert.deepEqual(back1, { ...cvDrawn, view: 'back' });
const hist2 = [W.initialState()], afterSwap = W.setSwordSet(hist2[0], 'curved');
assert.equal(W.setView(hist2.pop(), afterSwap.view).swordSet, 'straight', '切替を取り消すと元の組');
// 反りのある鞘と柄の切り出しは鞘のずれと一緒に動く（前後独立）
const cvMoved = W.nudgeScabbard(W.sheathe(cvDrawn), 'front', 10, -4);
for (const l of W.layers(cvMoved, 'front')) if (l.src.endsWith(CB) || l.crop) {
  const base = l.crop ? C.hilt.front : C.scabbardAt.front;
  assert.deepEqual([l.x, l.y], [base.x + 10, base.y - 4]);
}
for (const l of W.layers(cvMoved, 'back')) if (l.src.endsWith(CB)) assert.equal(l.x, C.scabbardAt.back.x, '背面は動かない');
// ── 反りのある組の配置。drawLayer と同じ変換で元画像の点をキャンバスへ写して確かめる（座標は素材の alpha を測った値） ──
const pngSize = (f) => { const b = fs.readFileSync(path.join(__dirname, f)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const toCanvas = (l, [px, py]) => {
  const c = l.crop || { x: 0, y: 0, ...pngSize(l.src) }, f = l.flip ? -1 : 1, a = l.rotation * Math.PI / 180;
  const dx = f * l.scale * (px - c.x - c.w / 2), dy = l.scale * (py - c.y - c.h / 2);
  return { x: l.x + c.w / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: l.y + c.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inPoly = (poly, [x, y]) => {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
};
const find = (st, v, name) => W.layers(st, v)[names(st, v).indexOf(name)];
// 素材はすべて読め、手の2枚は旧素材と同じ寸法（同じ変換で手が同じ位置に来る。背面は1px差まで）
for (const f of [CS, CB, HF, GB]) assert.ok(fs.existsSync(path.join(__dirname, W.DIR, f)), f);
for (const sword of ['hand', 'scabbard']) for (const v of ['front', 'back']) for (const l of W.layers({ ...worn, swordSet: 'curved', sword }, v)) assert.ok(fs.existsSync(path.join(__dirname, l.src)), l.src);
assert.deepEqual(pngSize(W.DIR + HF), pngSize(W.DIR + 'hand-sword-front.png'));
const gbs = pngSize(W.DIR + GB), gbo = pngSize(W.DIR + 'grip-back.png');
assert.ok(Math.abs(gbs.w - gbo.w) <= 1 && Math.abs(gbs.h - gbo.h) <= 1, `${JSON.stringify(gbs)} / ${JSON.stringify(gbo)}`);
const cvBack = { ...cvDrawn, view: 'back' };
const hf = find(cvDrawn, 'front', HF), gb = find(cvBack, 'back', GB), blade = find(cvBack, 'back', CS + '#blade');
for (const [l, g] of [[hf, W.GRIP.front], [gb, W.GRIP.back.grip]]) assert.deepEqual([l.x, l.y, l.rotation, l.scale], [g.x, g.y, g.rotation, g.scale], `${l.src} は旧素材と同じ変換`);
// 背面の刀身：柄・鍔は描かない（柄頭・鍔の中心は cut の外、刀身は内）。切り口の中心は新しい握りの鍔(425,825)に1px以内
for (const p of [[40, 65], [404, 326], [465, 250], [340, 400]]) assert.ok(!inPoly(C.blade.cut, p), `刀身に柄・鍔 ${p}`);
for (const p of [[480, 385], [900, 710], [1500, 990]]) assert.ok(inPoly(C.blade.cut, p), `刀身 ${p}`);
const tsubaBack = toCanvas(gb, [425, 825]);
assert.ok(dist(toCanvas(blade, [472, 382]), tsubaBack) < 1, `刀身の根元 ${JSON.stringify(toCanvas(blade, [472, 382]))} / 鍔 ${JSON.stringify(tsubaBack)}`);
// 刀身の長さは正面と同じくらい（正面：鍔(330,480)→切先(1141,1288)、背面：鍔→切先(1512,995)）
const lenFront = dist(toCanvas(hf, [330, 480]), toCanvas(hf, [1141, 1288])), lenBack = dist(tsubaBack, toCanvas(blade, [1512, 995]));
assert.ok(Math.abs(lenBack / lenFront - 1) < 0.1, `刀身の長さ 正面${lenFront.toFixed(0)} 背面${lenBack.toFixed(0)}`);
// 鞘：口(80,152)が WAIST_POINT へ、口→先端(1510,985)の表示の長さ380〜420px、先端は下向き（口より下）
const cvSheathed = W.sheathe(cvDrawn);
for (const v of ['front', 'back']) {
  const st = { ...cvSheathed, view: v }, sc = find(st, v, CB), hilt = find(st, v, CS + '#hilt');
  const mouth = toCanvas(sc, [80, 152]), tip = toCanvas(sc, [1510, 985]);
  assert.ok(dist(mouth, W.WAIST_POINT[v]) < 1, `${v} 鞘の口 ${JSON.stringify(mouth)}`);
  assert.ok(dist(mouth, tip) >= 380 && dist(mouth, tip) <= 420, `${v} 鞘の長さ ${dist(mouth, tip).toFixed(0)}`);
  assert.ok(tip.y - mouth.y > 350, `${v} 鞘は下向き`);
  // 吊り革の先(355,18)・(575,185)は鞘より体の中心側（正面は左、背面は右）
  for (const p of [[355, 18], [575, 185]]) {
    const q = toCanvas(sc, p);
    assert.ok(v === 'front' ? q.x < mouth.x : q.x > mouth.x, `${v} 吊り革 ${p} → ${q.x.toFixed(0)}`);
  }
  // 納刀の柄：鞘と同じ向き・倍率・反転で、鍔の刀身側(432,347)が鞘の口に1px以内（同軸）。刀身は cut の外
  assert.deepEqual([hilt.rotation, hilt.scale, !!hilt.flip], [sc.rotation, sc.scale, !!sc.flip], `${v} 柄と鞘は同じ向き`);
  assert.ok(dist(toCanvas(hilt, [432, 347]), mouth) < 1, `${v} 柄の鍔が鞘の口`);
  assert.ok(dist(toCanvas(hilt, [40, 65]), mouth) > 80, `${v} 柄頭は鞘の口から外へ出る`);
  for (const p of [[40, 65], [404, 326], [465, 250], [340, 400]]) assert.ok(inPoly(C.hilt.cut, p), `${v} 柄・鍔 ${p}`);
  for (const p of [[480, 385], [462, 385], [900, 710]]) assert.ok(!inPoly(C.hilt.cut, p), `${v} 刀身・はばきは鞘の外に描かない ${p}`);
}
for (const [what, c] of [['柄', C.hilt.crop], ['刀身', C.blade.crop]]) {
  const cs = pngSize(W.DIR + CS);
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= cs.w && c.y + c.h <= cs.h, `${what}の切り出しが剣の画像の内側`);
}
console.log(`curved sword check: ok (${combos} states, blade ${lenBack.toFixed(0)}px / front ${lenFront.toFixed(0)}px)`);

// ── マレン：手持ちは1つ。杖とランタンは持ち替え、何も持たないも選べる ──
const M = W.maren;
let m = M.initialState();
assert.equal(m.hold, null);
assert.equal(M.outfitLabel(m), '何も持たない');
assert.ok(M.isOut(m, 'none') && !M.isOut(m, 'staff') && !M.isOut(m, 'lantern'));
m = M.hold(m, 'staff');
assert.equal(M.outfitLabel(m), '杖を手に');
assert.equal(M.hold(m, 'staff'), m, '同じ品は変化なし');
m = M.hold(m, 'lantern');
assert.equal(m.hold, 'lantern', '杖とランタンは排他');
assert.ok(M.isOut(m, 'lantern') && !M.isOut(m, 'staff'));
assert.equal(M.outfitLabel(M.hold(m, null)), '何も持たない');
// ガレスの品はマレンの棚に無く、マレンの絵にガレスの素材は出ない。職業・能力値の項目は持たない
assert.deepEqual(M.ITEMS, ['staff', 'lantern', 'necklace']);
assert.ok(!M.ITEMS.includes('sword') && !M.ITEMS.includes('scabbard'));
assert.deepEqual(Object.keys(M.initialState()).sort(), ['hold', 'necklace', 'outfit', 'view']);
// 各姿は1枚の全身絵だけ（手の合成なし）。頭頂・頭の中心は同じ座標へ写る
for (const hold of [null, 'staff', 'lantern']) for (const v of ['front', 'back']) {
  const ls = M.layers({ hold, view: v }, v);
  assert.equal(ls.length, 1, `${hold}/${v}`);
  assert.ok(ls[0].src.startsWith(W.MAREN_DIR) && fs.existsSync(path.join(__dirname, ls[0].src)), ls[0].src);
  const src = M.MAREN_SRC[hold || 'none'][v];
  for (const [p, want] of [[{ x: src.headX, y: src.headTop }, { x: M.MAREN_X, y: M.MAREN_TOP }], [{ x: src.headX, y: src.footY }, { x: M.MAREN_X, y: M.MAREN_FOOT }]]) {
    const q = M.marenPoint(src, p);
    assert.ok(Math.abs(q.x - want.x) < 1e-9 && Math.abs(q.y - want.y) < 1e-9, `${hold}/${v} ${JSON.stringify(q)}`);
  }
}
// 杖姿は板の外枠が無い元絵。背面も元のまま（反転しない）で、杖を持つ手は画面右＝右手側
assert.deepEqual([M.MAREN_SRC.staff.front.src, M.MAREN_SRC.staff.back.src], ['staff-front-source.png', 'staff-back-source.png']);
for (const v of ['front', 'back']) assert.ok(!('flip' in M.layers({ hold: 'staff', necklace: false }, v)[0]), v);
assert.ok(M.itemPoint(M.hold(M.initialState(), 'staff'), 'back').x > M.MAREN_X, '背面の杖は画面右');
assert.ok(M.itemPoint(M.hold(M.initialState(), 'staff'), 'front').x < M.MAREN_X, '正面の杖は画面左');

// ── 首飾り：手持ちと独立。正面だけ胸元に描き、背面は髪に隠れるので描かない ──
let n = M.wear(M.initialState(), true);
assert.equal(M.wear(n, true), n, '着けたまま着けても変化なし');
assert.ok(M.isOut(n, 'necklace') && M.isOut(n, 'none'));
assert.equal(M.outfitLabel(n), '何も持たない・琥珀の首飾り');
assert.equal(M.outfitLabel(M.setView(n, 'back')), '何も持たない・琥珀の首飾り（背面では髪に隠れて見えません）', '背面でも着けていると分かる');
for (const hold of [null, 'staff', 'lantern', 'staff', null]) {
  n = M.hold(n, hold);
  assert.equal(n.necklace, true, `${hold} に持ち替えても着けたまま`);
  const front = M.layers(n, 'front'), back = M.layers(n, 'back');
  assert.deepEqual(front.map((l) => path.basename(l.src)), [M.MAREN_SRC[hold || 'none'].front.src, 'amber-necklace-v1.png'], `${hold} 正面は人物の上に首飾り`);
  assert.equal(back.length, 1, `${hold} 背面は首飾りを描かない`);
  assert.ok(!back.some((l) => l.src.includes('necklace')));
  // 宝石は neck の点へ、幅は画面キャンバス上で110〜130px
  const l = front[1], p = M.itemPoint(n, 'front', 'necklace');
  const gem = { x: l.x + M.NECKLACE.w / 2 + l.scale * (M.NECKLACE.pendant.x - M.NECKLACE.w / 2), y: l.y + M.NECKLACE.h / 2 + l.scale * (M.NECKLACE.pendant.y - M.NECKLACE.h / 2) };
  assert.ok(Math.abs(gem.x - p.x) < 1e-9 && Math.abs(gem.y - p.y) < 1e-9, `${hold} 宝石の位置`);
  assert.ok(M.NECKLACE.w * l.scale >= 110 && M.NECKLACE.w * l.scale <= 130, `${hold} 幅 ${M.NECKLACE.w * l.scale}`);
  assert.ok(p.y > M.MAREN_TOP + 200 && p.y < M.MAREN_TOP + 400 && Math.abs(p.x - M.MAREN_X) < 40, `${hold} 胸元 ${JSON.stringify(p)}`);
  // 胸元を押すと首飾り（正面だけ）。手持ちの当たりとは重ならない
  assert.equal(M.hitItem(n, 'front', p), 'necklace');
  assert.equal(M.hitItem(n, 'back', M.itemPoint(n, 'back', 'necklace')), null, '背面の首飾りは押せない');
  if (hold) assert.equal(M.hitItem(n, 'front', M.itemPoint(n, 'front')), hold);
  assert.deepEqual(M.cardActions(n, 'necklace'), ['remove']);
}
const off2 = M.wear(n, false);
assert.equal(off2.necklace, false);
assert.equal(M.cardActions(off2, 'necklace'), null);
assert.equal(M.itemPoint(off2, 'front', 'necklace'), null);
assert.equal(M.hitItem(off2, 'front', M.itemPoint(n, 'front', 'necklace')), null);
assert.equal(M.hold(off2, 'lantern').necklace, false, '外したまま持ち替えても外したまま');
assert.ok(fs.existsSync(path.join(__dirname, M.NECKLACE.src)));
// カード：持っている品だけ。押した位置で拾う
for (const v of ['front', 'back']) {
  assert.equal(M.cardActions(M.initialState(), 'staff'), null);
  for (const item of ['staff', 'lantern']) {
    const st = M.hold(M.initialState(), item), p = M.itemPoint(st, v);
    assert.deepEqual(M.cardActions(st, item), ['return']);
    assert.equal(M.hitItem(st, v, p), item, `${item}/${v}`);
    assert.equal(M.hitItem(st, v, { x: 0, y: 0 }), null);
    assert.ok(p.x > 0 && p.x < W.WIDTH && p.y > 0 && p.y < W.HEIGHT, `${item}/${v} の手がキャンバス内`);
  }
  assert.equal(M.itemPoint(M.initialState(), v), null);
}
// 杖は右手を上げた元の姿勢、ランタンは下げた姿勢のまま：杖の手はランタンの手より上
for (const v of ['front', 'back']) assert.ok(M.itemPoint(M.hold(m, 'staff'), v).y < M.itemPoint(M.hold(m, 'lantern'), v).y - 100, v);
for (const f of ['index.html', 'app.js', 'wardrobe.js']) assert.ok(!fs.readFileSync(path.join(__dirname, f), 'utf8').includes('trpg-gm-mock3'), f);

// ── 黒の旅装：衣装×手持ち3×首飾り×前後。衣装は他の3つと独立で、遷移は元の state を変えない（取り消しに必要） ──
assert.equal(M.initialState().outfit, 'normal');
let darkPoses = 0;
for (const outfit of ['normal', 'dark']) for (const hold of [null, 'staff', 'lantern']) for (const necklace of [false, true]) for (const view of ['front', 'back']) {
  const st = { outfit, hold, necklace, view }, snap = JSON.stringify(st), tag = `${outfit}/${hold}/${necklace}/${view}`;
  const swap = outfit === 'dark' ? 'normal' : 'dark';
  assert.equal(M.dress(st, outfit), st, `${tag} 同じ衣装は変化なし`);
  assert.deepEqual(M.dress(st, swap), { ...st, outfit: swap }, `${tag} 着替えても手持ち・首飾り・向きはそのまま`);
  assert.deepEqual(M.dress(M.dress(st, swap), outfit), st, `${tag} 着替えを戻すと元どおり`);
  for (const h of [null, 'staff', 'lantern']) assert.equal(M.hold(st, h).outfit, outfit, `${tag} 持ち替えても衣装はそのまま`);
  assert.equal(M.wear(st, !necklace).outfit, outfit, `${tag} 首飾りを着け外ししても衣装はそのまま`);
  assert.equal(M.setView(st, view === 'front' ? 'back' : 'front').outfit, outfit);
  assert.equal(JSON.stringify(st), snap, `${tag} 元の state を変えない`);
  assert.equal(M.outfitLabel(st).startsWith('黒の旅装・'), outfit === 'dark', tag);
  if (outfit === 'dark' && !M.MAREN_DARK_SRC[hold || 'none']) continue;   // 素材待ちの姿は描かない
  if (outfit === 'dark') darkPoses++;
  // 絵：衣装の元絵1枚（＋正面だけ首飾り）。頭頂・足裏・頭の中心は通常と同じ座標＝173cm共通の倍率
  const ls = M.layers(st, view), file = path.basename(ls[0].src), src = (outfit === 'dark' ? M.MAREN_DARK_SRC : M.MAREN_SRC)[hold || 'none'][view];
  assert.equal(ls.length, view === 'front' && necklace ? 2 : 1, `${tag} 層の数（背面の首飾りは描かない）`);
  assert.equal(file.startsWith('dark-'), outfit === 'dark', `${tag} ${file}`);
  if (outfit === 'dark') assert.equal(file, M.MAREN_DARK_FILES[hold || 'none'], `${tag} 指定の素材だけ使う`);
  assert.ok(fs.existsSync(path.join(__dirname, ls[0].src)), ls[0].src);
  for (const [p, want] of [[{ x: src.headX, y: src.headTop }, { x: M.MAREN_X, y: M.MAREN_TOP }], [{ x: src.headX, y: src.footY }, { x: M.MAREN_X, y: M.MAREN_FOOT }]]) {
    const q = M.marenPoint(src, p);
    assert.ok(Math.abs(q.x - want.x) < 1e-9 && Math.abs(q.y - want.y) < 1e-9, `${tag} ${JSON.stringify(q)}`);
  }
  // 当たり：首飾りは正面の胸元だけ、手持ちは手元
  const np = M.itemPoint(st, view, 'necklace');
  if (necklace && view === 'front') {
    assert.equal(M.hitItem(st, view, np), 'necklace', tag);
    assert.ok(np.y > M.MAREN_TOP + 200 && np.y < M.MAREN_TOP + 400 && Math.abs(np.x - M.MAREN_X) < 40, `${tag} 胸元 ${JSON.stringify(np)}`);
  } else if (necklace) assert.notEqual(M.hitItem(st, view, np), 'necklace', `${tag} 背面の首飾りは押せない`);
  if (hold) {
    const hp = M.itemPoint(st, view);
    assert.equal(M.hitItem(st, view, hp), hold, tag);
    assert.ok(hp.x > 0 && hp.x < W.WIDTH && hp.y > 0 && hp.y < W.HEIGHT, `${tag} 手がキャンバス内`);
  }
}
// 黒の6姿は人物の左右（measure-maren-dark.cjs の bbox）がキャンバス幅に収まり、crop の内側にある
const DARK_BBOX = { 'none/front': [32, 589], 'none/back': [669, 1232], 'staff/front': [23, 603], 'staff/back': [652, 1231], 'lantern/front': [48, 605], 'lantern/back': [669, 1222] };
for (const [k, [x0, x1]] of Object.entries(DARK_BBOX)) {
  const [hold, v] = k.split('/'), m = M.MAREN_DARK_SRC[hold] && M.MAREN_DARK_SRC[hold][v];
  if (!m) continue;
  const l = M.marenPoint(m, { x: x0, y: m.footY }).x, r = M.marenPoint(m, { x: x1, y: m.footY }).x;
  assert.ok(l > 0 && r < W.WIDTH, `dark ${k} 左右 ${l.toFixed(1)}-${r.toFixed(1)}`);
  assert.ok(x0 >= m.crop.x && x1 < m.crop.x + m.crop.w, `dark ${k} 人物が crop の内側`);
}
// 素材が揃うまで黒は押せない（app.js は darkReady でボタンを止める）。揃ったら黒の12通り（手持ち3×首飾り×前後）すべて描く
assert.equal(M.darkReady, darkPoses === 12, `darkReady ${M.darkReady} / 黒の姿 ${darkPoses}`);
for (const [hold, file] of Object.entries(M.MAREN_DARK_FILES)) if (M.MAREN_DARK_SRC[hold]) assert.ok(fs.existsSync(path.join(__dirname, W.MAREN_DIR, file)), file);
console.log(`maren dark check: ok (24 states, ${darkPoses}/12 dark states drawable${M.darkReady ? '' : ', waiting for assets'})`);

// ── ブロム：右手（金槌・手斧・空）と盾（左腕）は独立に着け外し。6状態×前後の12姿 ──
const B = W.brom;
// 右手,盾 → 姿
const BKEYS = { 'none,false': 'empty', 'hammer,false': 'hammer', 'none,true': 'shield', 'hammer,true': 'both', 'axe,false': 'axe', 'axe,true': 'axeShield' };
let br = B.initialState();
assert.deepEqual(br, { hammer: false, shield: false, axe: false, view: 'front' });
assert.deepEqual(Object.keys(br).sort(), ['axe', 'hammer', 'shield', 'view'], '状態は3つの真偽値と向きだけ');
assert.deepEqual(B.ITEMS, ['hammer', 'shield', 'axe']);
assert.equal(B.outfitLabel(br), '素手');
assert.equal(B.wear(br, 'hammer', false), br, '着けていない品を外しても変化なし');
br = B.wear(br, 'hammer', true);
assert.equal(B.wear(br, 'hammer', true), br, '着けたまま着けても変化なし');
assert.equal(B.outfitLabel(br), '金槌だけ');
br = B.wear(br, 'shield', true);
assert.equal(B.outfitLabel(br), '金槌と盾');
assert.equal(br.hammer, true, '盾を着けても金槌はそのまま');
assert.equal(B.outfitLabel(B.wear(br, 'hammer', false)), '盾だけ', '金槌だけ外すと盾は残る');
assert.equal(B.wear(br, 'shield', false).hammer, true, '盾だけ外すと金槌は残る');
// 取り消しに必要なもの：遷移は元の state を変えない（app.js は前の state を履歴に積むだけ）
const before = B.initialState(), frozen = JSON.stringify(before);
B.wear(B.wear(before, 'hammer', true), 'shield', true);
assert.equal(JSON.stringify(before), frozen, '遷移で元の state を書き換えない');
assert.deepEqual(B.setView(br, 'back'), { ...br, view: 'back' });
// 12姿：どれも1枚の全身絵。素材はこのフォルダにあり、頭頂・足裏・頭の中心が同じ座標へ写る
const bromSrcs = new Set();
for (const hand of ['none', 'hammer', 'axe']) for (const shield of [false, true]) for (const v of ['front', 'back']) {
  const st = { hammer: hand === 'hammer', shield, axe: hand === 'axe', view: v }, key = BKEYS[`${hand},${shield}`], tag = `${key}/${v}`;
  assert.equal(B.bromKey(st), key, tag);
  const ls = B.layers(st, v);
  assert.equal(ls.length, 1, tag);
  assert.ok(ls[0].src.startsWith(W.BROM_DIR) && fs.existsSync(path.join(__dirname, ls[0].src)), ls[0].src);
  assert.equal(ls[0].filter, B.BROM_FILTER, `${tag} 全姿同じ色調補正`);
  assert.ok(ls[0].src.includes('muted-'), `${tag} 全姿は承認した質感の系列`);
  assert.ok(!('flip' in ls[0]) && !('centerX' in B.BROM_SRC[key][v]), `${tag} 反転・個別の中心なし`);
  bromSrcs.add(`${ls[0].src}#${ls[0].crop.x}`);
  const src = B.BROM_SRC[key][v];
  for (const [p, want] of [[{ x: src.headX, y: src.headTop }, { x: B.BROM_X, y: B.BROM_TOP }], [{ x: src.headX, y: src.footY }, { x: B.BROM_X, y: B.BROM_FOOT }]]) {
    const q = B.bromPoint(src, p);
    assert.ok(Math.abs(q.x - want.x) < 1e-9 && Math.abs(q.y - want.y) < 1e-9, `${tag} ${JSON.stringify(q)}`);
  }
  // 層の左上は、crop の中心で縮尺したとき頭の中心・頭頂が BROM_X・BROM_TOP に来る位置
  const l = ls[0], c = l.crop, at = (sx, sy) => ({ x: l.x + c.w / 2 + l.scale * (sx - c.x - c.w / 2), y: l.y + c.h / 2 + l.scale * (sy - c.y - c.h / 2) });
  const h = at(src.headX, src.headTop);
  assert.ok(Math.abs(h.x - B.BROM_X) < 1e-9 && Math.abs(h.y - B.BROM_TOP) < 1e-9, `${tag} 層の位置 ${JSON.stringify(h)}`);
  // 着けている品だけ位置を持ち、そこを押すとその品。カードは「棚へ戻す」だけ
  for (const item of B.ITEMS) {
    const p = B.itemPoint(st, v, item);
    if (!st[item]) { assert.equal(p, null, `${tag} ${item}`); assert.equal(B.cardActions(st, item), null); assert.ok(!B.isOut(st, item)); continue; }
    assert.ok(B.isOut(st, item));
    assert.ok(p.x > 0 && p.x < W.WIDTH && p.y > B.BROM_TOP && p.y < B.BROM_FOOT, `${tag} ${item} がキャンバス内 ${JSON.stringify(p)}`);
    assert.equal(B.hitItem(st, v, p), item, `${tag} ${item} を押す`);
    assert.deepEqual(B.cardActions(st, item), ['return']);
  }
  assert.equal(B.hitItem(st, v, { x: B.BROM_X, y: B.BROM_TOP }), null, `${tag} 頭は品ではない`);
}
assert.equal(bromSrcs.size, 12, '12姿は別々の絵（同じ元絵は crop で正面・背面を分ける）');
// 正面は画面左＝右手の金槌・手斧・画面右＝左腕の盾。背面は左右が入れ替わる（元から自然な背面）
for (const st of [{ hammer: true, shield: true }, { axe: true, shield: true }]) {
  const r = st.hammer ? 'hammer' : 'axe';
  assert.ok(B.itemPoint(st, 'front', r).x < B.BROM_X && B.itemPoint(st, 'front', 'shield').x > B.BROM_X, `${r} 正面の左右`);
  assert.ok(B.itemPoint(st, 'back', r).x > B.BROM_X && B.itemPoint(st, 'back', 'shield').x < B.BROM_X, `${r} 背面の左右`);
}
// どの姿もキャンバスの幅と高さに収まる（元絵の人物範囲＝measure-brom.cjs の bbox を写して確かめる）
const BBOX = {
  "empty/front": [
    209,
    790
  ],
  "empty/back": [
    912,
    1487
  ],
  "hammer/front": [
    52,
    781
  ],
  "hammer/back": [
    917,
    1628
  ],
  "shield/front": [
    215,
    821
  ],
  "shield/back": [
    902,
    1480
  ],
  "both/front": [
    54,
    822
  ],
  "both/back": [
    903,
    1626
  ],
  "axe/front": [
    72,
    788
  ],
  "axe/back": [
    913,
    1608
  ],
  "axeShield/front": [
    73,
    819
  ],
  "axeShield/back": [
    903,
    1606
  ]
};
for (const [k, [x0, x1]] of Object.entries(BBOX)) {
  const [key, v] = k.split('/'), m = B.BROM_SRC[key][v];
  const l = B.bromPoint(m, { x: x0, y: m.footY }).x, r = B.bromPoint(m, { x: x1, y: m.footY }).x;
  assert.ok(l > 0 && r < W.WIDTH - 1, `${k} 左右 ${l.toFixed(1)}-${r.toFixed(1)}`);
  assert.ok(x0 >= m.crop.x && x1 < m.crop.x + m.crop.w, `${k} 人物が crop の内側`);
}
// ガレス・マレンの品はブロムの棚に無い。ブロムの絵に他の俳優の素材は出ない
assert.ok(!B.ITEMS.some((i) => W.ITEMS.includes(i) || M.ITEMS.includes(i)));
for (const f of ['index.html', 'app.js', 'wardrobe.js']) assert.ok(!fs.readFileSync(path.join(__dirname, f), 'utf8').includes('trpg-gm-mock3'), f);

// ── ブロムの手斧：右手は金槌／手斧／空のどれか。盾は右手と独立 ──
const ax = (s) => [s.hammer, s.shield, s.axe];
const all4 = [[false, false], [true, false], [false, true], [true, true]].map(([hammer, shield]) => ({ hammer, shield, axe: false, view: 'front' }));
for (const st of all4) {
  const snap = JSON.stringify(st), a = B.wear(st, 'axe', true);
  assert.deepEqual(ax(a), [false, st.shield, true], `${B.bromKey(st)} → 手斧を持つと金槌だけ棚へ・盾はそのまま`);
  assert.equal(B.outfitLabel(a), st.shield ? '手斧と盾' : '手斧だけ');
  assert.equal(JSON.stringify(st), snap, '元の state は変えない（取り消しに必要）');
}
const axed = B.wear(B.initialState(), 'axe', true), axeShield = B.wear(axed, 'shield', true);
assert.equal(B.wear(axed, 'axe', true), axed, '持ったまま持たせても変化なし');
assert.deepEqual(ax(axeShield), [false, true, true], '手斧中に盾を着けても手斧は持ったまま');
assert.equal(B.outfitLabel(axeShield), '手斧と盾');
assert.deepEqual(ax(B.wear(B.wear(B.initialState(), 'shield', true), 'axe', true)), [false, true, true], '盾を着けてから手斧を持っても盾はそのまま');
assert.deepEqual(ax(B.wear(axeShield, 'shield', false)), [false, false, true], '盾だけ外すと手斧は残る');
assert.deepEqual(ax(B.wear(axeShield, 'axe', false)), [false, true, false], '手斧だけ棚へ戻すと盾は残る');
assert.deepEqual(ax(B.wear(axeShield, 'hammer', true)), [true, true, false], '手斧と盾 → 金槌に持ち替えても盾はそのまま');
assert.deepEqual(ax(B.wear(axed, 'hammer', true)), [true, false, false], '金槌に持ち替えると手斧は棚へ');
assert.deepEqual(ax(B.wear(axed, 'axe', false)), [false, false, false], '手斧を棚へ戻すと素手');
// どの順で着け外ししても、手斧と金槌は同時に立たず、盾は右手の操作で変わらない
const ops = [];
for (const item of B.ITEMS) for (const on of [true, false]) ops.push([item, on]);
for (const s0 of [...all4, axed, axeShield]) for (const [i1, o1] of ops) for (const [i2, o2] of ops) {
  const s1 = B.wear(s0, i1, o1), s2 = B.wear(s1, i2, o2), tag = `${JSON.stringify(s0)} ${i1}=${o1} ${i2}=${o2}`;
  assert.ok(!(s2.axe && s2.hammer), tag);
  if (i1 !== 'shield') assert.equal(s1.shield, s0.shield, `${tag} 盾は独立`);
  if (i2 !== 'shield') assert.equal(s2.shield, s1.shield, `${tag} 盾は独立`);
}
// 手斧と盾の姿では、手斧と盾をそれぞれ押せる（両道具の当たりが重ならない）
for (const v of ['front', 'back']) {
  const a = B.itemPoint(axeShield, v, 'axe'), s = B.itemPoint(axeShield, v, 'shield');
  assert.ok(Math.hypot(a.x - s.x, a.y - s.y) > 2 * 90, `${v} 手斧と盾の点が離れている`);
}

console.log(`standee-workshop check: ok (${srcs.size} assets + maren 6 poses + necklace + brom 12 poses)`);

// リディアは独立した素手の前後姿。
assert.deepEqual(W.lydia.ITEMS, []);
assert.equal(W.lydia.setView(W.lydia.initialState(), 'back').view, 'back');
assert.ok(fs.existsSync(path.join(__dirname, W.lydia.src)));
for (const view of ['front', 'back']) {
  const layer = W.lydia.layers(W.lydia.initialState(), view)[0];
  assert.equal(layer.src, W.lydia.src);
  assert.ok(layer.scale > 0);
  assert.equal(W.lydia.hitItem({}, view, {x:328,y:600}), null);
}
console.log('lydia check: ok (2 views, empty hands)');

for (const actor of ['gareth','maren','lydia','brom']) for (const view of ['front','back']) {
  const f = W.displayFrame(actor, view);
  const foot = actor === 'gareth' ? (view === 'front' ? 1168 : 1170) : 1140;
  const height = actor === 'gareth' ? (view === 'front' ? 1148 : 1147) : {maren:1080,lydia:750,brom:620}[actor];
  assert.ok(Math.abs(foot * f.scale + f.y - 1140) < 0.001);
  assert.ok(Math.abs(height * f.scale - W.DISPLAY_HEIGHT[actor]) < 0.001);
  for (const p of [{x:150,y:600},{x:500,y:1100}]) {
    assert.ok(Math.abs(((p.x*f.scale+f.x)-f.x)/f.scale-p.x)<0.001);
  }
}
console.log('display height check: ok (8 views, common foot 1140)');

assert.deepEqual(W.HEIGHT_CM, {gareth:184,maren:173,lydia:172,brom:145});
for (const actor of Object.keys(W.HEIGHT_CM)) assert.ok(Math.abs(W.DISPLAY_HEIGHT[actor] / W.HEIGHT_CM[actor] - 4.5) < 1e-9);
console.log('specified height check: ok (184 / 173 / 172 / 145cm, 4.5px/cm)');
