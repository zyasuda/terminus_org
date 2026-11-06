// 合成順・検証・依頼文など、DOMに依存しない処理。ブラウザーとnodeの検査で共用します。
(function (root) {
  'use strict';

  // 画面とPNG書き出しの寸法。ガレス既存素体（656×1199）に合わせた固定値です。
  const WIDTH = 656, HEIGHT = 1199;
  // 合成順。配列の先頭が奥です。
  const LAYERS = [
    { id: 'rear', name: '奥の装備' },
    { id: 'body', name: '素体' },
    { id: 'fore', name: '手前の装備' },
    { id: 'hand', name: '交換手/遮蔽指' },
  ];
  const VIEWS = [{ id: 'front', name: '正面' }, { id: 'back', name: '背面' }];
  // 読み込みの上限。超えたら読まずにエラーにします。
  const LIMITS = {
    jsonChars: 40 * 1024 * 1024,   // 保存JSONの文字数
    imageBytes: 15 * 1024 * 1024,  // 1枚の画像ファイル
    imageSide: 4096,               // 画像の縦横どちらかの最大px
    masks: 50,                     // 素体マスクの矩形数
    pos: 5000,                     // 位置x/yの絶対値
    rotation: 360,                 // 回転（度）の絶対値
    scaleMin: 0.05, scaleMax: 10,  // 縮尺
  };
  const IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  function emptyLayer() { return { image: null, visible: true, x: 0, y: 0, rotation: 0, scale: 1 }; }
  function emptyView() {
    const layers = {};
    for (const l of LAYERS) layers[l.id] = emptyLayer();
    return { layers, masks: [], anchor: { x: WIDTH / 2, y: HEIGHT / 2 }, frame: { image: null, visible: true } };
  }
  function newProject() {
    return {
      version: 1,
      source: 'none',
      views: { front: emptyView(), back: emptyView() },
      prompt: { weapon: '', appearance: '', method: 'wrist', hand: 'right' },
    };
  }

  function fail(path, message) { throw new Error(`${path}: ${message}`); }
  function num(v, path, min, max) {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '数値ではありません');
    if (v < min || v > max) fail(path, `${min}〜${max}の範囲外です（${v}）`);
    return v;
  }
  function bool(v, path) { if (typeof v !== 'boolean') fail(path, 'true/falseではありません'); return v; }
  function image(v, path) {
    if (v === null) return null;
    if (typeof v !== 'string' || !IMAGE_PREFIX.test(v)) fail(path, 'PNG/JPEG/WebPのdata URLではありません');
    return v;
  }
  function obj(v, path) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'オブジェクトではありません'); return v; }

  // 編集値1件の検査。数値入力からも使います。
  function checkField(key, v) {
    if (key === 'x' || key === 'y') return num(v, key, -LIMITS.pos, LIMITS.pos);
    if (key === 'rotation') return num(v, key, -LIMITS.rotation, LIMITS.rotation);
    if (key === 'scale') return num(v, key, LIMITS.scaleMin, LIMITS.scaleMax);
    throw new Error(`未知の項目: ${key}`);
  }

  function checkMask(m, path) {
    obj(m, path);
    return {
      x: num(m.x, path + '.x', -LIMITS.pos, LIMITS.pos), y: num(m.y, path + '.y', -LIMITS.pos, LIMITS.pos),
      w: num(m.w, path + '.w', 1, LIMITS.pos), h: num(m.h, path + '.h', 1, LIMITS.pos),
    };
  }

  // 保存JSONの文字列を検査し、正規化した新しいプロジェクトを返します。失敗時は例外。
  function parseProject(text) {
    if (typeof text !== 'string') throw new Error('JSONが文字列ではありません');
    if (text.length > LIMITS.jsonChars) throw new Error(`JSONが大きすぎます（${text.length}文字、上限${LIMITS.jsonChars}文字）`);
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error('JSONとして読めません: ' + e.message); }
    obj(raw, 'root');
    if (raw.version !== 1) fail('version', '対応していない版です');
    const out = newProject();
    out.source = typeof raw.source === 'string' ? raw.source.slice(0, 40) : 'none';
    obj(raw.views, 'views');
    for (const v of VIEWS) {
      const rv = obj(raw.views[v.id], `views.${v.id}`), ov = out.views[v.id];
      obj(rv.layers, `views.${v.id}.layers`);
      for (const l of LAYERS) {
        const p = `views.${v.id}.layers.${l.id}`, rl = obj(rv.layers[l.id], p);
        ov.layers[l.id] = {
          image: image(rl.image, p + '.image'), visible: bool(rl.visible, p + '.visible'),
          x: checkField('x', rl.x), y: checkField('y', rl.y),
          rotation: checkField('rotation', rl.rotation), scale: checkField('scale', rl.scale),
        };
      }
      if (!Array.isArray(rv.masks)) fail(`views.${v.id}.masks`, '配列ではありません');
      if (rv.masks.length > LIMITS.masks) fail(`views.${v.id}.masks`, `矩形が多すぎます（上限${LIMITS.masks}）`);
      ov.masks = rv.masks.map((m, i) => checkMask(m, `views.${v.id}.masks[${i}]`));
      const a = obj(rv.anchor, `views.${v.id}.anchor`);
      ov.anchor = { x: num(a.x, `views.${v.id}.anchor.x`, 0, WIDTH), y: num(a.y, `views.${v.id}.anchor.y`, 0, HEIGHT) };
      const f = obj(rv.frame, `views.${v.id}.frame`);
      ov.frame = { image: image(f.image, `views.${v.id}.frame.image`), visible: bool(f.visible, `views.${v.id}.frame.visible`) };
    }
    const pr = obj(raw.prompt, 'prompt');
    out.prompt = {
      weapon: String(pr.weapon ?? '').slice(0, 200), appearance: String(pr.appearance ?? '').slice(0, 1000),
      method: pr.method === 'fingers' ? 'fingers' : 'wrist', hand: pr.hand === 'left' ? 'left' : 'right',
    };
    return out;
  }

  function checkImageSize(w, h) {
    if (!(w > 0 && h > 0)) throw new Error('画像の寸法が読めません');
    if (w > LIMITS.imageSide || h > LIMITS.imageSide) throw new Error(`画像が大きすぎます（${w}×${h}、上限${LIMITS.imageSide}px）`);
  }

  // 1面を合成します。images: data URL → 画像。makeCanvas(w,h): 作業用キャンバス。
  // マスクは素体の作業用キャンバスにだけ掛け、ほかのレイヤーは消しません。
  function drawView(ctx, view, images, makeCanvas, opts = {}) {
    for (const l of LAYERS) {
      const layer = view.layers[l.id], img = layer.image && images.get(layer.image);
      if (!layer.visible || !img) continue;
      if (l.id === 'body' && view.masks.length) {
        const c = makeCanvas(WIDTH, HEIGHT), bctx = c.getContext('2d');
        drawLayer(bctx, layer, img);
        for (const m of view.masks) bctx.clearRect(m.x, m.y, m.w, m.h);
        ctx.drawImage(c, 0, 0);
      } else drawLayer(ctx, layer, img);
    }
    if (opts.guides) drawGuides(ctx, view, images, opts);
  }

  // 画像の中心を基準に回転・縮尺し、左上を(x,y)に置きます。
  function drawLayer(ctx, layer, img) {
    const w = img.width, h = img.height;
    ctx.save();
    ctx.translate(layer.x + w / 2, layer.y + h / 2);
    ctx.rotate(layer.rotation * Math.PI / 180);
    ctx.scale(layer.scale, layer.scale);
    ctx.drawImage(img, -w / 2, -h / 2);
    ctx.restore();
  }

  function drawGuides(ctx, view, images, opts) {
    const frame = view.frame.image && images.get(view.frame.image);
    if (frame && view.frame.visible && opts.frame !== false) {
      ctx.save(); ctx.globalAlpha = 0.6; ctx.drawImage(frame, 0, 0, WIDTH, HEIGHT); ctx.restore();
    }
    if (opts.masks) {
      ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#e06c5a'; ctx.lineWidth = 2;
      for (const m of view.masks) ctx.strokeRect(m.x, m.y, m.w, m.h);
      ctx.restore();
    }
    if (opts.anchor === false) return;
    const { x, y } = view.anchor;
    ctx.save(); ctx.strokeStyle = '#ff2fb4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.moveTo(x - 26, y); ctx.lineTo(x + 26, y); ctx.moveTo(x, y - 26); ctx.lineTo(x, y + 26);
    ctx.stroke(); ctx.restore();
  }

  const HAND = { right: '右手', left: '左手' };
  // 人物の右手は、正面図では画面左、背面図では画面右に来ます。
  function screenSide(hand, view) {
    const left = (hand === 'right') === (view === 'front');
    return left ? '画面の左側' : '画面の右側';
  }

  function buildPrompt(project) {
    const p = project.prompt, h = HAND[p.hand];
    const a = (v) => `x=${Math.round(project.views[v].anchor.x)}, y=${Math.round(project.views[v].anchor.y)}`;
    const method = p.method === 'wrist'
      ? `手首交換方式：武器を握った「手首から先の手」と武器を1つのパーツとして描く。手首の切り口を参照ガイドの接続点（ピンクの十字）に合わせる。素体側の元の手は合成時に隠す。`
      : `固定指方式：素体の手はそのまま使う。武器本体のパーツと、柄に掛かる指だけの遮蔽パーツを別々に描く。指パーツは素体の指の形・位置に合わせ、柄の手前に重なる部分だけにする。`;
    return [
      '【装備パーツ画像の依頼】',
      `武器種：${p.weapon || '（未入力）'}`,
      `外観：${p.appearance || '（未入力）'}`,
      method,
      `持ち手：人物の${h}。`,
      `・正面用：人物の${h}は${screenSide(p.hand, 'front')}。接続点 ${a('front')}（画像 ${WIDTH}×${HEIGHT}px、左上が原点）。`,
      `・背面用：人物の${h}は${screenSide(p.hand, 'back')}。接続点 ${a('back')}（同じ寸法・同じ縮尺）。`,
      '固定条件：素体の姿勢・縮尺・頭と足の基準位置は変えない。添付の参照ガイドと同じ寸法・同じ位置で描く。',
      '素体（人物全身）は再生成・描き直しをしない。出力は装備パーツだけにする。',
      '正面用と背面用は別々の画像として描く。片方を左右反転して流用しない。',
      '背景は透明。文字・枠・影・板の縁・ガイドの十字は描かない。',
    ].join('\n');
  }

  const api = { WIDTH, HEIGHT, LAYERS, VIEWS, LIMITS, newProject, parseProject, checkField, checkMask, checkImageSize, drawView, drawGuides, buildPrompt, screenSide };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StandeeCore = api;
})(this);
