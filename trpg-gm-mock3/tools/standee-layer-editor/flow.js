// 制作フロー画面の操作。状態の検査と依頼文は flow-core.js、画像検査と合成は core.js を使います。
(function () {
  'use strict';
  const C = window.StandeeCore, F = window.StandeeFlow, $ = (id) => document.getElementById(id);
  const DEMO = 'studies/gareth-sword-v1/state-';  // 既存ガレス3状態（詳細レイヤー編集の保存データ）

  let flow = F.newFlow();
  let images = new Map();          // data URL → 読み込み済み画像
  let stage = 'sheathed', compare = false, dirty = false, lastAction = '起動しました';
  let pickView = null;             // 「できた画像を読み込む」を押した向き

  const stageOf = (id) => F.STAGES.find((s) => s.id === id);
  const viewName = (id) => F.VIEWS.find((v) => v.id === id).name;

  // ---- 画像の読み込み（寸法・容量・形式を検査し、通ったものだけ返す） ----
  function loadImage(url) {
    return new Promise((ok, ng) => {
      const img = new Image();
      img.onload = () => { try { C.checkImageSize(img.naturalWidth, img.naturalHeight); ok(img); } catch (e) { ng(e); } };
      img.onerror = () => ng(new Error('画像として読めません'));
      img.src = url;
    });
  }
  async function readImageFile(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(`${file.name}: PNG/JPEG/WebP以外は読めません`);
    if (file.size > C.LIMITS.imageBytes) throw new Error(`${file.name}: 画像ファイルが大きすぎます（${file.size}バイト、上限${C.LIMITS.imageBytes}）`);
    const url = await new Promise((ok, ng) => {
      const r = new FileReader();
      r.onload = () => ok(r.result); r.onerror = () => ng(new Error('ファイルを読めません'));
      r.readAsDataURL(file);
    });
    try { return { url, img: await loadImage(url) }; } catch (e) { throw new Error(`${file.name}: ${e.message}`); }
  }

  // ---- 表示 ----
  function showError(msg) { $('error').textContent = msg ? 'エラー：' + msg : ''; }
  function act(msg) { lastAction = msg; showError(''); }
  function changed(msg) { dirty = true; act(msg); render(); }

  function renderStatus() {
    $('status').textContent = [
      `素材：${flow.source === 'none' ? '未読込' : flow.source}`,
      dirty ? '未保存の変更あり' : '保存済み、または変更なし',
      `直前の操作：${lastAction}`,
    ].join('　｜　');
  }

  function renderStages() {
    const ol = $('stages'); ol.textContent = '';
    for (const s of F.STAGES) {
      const li = document.createElement('li'), b = document.createElement('button'), st = F.stageStatus(flow, s.id);
      b.className = 'stage'; b.dataset.stage = s.id;
      if (s.id === stage) b.setAttribute('aria-current', 'step');
      const done = st === '基準保存済み' || st === '前後あり';
      b.innerHTML = `<span class="no">${s.no}</span><span><b></b><small class="${done ? 'done' : ''}"></small></span>`;
      b.querySelector('b').textContent = s.verb;
      b.querySelector('small').textContent = st;
      li.append(b); ol.append(li);
    }
  }

  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function figure(caption, canvas) {
    const f = document.createElement('figure'), cap = document.createElement('figcaption');
    cap.textContent = caption; f.append(cap, canvas); return f;
  }
  function placeholder(text) { const d = document.createElement('div'); d.className = 'empty-pic'; d.textContent = text; return d; }

  // 基準と比較：両方を基準と同じ寸法のキャンバスに描きます。寸法が違えば縮小して収め、その旨を出します。
  function renderPics() {
    const s = stageOf(stage);
    for (const v of F.VIEWS) {
      const box = $('pics-' + v.id), cur = images.get(flow.states[stage][v.id]), base = images.get(flow.base[v.id]);
      box.textContent = '';
      if (!compare || !base) {
        if (!cur) { box.append(placeholder(`${s.name}・${v.name}の画像はまだありません`)); continue; }
        const c = makeCanvas(cur.naturalWidth, cur.naturalHeight); c.getContext('2d').drawImage(cur, 0, 0);
        c.dataset.role = 'current'; c.setAttribute('aria-label', `${s.name}・${v.name}`);
        box.append(figure(`${s.name}（${cur.naturalWidth}×${cur.naturalHeight}）`, c));
        continue;
      }
      const W = base.naturalWidth, H = base.naturalHeight;
      const bc = makeCanvas(W, H); bc.getContext('2d').drawImage(base, 0, 0);
      bc.dataset.role = 'base'; bc.setAttribute('aria-label', `基準（納刀）・${v.name}`);
      const cc = makeCanvas(W, H); cc.dataset.role = 'current'; cc.setAttribute('aria-label', `${s.name}・${v.name}`);
      let cap = `${s.name}（画像なし）`;
      if (cur) {
        const same = cur.naturalWidth === W && cur.naturalHeight === H, k = same ? 1 : Math.min(W / cur.naturalWidth, H / cur.naturalHeight);
        cc.getContext('2d').drawImage(cur, 0, 0, cur.naturalWidth * k, cur.naturalHeight * k);
        cap = `${s.name}（${cur.naturalWidth}×${cur.naturalHeight}）`;
        if (!same) {
          const w = document.createElement('p'); w.className = 'size-warn';
          w.textContent = `寸法が違うため縮小して左上に合わせています（基準 ${W}×${H}／現在 ${cur.naturalWidth}×${cur.naturalHeight}）`;
          box.after(w); w.dataset.sizeWarn = v.id;
        }
      }
      box.append(figure(`基準：納刀（${W}×${H}）`, bc), figure(cap, cc));
    }
  }

  function renderOps() {
    const s = stageOf(stage), ok = F.canWork(flow, stage), edit = stage !== 'sheathed';
    $('opsTitle').textContent = `${s.no} ${s.verb}`;
    $('need').hidden = ok;
    $('need').innerHTML = ok ? '' : '<b>先に①で納刀の基準が必要です。</b><br>①で正面・背面の納刀画像を読み込み、「基準として保存」を押してください。<div class="row"><button data-act="goto-sheathed">①納刀を決めるへ移る</button></div>';
    $('opsNote').textContent = edit
      ? `「編集用プロンプトをコピー」→ 生成AIに①の納刀画像（同じ向き）を添付して送る →「できた画像を読み込む」→「基準と比較する」で${stage === 'drawn' ? '人物と鞘' : '人物と姿勢'}がずれていないか確かめます。`
      : '完成した納刀画像を正面・背面とも読み込み、左右に並べて確認してから「基準として保存」を押します。②③はこの基準から作ります。';
    const box = $('viewOps'); box.textContent = '';
    for (const v of F.VIEWS) {
      const fs = document.createElement('fieldset'), has = Boolean(flow.states[stage][v.id]);
      fs.innerHTML = `<legend>${v.name}（画面${v.id === 'front' ? '左' : '右'}の絵）</legend><div class="row"></div><p class="note"></p>`;
      const row = fs.querySelector('.row');
      if (edit) row.append(btn('copy', v.id, '編集用プロンプトをコピー', !ok));
      row.append(btn('pick', v.id, 'できた画像を読み込む', !ok));
      fs.querySelector('.note').textContent = has ? '画像あり（読み込むと置き換えます）' : '画像なし';
      if (edit && ok) {
        const d = document.createElement('details'), pre = document.createElement('pre');
        d.innerHTML = '<summary>編集用プロンプトを見る</summary>';
        pre.textContent = F.buildEditPrompt(stage, v.id); pre.dataset.prompt = v.id;
        d.append(pre); fs.append(d);
      }
      box.append(fs);
    }
    $('compare').disabled = !F.hasBase(flow);
    $('compare').setAttribute('aria-pressed', String(compare && F.hasBase(flow)));
    $('saveBase').hidden = edit;
    const sh = flow.states.sheathed;
    $('saveBase').disabled = !(sh.front && sh.back) || F.baseMatches(flow);
    $('exportPng').disabled = !(flow.states[stage].front || flow.states[stage].back);
  }
  function btn(act, view, label, disabled) {
    const b = document.createElement('button');
    b.dataset.act = act; b.dataset.view = view; b.textContent = label; b.disabled = disabled;
    b.setAttribute('aria-label', `${viewName(view)}：${label}`);
    return b;
  }

  function render() {
    document.querySelectorAll('[data-size-warn]').forEach((e) => e.remove());
    renderStages(); renderOps(); renderPics(); renderStatus();
  }

  // 失敗しても今の作業を残すため、例外は表示だけにします。
  function guard(fn) {
    return async (...args) => {
      try { await fn(...args); } catch (e) { showError(e.message); renderStatus(); }
    };
  }
  function mayReplace() { return !dirty || confirm('未保存の変更があります。今の制作データを置き換えますか？'); }

  // ---- 段階の切替 ----
  $('stages').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stage]'); if (!b) return;
    stage = b.dataset.stage; act(`${stageOf(stage).no}${stageOf(stage).name}へ移動`); render();
  });

  // ---- 段階の操作 ----
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/webp'; picker.hidden = true; picker.id = 'imageFile';
  document.body.append(picker);
  document.querySelector('.ops').addEventListener('click', guard(async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'goto-sheathed') { stage = 'sheathed'; act('①納刀へ移動'); render(); return; }
    if (!F.canWork(flow, stage)) throw new Error('先に①で納刀を基準として保存してください');
    const view = b.dataset.view;
    if (b.dataset.act === 'pick') { pickView = view; picker.value = ''; picker.click(); }
    if (b.dataset.act === 'copy') {
      const text = F.buildEditPrompt(stage, view);
      try { await navigator.clipboard.writeText(text); }
      catch {
        const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select();
        const okCopy = document.execCommand('copy'); t.remove();
        if (!okCopy) throw new Error('コピーできませんでした。「編集用プロンプトを見る」から選択してコピーしてください');
      }
      act(`${stageOf(stage).name}・${viewName(view)}の編集用プロンプトをコピー`); renderStatus();
    }
  }));
  // 新しい画像は検査を通ってから差し替えます。失敗したら表示中の画像はそのまま。
  picker.addEventListener('change', guard(async () => {
    const file = picker.files[0], view = pickView; picker.value = '';
    if (!file || !view) return;
    const { url, img } = await readImageFile(file);
    images.set(url, img);
    flow.states[stage][view] = url;
    if (flow.source === 'none') flow.source = 'ローカルファイル';
    changed(`${stageOf(stage).name}・${viewName(view)}に${file.name}を読み込み`);
  }));

  $('compare').addEventListener('click', () => { compare = !compare; act(compare ? '基準と比較を表示' : '比較を閉じた'); render(); });
  $('saveBase').addEventListener('click', guard(() => {
    if (F.hasBase(flow) && !F.baseMatches(flow) &&
      !confirm('今の納刀の基準を上書きします。②抜刀・③素手の画像は前の基準から作ったものです。上書きしますか？')) return;
    F.saveBase(flow);
    changed('①納刀を基準として保存');
  }));

  // ---- 保存・書き出し ----
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const toBlob = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  $('exportPng').addEventListener('click', guard(async () => {
    const names = [];
    for (const v of F.VIEWS) {
      const img = images.get(flow.states[stage][v.id]); if (!img) continue;
      const c = makeCanvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0);
      const name = `standee-${stage}-${v.id}.png`; download(name, await toBlob(c)); names.push(name);
    }
    if (!names.length) throw new Error('この段階の画像がありません');
    act(`PNGを保存：${names.join('、')}`); renderStatus();
  }));
  $('saveFlow').addEventListener('click', guard(() => {
    const text = JSON.stringify(flow);
    if (text.length > F.LIMITS.jsonChars) throw new Error('画像込みの制作データが上限を超えます');
    download('standee-flow.json', new Blob([text], { type: 'application/json' }));
    dirty = false; act('制作データを保存（standee-flow.json）'); renderStatus();
  }));
  $('openFlow').addEventListener('click', () => { if (mayReplace()) { $('flowFile').value = ''; $('flowFile').click(); } });
  $('flowFile').addEventListener('change', guard(async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > F.LIMITS.jsonChars * 4) throw new Error('制作データのファイルが大きすぎます');
    const next = F.parseFlow(await f.text());
    // 画像を全部読めてから差し替えます。途中で失敗したら今の作業はそのまま。
    const loaded = new Map();
    for (const u of F.imageUrls(next)) {
      try { loaded.set(u, await loadImage(u)); } catch (err) { throw new Error('制作データ内の画像: ' + err.message); }
    }
    flow = next; images = loaded; dirty = false; compare = false;
    act(`${f.name}を開いた`); render();
  }));

  // ---- 試作デモ：既存ガレス3状態を core の合成でPNGにして読み込む ----
  $('loadDemo').addEventListener('click', guard(async () => {
    if (!mayReplace()) return;
    const next = F.newFlow(), loaded = new Map();
    for (const s of F.STAGES) {
      const res = await fetch(DEMO + s.id + '.json');
      if (!res.ok) throw new Error(`試作デモを読めません（${res.status}）。README の起動方法でリポジトリ直下から配信してください`);
      const p = C.parseProject(await res.text()), layerImages = new Map();
      for (const v of C.VIEWS) for (const l of C.LAYERS) {
        const u = p.views[v.id].layers[l.id].image;
        if (u && !layerImages.has(u)) layerImages.set(u, await loadImage(u));
      }
      for (const v of C.VIEWS) {
        const c = makeCanvas(C.WIDTH, C.HEIGHT);
        C.drawView(c.getContext('2d'), p.views[v.id], layerImages, makeCanvas, { guides: false });
        const url = c.toDataURL('image/png');
        loaded.set(url, await loadImage(url));
        next.states[s.id][v.id] = url;
      }
    }
    F.saveBase(next);
    next.source = '試作デモ：ガレス3状態（既存の合成。採否は未判定）';
    // ponytail: デモはいつでも作り直せるので未保存扱いにしない
    flow = next; images = loaded; compare = false; stage = 'sheathed'; dirty = false;
    act('試作デモ（ガレス）を開いた'); render();
  }));

  // ---- 未保存のまま離れない ----
  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  render();
})();
