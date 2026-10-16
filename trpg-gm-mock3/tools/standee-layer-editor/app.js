// 画面の操作。合成・検証はcore.jsに任せます。
(function () {
  'use strict';
  const C = window.StandeeCore, $ = (id) => document.getElementById(id);
  const GARETH = {
    front: '../../prototype/art-preview/gareth-equipment-study/gareth-empty-front.png',
    back: '../../prototype/art-preview/gareth-equipment-study/gareth-empty-back-natural.png',
  };
  const SOURCE_LABEL = {
    none: '素材なし',
    demo: 'デモ図形（自作の幾何図形。実キャラ画像ではありません）',
    gareth: 'ガレス既存素体（参考として読込。合成結果の採否は作者が判断・未判定）',
    local: 'ローカルファイルを含む',
  };

  let project = C.newProject();
  let images = new Map();                 // data URL → 読み込み済み画像
  let sel = { view: 'front', layer: 'body' };
  let dirty = false, lastAction = '起動しました';

  // ---- 画像の読み込み（寸法・容量を検査し、通ったものだけ返す） ----
  function loadImage(url) {
    return new Promise((ok, ng) => {
      const img = new Image();
      img.onload = () => { try { C.checkImageSize(img.naturalWidth, img.naturalHeight); ok(img); } catch (e) { ng(e); } };
      img.onerror = () => ng(new Error('画像として読めません'));
      img.src = url;
    });
  }
  function blobToDataUrl(blob) {
    if (blob.size > C.LIMITS.imageBytes) return Promise.reject(new Error(`画像ファイルが大きすぎます（${blob.size}バイト、上限${C.LIMITS.imageBytes}）`));
    if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) return Promise.reject(new Error('PNG/JPEG/WebP以外は読めません'));
    return new Promise((ok, ng) => {
      const r = new FileReader();
      r.onload = () => ok(r.result); r.onerror = () => ng(new Error('ファイルを読めません'));
      r.readAsDataURL(blob);
    });
  }
  async function readImageBlob(blob) {
    const url = await blobToDataUrl(blob);
    images.set(url, await loadImage(url));
    return url;
  }

  // ---- 表示 ----
  function showError(msg) { $('error').textContent = msg ? 'エラー：' + msg : ''; }
  function act(msg) { lastAction = msg; showError(''); }
  function viewName(id) { return C.VIEWS.find((v) => v.id === id).name; }
  function layerName(id) { return C.LAYERS.find((l) => l.id === id).name; }

  function renderStatus() {
    $('status').textContent = [
      `素材：${SOURCE_LABEL[project.source] || project.source}`,
      `選択：${viewName(sel.view)}／${layerName(sel.layer)}`,
      dirty ? '未保存の変更あり' : '保存済み、または変更なし',
      `直前の操作：${lastAction}`,
    ].join('　｜　');
  }

  function renderCanvases() {
    const zoom = Number($('zoom').value), guides = $('guidesVisible').checked;
    for (const v of C.VIEWS) {
      const cv = $('canvas-' + v.id), ctx = cv.getContext('2d');
      cv.width = C.WIDTH; cv.height = C.HEIGHT;
      cv.style.width = C.WIDTH * zoom + 'px'; cv.style.height = C.HEIGHT * zoom + 'px';
      ctx.clearRect(0, 0, C.WIDTH, C.HEIGHT);
      C.drawView(ctx, project.views[v.id], images, makeCanvas, { guides: true, masks: guides, anchor: guides });
    }
  }
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function renderLayers() {
    const list = $('layerList'), view = project.views[sel.view];
    list.textContent = '';
    for (const l of [...C.LAYERS].reverse()) {
      const layer = view.layers[l.id], div = document.createElement('div');
      div.className = 'layer' + (sel.layer === l.id ? ' selected' : '');
      div.innerHTML = `<div class="row"><label><input type="radio" name="layer" value="${l.id}"> <strong>${l.name}</strong></label>
        <label><input type="checkbox" data-visible="${l.id}"> 表示</label></div>
        <div class="row"><input class="file" type="file" accept="image/png,image/jpeg,image/webp" data-file="${l.id}" aria-label="${viewName(sel.view)}の${l.name}にPNGを読む">
        <button data-clear="${l.id}" aria-label="${l.name}の画像を外す">外す</button></div>
        <div class="note">${layer.image ? '画像あり' : '画像なし'}</div>`;
      div.querySelector('[name=layer]').checked = sel.layer === l.id;
      div.querySelector('[data-visible]').checked = layer.visible;
      list.append(div);
    }
    $('frameVisible').checked = view.frame.visible;
  }

  function renderSelection() {
    const layer = project.views[sel.view].layers[sel.layer];
    $('selName').textContent = `${viewName(sel.view)}／${layerName(sel.layer)}`;
    for (const k of ['x', 'y', 'rotation', 'scale']) $('f-' + k).value = layer[k];
    const a = project.views[sel.view].anchor;
    $('a-x').value = a.x; $('a-y').value = a.y;
    $('maskBox').hidden = sel.layer !== 'body';
    const ul = $('maskList'); ul.textContent = '';
    project.views[sel.view].masks.forEach((m, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<div class="row">#${i + 1}` + ['x', 'y', 'w', 'h'].map((k) =>
        `<label>${k}<input type="number" step="1" data-mask="${i}" data-key="${k}" value="${m[k]}" aria-label="マスク${i + 1}の${k}" style="width:56px"></label>`).join('') +
        `<button data-delmask="${i}" aria-label="マスク${i + 1}を削除">削除</button></div>`;
      ul.append(li);
    });
  }

  function renderPrompt() {
    const p = project.prompt;
    $('p-weapon').value = p.weapon; $('p-appearance').value = p.appearance;
    document.querySelector(`[name=method][value=${p.method}]`).checked = true;
    document.querySelector(`[name=hand][value=${p.hand}]`).checked = true;
    $('promptText').value = C.buildPrompt(project);
  }

  function render() {
    document.querySelector(`[name=view][value=${sel.view}]`).checked = true;
    renderLayers(); renderSelection(); renderCanvases(); renderPrompt(); renderStatus();
  }
  function changed(msg) { dirty = true; act(msg); render(); }

  // 失敗しても既存の作業を残すため、例外は表示だけにします。
  function guard(fn) {
    return async (...args) => {
      try { await fn(...args); } catch (e) { showError(e.message); renderStatus(); }
    };
  }

  // ---- レイヤー操作 ----
  document.querySelectorAll('[name=view]').forEach((r) => r.addEventListener('change', () => { sel.view = r.value; act(`${viewName(r.value)}を編集`); render(); }));
  $('layerList').addEventListener('change', guard(async (e) => {
    const t = e.target, layer = project.views[sel.view].layers;
    if (t.name === 'layer') { sel.layer = t.value; act(`${layerName(t.value)}を選択`); render(); }
    else if (t.dataset.visible) { layer[t.dataset.visible].visible = t.checked; changed(`${layerName(t.dataset.visible)}の表示を切替`); }
    else if (t.dataset.file && t.files[0]) {
      const id = t.dataset.file, url = await readImageBlob(t.files[0]);
      layer[id].image = url; project.source = 'local'; sel.layer = id;
      changed(`${viewName(sel.view)}の${layerName(id)}に${t.files[0].name}を読込`);
    }
  }));
  $('layerList').addEventListener('click', (e) => {
    const id = e.target.dataset.clear;
    if (id) { project.views[sel.view].layers[id].image = null; changed(`${layerName(id)}の画像を外した`); }
  });
  $('frameFile').addEventListener('change', guard(async (e) => {
    const f = e.target.files[0]; if (!f) return;
    project.views[sel.view].frame.image = await readImageBlob(f);
    changed(`${viewName(sel.view)}のアクリル外枠に${f.name}を読込`);
  }));
  $('frameVisible').addEventListener('change', (e) => { project.views[sel.view].frame.visible = e.target.checked; changed('外枠の表示を切替'); });

  // ---- 数値入力（範囲外は反映せずエラー） ----
  document.querySelectorAll('[data-field]').forEach((inp) => inp.addEventListener('change', guard(() => {
    const k = inp.dataset.field;
    try { project.views[sel.view].layers[sel.layer][k] = C.checkField(k, Number(inp.value === '' ? NaN : inp.value)); }
    catch (e) { renderSelection(); throw e; }
    changed(`${layerName(sel.layer)}の${k}を変更`);
  })));
  document.querySelectorAll('[data-anchor]').forEach((inp) => inp.addEventListener('change', guard(() => {
    const k = inp.dataset.anchor, max = k === 'x' ? C.WIDTH : C.HEIGHT, v = Number(inp.value);
    if (inp.value === '' || !Number.isFinite(v) || v < 0 || v > max) { renderSelection(); throw new Error(`接続点${k}は0〜${max}です`); }
    project.views[sel.view].anchor[k] = v; changed(`接続点${k}を変更`);
  })));

  // ---- マスク（素体だけ） ----
  $('addMask').addEventListener('click', guard(() => {
    const masks = project.views[sel.view].masks;
    if (masks.length >= C.LIMITS.masks) throw new Error(`マスクは${C.LIMITS.masks}個までです`);
    const a = project.views[sel.view].anchor;
    masks.push({ x: Math.round(a.x - 40), y: Math.round(a.y - 40), w: 80, h: 80 });
    changed('マスクを追加');
  }));
  $('maskList').addEventListener('change', guard((e) => {
    const t = e.target; if (t.dataset.mask === undefined) return;
    const m = project.views[sel.view].masks[t.dataset.mask];
    try { Object.assign(m, C.checkMask({ ...m, [t.dataset.key]: Number(t.value === '' ? NaN : t.value) }, 'マスク')); }
    catch (err) { renderSelection(); throw err; }
    changed('マスクを変更');
  }));
  $('maskList').addEventListener('click', (e) => {
    const i = e.target.dataset.delmask;
    if (i !== undefined) { project.views[sel.view].masks.splice(Number(i), 1); changed('マスクを削除'); }
  });

  // ---- ドラッグ・キーボード ----
  for (const v of C.VIEWS) {
    const cv = $('canvas-' + v.id);
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (sel.view !== v.id) { sel.view = v.id; render(); }
      const layer = project.views[v.id].layers[sel.layer];
      drag = { x: e.clientX, y: e.clientY, lx: layer.x, ly: layer.y, k: cv.getBoundingClientRect().width / C.WIDTH };
      cv.setPointerCapture(e.pointerId); cv.focus();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const layer = project.views[v.id].layers[sel.layer];
      layer.x = Math.round(drag.lx + (e.clientX - drag.x) / drag.k);
      layer.y = Math.round(drag.ly + (e.clientY - drag.y) / drag.k);
      renderCanvases();
    });
    cv.addEventListener('pointerup', () => { if (drag) { drag = null; changed(`${layerName(sel.layer)}をドラッグで移動`); } });
    cv.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      if (sel.view !== v.id) sel.view = v.id;
      const layer = project.views[v.id].layers[sel.layer], n = e.shiftKey ? 10 : 1;
      layer.x += d[0] * n; layer.y += d[1] * n;
      changed(`${layerName(sel.layer)}を矢印キーで移動`);
    });
  }
  $('zoom').addEventListener('change', renderCanvases);
  $('guidesVisible').addEventListener('change', renderCanvases);

  // ---- 保存・復元 ----
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('saveJson').addEventListener('click', guard(() => {
    const text = JSON.stringify(project);
    if (text.length > C.LIMITS.jsonChars) throw new Error('画像込みのJSONが上限を超えます。画像を減らしてください');
    download('standee-layers.json', new Blob([text], { type: 'application/json' }));
    dirty = false; act('設定をJSONで保存'); renderStatus();
  }));
  $('loadJson').addEventListener('change', guard(async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > C.LIMITS.jsonChars * 4) throw new Error('JSONファイルが大きすぎます');
    const next = C.parseProject(await f.text());
    // 画像を全部読めてから差し替えます。途中で失敗したら今の作業はそのまま。
    const urls = new Set();
    for (const v of C.VIEWS) {
      for (const l of C.LAYERS) if (next.views[v.id].layers[l.id].image) urls.add(next.views[v.id].layers[l.id].image);
      if (next.views[v.id].frame.image) urls.add(next.views[v.id].frame.image);
    }
    const loaded = new Map();
    for (const u of urls) {
      try { loaded.set(u, await loadImage(u)); } catch (err) { throw new Error('JSON内の画像: ' + err.message); }
    }
    project = next; images = loaded; dirty = false;
    act(`${f.name}から復元`); render();
  }));

  function toBlob(canvas) { return new Promise((ok) => canvas.toBlob(ok, 'image/png')); }
  $('exportPng').addEventListener('click', guard(async () => {
    for (const v of C.VIEWS) {
      const c = makeCanvas(C.WIDTH, C.HEIGHT);
      C.drawView(c.getContext('2d'), project.views[v.id], images, makeCanvas, { guides: false });
      download(`standee-${v.id}.png`, await toBlob(c));
    }
    act('透明PNGを前後2枚書き出し'); renderStatus();
  }));
  $('exportGuide').addEventListener('click', guard(async () => {
    for (const v of C.VIEWS) {
      const c = makeCanvas(C.WIDTH, C.HEIGHT), ctx = c.getContext('2d'), view = project.views[v.id];
      // 素体（マスク適用後）を薄く描き、接続点と外枠を重ねます。装備は含めません。
      const bodyOnly = { ...view, layers: Object.fromEntries(C.LAYERS.map((l) => [l.id, l.id === 'body' ? view.layers.body : { ...view.layers[l.id], visible: false }])) };
      ctx.globalAlpha = 0.4; C.drawView(ctx, bodyOnly, images, makeCanvas, { guides: false }); ctx.globalAlpha = 1;
      C.drawGuides(ctx, view, images, { masks: false });
      download(`guide-${v.id}.png`, await toBlob(c));
    }
    act('参照ガイドPNGを前後2枚書き出し'); renderStatus();
  }));

  // ---- 依頼文 ----
  $('p-weapon').addEventListener('input', (e) => { project.prompt.weapon = e.target.value; dirty = true; $('promptText').value = C.buildPrompt(project); });
  $('p-appearance').addEventListener('input', (e) => { project.prompt.appearance = e.target.value; dirty = true; $('promptText').value = C.buildPrompt(project); });
  document.querySelectorAll('[name=method],[name=hand]').forEach((r) => r.addEventListener('change', () => { project.prompt[r.name] = r.value; changed('依頼文の条件を変更'); }));
  $('copyPrompt').addEventListener('click', guard(async () => {
    try { await navigator.clipboard.writeText($('promptText').value); act('依頼文をコピー'); }
    catch { $('promptText').select(); document.execCommand('copy'); act('依頼文を選択してコピー'); }
    renderStatus();
  }));

  // ---- 初期素材 ----
  // 自作の幾何図形。人物の右手は正面で画面左、背面で画面右に置きます。
  function demoImage(w, h, paint) { const c = makeCanvas(w, h); paint(c.getContext('2d')); return c.toDataURL('image/png'); }
  function demoBody(back) {
    return demoImage(C.WIDTH, C.HEIGHT, (g) => {
      g.fillStyle = back ? '#7c8c86' : '#b9c4bb';
      g.beginPath(); g.arc(328, 170, 70, 0, Math.PI * 2); g.fill();          // 頭
      g.fillRect(238, 250, 180, 380);                                        // 胴
      g.fillRect(180, 260, 52, 360); g.fillRect(424, 260, 52, 360);          // 腕
      g.fillRect(250, 640, 66, 480); g.fillRect(340, 640, 66, 480);          // 脚
      g.fillStyle = '#d9a77e';
      g.beginPath(); g.arc(206, 650, 30, 0, Math.PI * 2); g.arc(450, 650, 30, 0, Math.PI * 2); g.fill(); // 元の手
      if (back) { g.fillStyle = '#556660'; g.fillRect(238, 300, 180, 30); }   // 背面の目印
    });
  }
  const demoSword = () => demoImage(60, 420, (g) => {
    g.fillStyle = '#c9cdd0'; g.fillRect(22, 0, 16, 330);
    g.fillStyle = '#c39b55'; g.fillRect(0, 330, 60, 14);
    g.fillStyle = '#5a3b22'; g.fillRect(24, 344, 12, 76);
  });
  const demoHand = () => demoImage(80, 80, (g) => { g.fillStyle = '#e0b48c'; g.beginPath(); g.arc(40, 40, 34, 0, Math.PI * 2); g.fill(); });
  const demoShield = () => demoImage(200, 260, (g) => { g.fillStyle = '#6b4a2c'; g.fillRect(0, 0, 200, 260); g.fillStyle = '#c39b55'; g.fillRect(90, 0, 20, 260); });

  function mayReplace() { return !dirty || confirm('未保存の変更があります。編集中の内容を置き換えますか？'); }
  async function adopt(url) { images.set(url, await loadImage(url)); return url; }
  $('loadDemo').addEventListener('click', guard(async () => {
    if (!mayReplace()) return;
    const next = C.newProject();
    next.source = 'demo';
    const [fb, bb, sw, hd, sh] = await Promise.all([demoBody(false), demoBody(true), demoSword(), demoHand(), demoShield()].map(adopt));
    const place = (view, handX, shieldX) => {
      const v = next.views[view];
      v.layers.body.image = view === 'front' ? fb : bb;
      v.layers.fore.image = sw; Object.assign(v.layers.fore, { x: handX - 30, y: 650 - 344 - 30 });
      v.layers.hand.image = hd; Object.assign(v.layers.hand, { x: handX - 40, y: 610 });
      v.layers.rear.image = sh; Object.assign(v.layers.rear, { x: shieldX, y: 280 });
      v.anchor = { x: handX, y: 650 };
    };
    place('front', 206, 380); place('back', 450, 76);
    project = next; dirty = true; act('デモ図形を読込（実キャラ画像ではありません）'); render();
  }));
  $('loadGareth').addEventListener('click', guard(async () => {
    if (!mayReplace()) return;
    const urls = {};
    for (const v of C.VIEWS) {
      const res = await fetch(GARETH[v.id]);
      if (!res.ok) throw new Error(`ガレス素体を読めません（${res.status}）。README の起動方法でリポジトリ直下から配信してください`);
      urls[v.id] = await readImageBlob(await res.blob());
    }
    const next = C.newProject();
    for (const v of C.VIEWS) next.views[v.id].layers.body.image = urls[v.id];
    next.source = 'gareth'; project = next; changed('ガレス既存素体を読込（採否は未判定）');
  }));

  render();
})();
