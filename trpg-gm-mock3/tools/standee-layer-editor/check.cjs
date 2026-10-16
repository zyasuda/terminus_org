// 合成順・素体限定マスク・保存復元と不正入力の検査。 node check.cjs
const assert = require('node:assert/strict');
const C = require('./core.js');

// 呼び出しを記録するだけの2Dコンテキスト。
function recorder(name, log) {
  return {
    name, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {}, strokeRect() {},
    drawImage(img) { log.push(`${name}.draw:${img.id}`); },
    clearRect(x, y, w, h) { log.push(`${name}.clear:${x},${y},${w},${h}`); },
  };
}
const img = (id) => ({ id, width: 10, height: 10 });
const URL = (id) => `data:image/png;base64,${id}`;

function sample() {
  const p = C.newProject(), v = p.views.front;
  for (const l of C.LAYERS) v.layers[l.id].image = URL(l.id);
  return p;
}
const images = new Map(C.LAYERS.map((l) => [URL(l.id), img(l.id)]));

// 1. 合成順：奥の装備 → 素体 → 手前の装備 → 交換手
{
  const log = [], p = sample();
  C.drawView(recorder('main', log), p.views.front, images, () => { throw Error('マスクなしで作業用キャンバスを作った'); });
  assert.deepEqual(log, ['main.draw:rear', 'main.draw:body', 'main.draw:fore', 'main.draw:hand']);
  p.views.front.layers.fore.visible = false;
  log.length = 0; C.drawView(recorder('main', log), p.views.front, images, null);
  assert.deepEqual(log, ['main.draw:rear', 'main.draw:body', 'main.draw:hand'], '非表示レイヤーを描かない');
}

// 2. マスクは素体の作業用キャンバスだけを消す
{
  const log = [], p = sample();
  p.views.front.masks.push({ x: 1, y: 2, w: 3, h: 4 });
  const made = [];
  const make = () => { const c = { id: 'bodyCanvas', getContext: () => recorder('body', log) }; made.push(c); return c; };
  C.drawView(recorder('main', log), p.views.front, images, make);
  assert.equal(made.length, 1);
  assert.deepEqual(log, ['main.draw:rear', 'body.draw:body', 'body.clear:1,2,3,4', 'main.draw:bodyCanvas', 'main.draw:fore', 'main.draw:hand']);
  assert.ok(!log.some((s) => s.startsWith('main.clear')), '本体キャンバスを消していない');
}

// 3. 保存→復元で同じ内容。前後は別画像として保持
{
  const p = sample();
  p.views.back.layers.body.image = URL('backbody');
  p.views.front.masks.push({ x: 5, y: 6, w: 7, h: 8 });
  Object.assign(p.views.front.layers.fore, { x: 12.5, y: -3, rotation: 30, scale: 1.25 });
  p.prompt = { weapon: '片手剣', appearance: '鋼', method: 'fingers', hand: 'left' };
  p.source = 'demo';
  const back = C.parseProject(JSON.stringify(p));
  assert.deepEqual(back, p);
  assert.notEqual(back.views.front.layers.body.image, back.views.back.layers.body.image);
}

// 4. 不正入力は例外になり、元のプロジェクトを変えない
{
  const keep = sample(), before = JSON.stringify(keep);
  const bad = (mutate) => { const o = JSON.parse(before); mutate(o); return JSON.stringify(o); };
  const cases = {
    壊れたJSON: '{"version":1,',
    版違い: bad((o) => { o.version = 2; }),
    数値でない位置: bad((o) => { o.views.front.layers.fore.x = 'abc'; }),
    範囲外の縮尺: bad((o) => { o.views.back.layers.body.scale = 0; }),
    範囲外の回転: bad((o) => { o.views.back.layers.body.rotation = 999; }),
    画像以外のURL: bad((o) => { o.views.front.layers.body.image = 'javascript:alert(1)'; }),
    マスク幅0: bad((o) => { o.views.front.masks = [{ x: 0, y: 0, w: 0, h: 5 }]; }),
    マスク多すぎ: bad((o) => { o.views.front.masks = Array(51).fill({ x: 0, y: 0, w: 1, h: 1 }); }),
    背面なし: bad((o) => { delete o.views.back; }),
    接続点範囲外: bad((o) => { o.views.front.anchor.x = -1; }),
  };
  for (const [name, text] of Object.entries(cases)) {
    let project = keep;
    assert.throws(() => { project = C.parseProject(text); }, Error, name);
    assert.equal(project, keep, name);
  }
  assert.equal(JSON.stringify(keep), before);
  assert.throws(() => C.parseProject('x'.repeat(C.LIMITS.jsonChars + 1)), /大きすぎ/);
  assert.throws(() => C.checkImageSize(4097, 10), /大きすぎ/);
  assert.doesNotThrow(() => C.checkImageSize(656, 1199));
}

// 5. 依頼文：人物の右手は正面で画面左、背面で画面右。反転流用と全身再生成を禁じる
{
  const p = sample();
  p.views.front.anchor = { x: 206, y: 650 }; p.views.back.anchor = { x: 450, y: 650 };
  let t = C.buildPrompt(p);
  assert.match(t, /正面用：人物の右手は画面の左側。接続点 x=206, y=650/);
  assert.match(t, /背面用：人物の右手は画面の右側。接続点 x=450, y=650/);
  assert.match(t, /手首交換方式/);
  assert.match(t, /再生成・描き直しをしない/);
  assert.match(t, /左右反転して流用しない/);
  p.prompt.hand = 'left'; p.prompt.method = 'fingers';
  t = C.buildPrompt(p);
  assert.match(t, /正面用：人物の左手は画面の右側/);
  assert.match(t, /固定指方式/);
}

// 6〜9：制作フロー（flow-core.js）
const F = require('./flow-core.js');
const SH_F = URL('shf'), SH_B = URL('shb');
function filled() {
  const f = F.newFlow();
  f.states.sheathed = { front: SH_F, back: SH_B };
  return f;
}

// 6. 基準は「基準として保存」でだけ変わる。①の画像を差し替えても基準は保持し、②③はそれまで始められない
{
  const f = filled();
  assert.equal(F.canWork(f, 'drawn'), false);
  assert.equal(F.stageStatus(f, 'drawn'), '納刀の基準待ち');
  assert.throws(() => F.saveBase({ ...F.newFlow(), states: { ...F.newFlow().states, sheathed: { front: SH_F, back: null } } }), /両方/);
  F.saveBase(f);
  assert.deepEqual(f.base, { front: SH_F, back: SH_B });
  assert.equal(F.stageStatus(f, 'sheathed'), '基準保存済み');
  assert.equal(F.canWork(f, 'empty'), true);
  f.states.sheathed.front = URL('new');
  assert.deepEqual(f.base, { front: SH_F, back: SH_B }, '①を差し替えても基準は変わらない');
  assert.equal(F.stageStatus(f, 'sheathed'), '基準と別の画像あり');
  F.saveBase(f);
  assert.equal(f.base.front, URL('new'));
}

// 7. 制作データの保存→復元で同じ内容。重複画像は1回だけ読む
{
  const f = filled(); F.saveBase(f);
  f.states.drawn.front = URL('dr'); f.source = 'テスト';
  const back = F.parseFlow(JSON.stringify(f));
  assert.deepEqual(back, f);
  assert.deepEqual(F.imageUrls(back).sort(), [SH_B, SH_F, URL('dr')].sort());
}

// 8. 不正な制作データは例外になり、元のデータを変えない。詳細レイヤー編集のJSONは見分ける
{
  const keep = filled(); F.saveBase(keep);
  const before = JSON.stringify(keep), bad = (m) => { const o = JSON.parse(before); m(o); return JSON.stringify(o); };
  const cases = {
    壊れたJSON: [before.slice(0, 40), /JSONとして読めません/],
    別形式: [JSON.stringify(C.newProject()), /詳細レイヤー編集の保存データ/],
    種類なし: [bad((o) => { delete o.kind; }), /kind/],
    版違い: [bad((o) => { o.version = 2; }), /version/],
    画像以外のURL: [bad((o) => { o.base.front = 'javascript:alert(1)'; }), /base\.front/],
    段階なし: [bad((o) => { delete o.states.empty; }), /states\.empty/],
  };
  for (const [name, [text, re]] of Object.entries(cases)) {
    let flow = keep;
    assert.throws(() => { flow = F.parseFlow(text); }, re, name);
    assert.equal(flow, keep, name);
  }
  assert.equal(JSON.stringify(keep), before);
  assert.throws(() => F.parseFlow('x'.repeat(F.LIMITS.jsonChars + 1)), /大きすぎ/);
}

// 9. 編集用プロンプト：基準から編集。前後別で、身体の右手と画面の左右を明記。抜刀は鞘を固定し右手と剣だけ
{
  const d = F.buildEditPrompt('drawn', 'front'), db = F.buildEditPrompt('drawn', 'back');
  assert.match(d, /抜刀（正面）/); assert.match(db, /抜刀（背面）/);
  assert.match(d, /納刀」立ち絵（正面）.*描き直さない/);
  assert.match(d, /右手（人物自身から見た右手）は、この正面図では画面の左側/);
  assert.match(db, /この背面図では画面の右側/);
  assert.match(d, /鞘の位置・長さ・角度/);
  assert.match(d, /柄を消し/);
  assert.match(d, /右手と剣だけ/);
  assert.match(d, /背面用は別の依頼.*左右反転/);
  const e = F.buildEditPrompt('empty', 'back');
  assert.match(e, /素手（背面）/); assert.match(e, /剣と鞘を取り除く/); assert.match(e, /姿勢/);
  assert.match(e, /右手（画面の右側）/);
  assert.throws(() => F.buildEditPrompt('sheathed', 'front'));
  assert.throws(() => F.buildEditPrompt('drawn', 'side'));
}

console.log('standee-layer-editor check: ok (9 groups)');
