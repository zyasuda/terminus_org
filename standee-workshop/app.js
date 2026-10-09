// 衣装部屋の画面。状態の規則は wardrobe.js、ここは表示と入力だけ。
(function () {
  'use strict';
  const W = window.Wardrobe;
  const $ = (id) => document.getElementById(id);
  $('view-curved-set').addEventListener('click', () => $('curved-set').showModal());
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const images = new Map();
  const VIEW_NAME = { front: '正面', back: '背面' };
  const ITEM_NAME = { sword: '片手剣', scabbard: '鞘', staff: '杖', lantern: 'ランタン', necklace: '琥珀の首飾り', hammer: '金槌', shield: '盾', axe: '手斧' };
  const ACTOR_NAME = { gareth: 'ガレス', maren: 'マレン', brom: 'ブロム', lydia: 'リディア' };
  const WORN = { gareth: '鎧は着用中', maren: '旅装は着用中', brom: '鎧は着用中', lydia: '旅装は着用中' };
  const BROM_PLACE = { hammer: 'ブロムの右手に', shield: 'ブロムの左腕に', axe: 'ブロムの右手に' };
  const NUDGE = 2, NUDGE_FAST = 6;      // 矢印キー1回の移動量（px）。Shift で速く

  // 俳優ごとの身支度と取り消し履歴。切り替えても残り、他人の履歴には混ざらない
  let actor = 'gareth';
  const casts = {
    gareth: { state: W.initialState(), history: [] }, maren: { state: W.maren.initialState(), history: [] },
    brom: { state: W.brom.initialState(), history: [] },
    lydia: { state: W.lydia.initialState(), history: [] },
  };
  let { state, history } = casts.gareth;
  const RULES = { gareth: W, maren: W.maren, brom: W.brom, lydia: W.lydia };
  const rules = () => RULES[actor];   // いまの俳優の規則
  let dragItem = null;                  // 棚から運んでいる品
  let press = null;                     // 人物の上で押している品 { p, item, base, moved }
  let card = null;                      // 開いている操作カード { item, opener, key }

  function say(msg) { $('announce').textContent = msg; $('hint').textContent = msg; }

  // 取り消しできる操作。変化しなければ履歴に積まない
  function commit(next, msg) {
    if (next === state) return false;
    history.push(state);
    state = next;
    if (msg) say(msg);
    render();
    return true;
  }
  function undo() {
    const prev = history.pop();
    if (!prev) return;
    state = rules().setView(prev, state.view);   // 向きは今のまま
    say('ひとつ前に戻しました');
    render();
  }

  function switchActor(next) {
    if (next === actor) return;
    casts[actor] = { state, history };
    actor = next;
    ({ state, history } = casts[actor]);
    card = null; press = null; dragItem = null;
    document.body.dataset.actor = actor;
    for (const b of document.querySelectorAll('.cast button')) b.setAttribute('aria-pressed', String(b.dataset.actor === actor));
    for (const el of document.querySelectorAll('.shelf-items')) el.hidden = el.dataset.actor !== actor;
    for (const el of document.querySelectorAll('.actor-name')) el.textContent = ACTOR_NAME[actor];
    document.querySelector('.shelf > .note').hidden = actor === 'lydia';
    document.querySelector('.outfits').hidden = actor !== 'maren';
    $('spare-peg').hidden = actor === 'maren';
    canvas.setAttribute('aria-label', {
      gareth: 'ガレス。鞘を着けているときは矢印キーで鞘を少しずらせます',
      lydia: 'リディア。素手の正面と背面を見られます',
      maren: 'マレン。持ち物は手に持つだけで、位置は動かしません',
      brom: 'ブロム。金槌か手斧は右手、盾は左腕に着けるだけで、位置は動かしません',
    }[actor]);
    say(`${ACTOR_NAME[actor]}の身支度です`);
    render();
  }

  // 着けた瞬間の光と揺れ（reduced-motion では CSS 側で止める）
  function flash() {
    canvas.classList.remove('equip-flash');
    void canvas.offsetWidth;
    canvas.classList.add('equip-flash');
  }
  canvas.addEventListener('animationend', () => canvas.classList.remove('equip-flash'));

  function paint(target, view) {
    const c = target.getContext('2d');
    c.clearRect(0, 0, W.WIDTH, W.HEIGHT);
    const frame = W.displayFrame(actor, view);
    c.save(); c.translate(frame.x, frame.y); c.scale(frame.scale, frame.scale);
    W.drawView(c, rules().layers(state, view), images, (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }));
    c.restore();
  }

  // 運んでいる剣の行き先を輪で、鞘の取り付け位置を真鍮の枠で示す
  function paintGuides() {
    const v = state.view;
    const frame = W.displayFrame(actor, v);
    ctx.save(); ctx.translate(frame.x, frame.y); ctx.scale(frame.scale, frame.scale); ctx.strokeStyle = '#e0c27f'; ctx.fillStyle = '#e0c27f';
    if (actor === 'maren') {
      // 運んでいる品を持つ手の位置
      if (dragItem) {
        const p = W.maren.itemPoint({ ...state, hold: dragItem, necklace: true }, v, dragItem);
        ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, Math.PI * 2); ctx.stroke();
      }
      return ctx.restore();
    }
    if (actor === 'brom') {
      // 運んでいる品を着ける位置（金槌・手斧は右手、盾は左腕）。着けた後の姿で示す
      if (dragItem) {
        const p = W.brom.itemPoint(W.brom.wear(state, dragItem, true), v, dragItem);
        ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, Math.PI * 2); ctx.stroke();
      }
      return ctx.restore();
    }
    if (dragItem === 'sword') {
      const pts = [W.HAND_POINT[v]];
      if (state.scabbard === 'waist') pts.push(W.itemPoint(state, v, 'scabbard'));
      ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (dragItem === 'scabbard' || (press && press.moved && press.item === 'scabbard') || (card && card.item === 'scabbard')) {
      const b = W.WAIST_POINT[v], R = W.SCABBARD_RANGE, m = W.itemPoint(state, v, 'scabbard');
      ctx.lineWidth = 2; ctx.strokeRect(b.x - R, b.y - R, R * 2, R * 2);   // 動かせる範囲
      ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, Math.PI * 2); ctx.fill();   // いまの位置
    }
    ctx.restore();
  }

  // 操作カード
  const ACTIONS = {
    sheathe: { label: '納刀する', run: () => commit(W.sheathe(state), '剣を鞘に納めました') && flash() },
    draw: { label: '抜刀する', run: () => commit(W.draw(state), '剣を抜きました') && flash() },
    return: {
      label: '棚へ戻す',
      run: (item) => {
        if (actor === 'maren') return commit(W.maren.hold(state, null), `${ITEM_NAME[item]}を棚へ戻しました`);
        if (actor === 'brom') return commit(W.brom.wear(state, item, false), `${ITEM_NAME[item]}を棚へ戻しました`);
        return item === 'sword'
          ? commit(W.returnSword(state), '剣を棚へ戻しました')
          : commit(W.removeScabbard(state), state.sword === 'scabbard' ? '鞘を剣ごと棚へ戻しました' : '鞘を棚へ戻しました');
      },
    },
    remove: { label: '外す', run: () => commit(W.maren.wear(state, false), '琥珀の首飾りを外しました') },
  };
  function openCard(item, opener) {
    if (!rules().cardActions(state, item)) return;
    card = { item, opener, key: '' };
    render();
    $('card').querySelector('button').focus();
  }
  function closeCard(refocus) {
    if (!card) return;
    const { opener } = card;
    card = null;
    render();
    if (refocus) (opener.hidden ? canvas : opener).focus();
  }
  function renderCard() {
    const el = $('card'), actions = card && rules().cardActions(state, card.item);
    if (card && !actions) card = null;       // 品が棚へ戻ったら閉じる
    for (const b of document.querySelectorAll('.stage-actions button')) b.setAttribute('aria-expanded', String(!!card && card.item === b.dataset.item));
    el.hidden = !card;
    if (!card) return;
    const key = card.item + ':' + actions.join();
    if (card.key !== key) {                  // 中身が変わったときだけ作り直す（フォーカスを保つ）
      card.key = key;
      $('card-title').textContent = ITEM_NAME[card.item];
      const box = el.querySelector('.card-actions');
      box.replaceChildren(...actions.map((a) => {
        const b = document.createElement('button');
        b.textContent = ACTIONS[a].label;
        b.addEventListener('click', () => {
          const { item, opener } = card;
          card = null;                       // 操作したら閉じる
          ACTIONS[a].run(item);
          render();
          (opener.hidden ? canvas : opener).focus();
        });
        return b;
      }));
    }
    // 品の少し下に置き、画面の外へ出ないよう左右を詰める
    const p = rules().itemPoint(state, state.view, card.item), r = canvas.getBoundingClientRect(), d = $('dais').getBoundingClientRect();
    const frame = W.displayFrame(actor, state.view);
    const x = r.left - d.left + (frame.x + p.x * frame.scale) * r.width / W.WIDTH, y = r.top - d.top + (frame.y + p.y * frame.scale) * r.height / W.HEIGHT;
    const left = Math.max(8 - d.left, Math.min(x - el.offsetWidth / 2, document.documentElement.clientWidth - 8 - d.left - el.offsetWidth));
    el.style.left = left + 'px';
    el.style.top = (y + 28) + 'px';
  }

  // ブロムに item を着けると、排他で棚へ戻る品の名前（手斧⇔金槌）。無ければ空文字
  function bumped(item) {
    const next = W.brom.wear(state, item, true);
    return W.brom.ITEMS.filter((i) => state[i] && !next[i]).map((i) => ITEM_NAME[i]).join('と');
  }

  // 棚の品の居場所
  function where(item) {
    if (actor === 'maren') {
      if (item === 'none') return state.hold ? '持ち物を棚へ戻します' : 'いまは何も持っていません';
      if (item === 'necklace') return state.necklace ? 'マレンの胸元に' : '棚にあります';
      return state.hold === item ? 'マレンの右手に' : '棚にあります';
    }
    if (actor === 'brom') {
      if (state[item]) return BROM_PLACE[item];
      const back = bumped(item);   // 着けると棚へ戻る品を、操作の前に知らせる
      return back ? `棚にあります（着けると${back}は棚へ）` : '棚にあります';
    }
    return {
      sword: { shelf: '棚にあります', hand: 'ガレスの右手に', scabbard: '鞘に納まっています' }[state.sword],
      scabbard: { shelf: '棚にあります', waist: 'ガレスの左腰に' }[state.scabbard],
    }[item];
  }

  function render() {
    paint(canvas, state.view);
    paintGuides();
    $('outfit').textContent = rules().outfitLabel(state);
    if (actor === 'maren') {
      if (state.outfit === 'dark') {
        thumb('thumb-staff', W.MAREN_DIR + 'dark-staff-v1.png', 20, 30, 140, 330);
        thumb('thumb-lantern', W.MAREN_DIR + 'dark-lantern-v1.png', 40, 475, 125, 250);
      } else {
        thumb('thumb-staff', W.MAREN_DIR + 'staff-front-source.png', 25, 80, 110, 420);
        thumb('thumb-lantern', W.MAREN_DIR + 'maren-lantern-review.png', 140, 510, 130, 290);
      }
    }
    $('worn-tag').textContent = actor === 'maren' && state.outfit === 'dark' ? '黒の旅装は着用中' : WORN[actor];
    for (const b of document.querySelectorAll('.outfits button')) {
      b.setAttribute('aria-pressed', String(actor === 'maren' && b.dataset.outfit === state.outfit));
      b.disabled = b.dataset.outfit === 'dark' && !W.maren.darkReady;   // 黒の3姿が揃うまで準備中
      if (b.disabled) b.title = '準備中';
    }
    const gareth = actor === 'gareth', maren = actor === 'maren', brom = actor === 'brom';
    $('open-sword').hidden = !gareth || state.sword === 'shelf';
    $('open-scabbard').hidden = !gareth || state.scabbard !== 'waist';
    $('open-hold').hidden = !maren || !state.hold;
    if (maren && state.hold) $('open-hold').dataset.item = state.hold;
    $('open-necklace').hidden = !maren || !state.necklace;
    $('open-hammer').hidden = !brom || !state.hammer;
    $('open-shield').hidden = !brom || !state.shield;
    $('open-axe').hidden = !brom || !state.axe;
    renderCard();
    for (const b of document.querySelectorAll('.turn button')) {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      b.classList.toggle('needs', b.dataset.view === state.unchecked);
    }
    $('unchecked').textContent = state.unchecked
      ? `${VIEW_NAME[state.unchecked === 'back' ? 'front' : 'back']}で鞘を動かしました。${VIEW_NAME[state.unchecked]}はまだ見ていません（前後は自動では揃いません）。`
      : '';
    $('undo').disabled = history.length === 0;
    for (const slot of document.querySelectorAll(`.shelf-items[data-actor="${actor}"] .slot[data-item]`)) {
      const item = slot.dataset.item, out = rules().isOut(state, item), btn = slot.querySelector('.item');
      slot.classList.toggle('out', out);
      if (item !== 'none') btn.setAttribute('draggable', String(!out));
      btn.setAttribute('aria-disabled', String(out));
      slot.querySelector('.where').textContent = where(item);
    }
  }

  // 棚の品を着ける（クリック・キーボード・ドロップ共通）
  function equip(item, point) {
    let done;
    if (actor === 'maren' && item === 'necklace') {
      done = commit(W.maren.wear(state, true), state.view === 'back'
        ? '琥珀の首飾りを着けました。背面では髪に隠れます（正面で胸元を押すと外せます）'
        : '琥珀の首飾りを着けました。胸元を押すと外せます');
    } else if (actor === 'maren') {
      const prev = state.hold, next = item === 'none' ? null : item;
      done = commit(W.maren.hold(state, next), !next
        ? `${ITEM_NAME[prev]}を棚へ戻しました。マレンは何も持っていません`
        : prev
          ? `${ITEM_NAME[next]}に持ち替えました（${ITEM_NAME[prev]}は棚へ）`
          : `マレンに${ITEM_NAME[next]}を持たせました。手元を押すと棚へ戻せます`);
    } else if (actor === 'brom') {
      const back = bumped(item);
      done = commit(W.brom.wear(state, item, true), {
        hammer: back ? `金槌に持ち替えました（${back}は棚へ）。金槌を押すと棚へ戻せます` : 'ブロムの右手に金槌を持たせました。金槌を押すと棚へ戻せます',
        shield: 'ブロムの左腕に盾を着けました。盾を押すと棚へ戻せます',
        axe: back ? `手斧に持ち替えました（${back}は棚へ）。手斧を押すと棚へ戻せます` : 'ブロムの右手に手斧を持たせました。手斧を押すと棚へ戻せます',
      }[item]);
    } else if (item === 'sword') {
      const target = point ? W.swordTarget(state, state.view, point) : 'hand';
      done = commit(W.giveSword(state, target), target === 'hand'
        ? 'ガレスの右手に剣を渡しました。手を押すと納刀や棚へ戻すができます'
        : '剣を鞘に納めました。鞘を押すと操作できます');
    } else done = commit(W.wearScabbard(state), '鞘を左腰に着けました。ドラッグで少しずらせます');
    if (done) flash();
    return done;
  }

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    const frame = W.displayFrame(actor, state.view);
    return { x: ((e.clientX - r.left) * W.WIDTH / r.width - frame.x) / frame.scale, y: ((e.clientY - r.top) * W.HEIGHT / r.height - frame.y) / frame.scale };
  }

  // 棚
  for (const slot of document.querySelectorAll('.slot[data-item]')) {
    const item = slot.dataset.item, btn = slot.querySelector('.item');
    btn.addEventListener('click', () => { if (!rules().isOut(state, item)) equip(item); });
    btn.addEventListener('dragstart', (e) => {
      if (rules().isOut(state, item)) return e.preventDefault();
      dragItem = item; e.dataTransfer.setData('text/plain', item); e.dataTransfer.effectAllowed = 'move';
      $('dais').classList.add('drop-on');
      say(actor === 'maren' ? (item === 'necklace' ? '輪のあたりへ落とすと、首飾りを着けます' : '輪のあたりへ落とすと、マレンが持ちます')
        : actor === 'brom' ? { hammer: '輪のあたりへ落とすと、右手に金槌を持ちます', shield: '輪のあたりへ落とすと、左腕に盾を着けます', axe: '輪のあたりへ落とすと、右手に手斧を持ちます' }[item]
          + (bumped(item) ? `（${bumped(item)}は棚へ）` : '')
        : item === 'sword'
          ? (state.scabbard === 'waist' ? '右手の輪で手に、腰の輪で鞘に納めます' : '右手の輪へ落とすと剣を持ちます')
          : '左腰の枠のあたりへ落とします');
      render();
    });
    btn.addEventListener('dragend', () => {
      dragItem = null; $('dais').classList.remove('drop-on');
      if (!rules().isOut(state, item)) say('');   // 落とさなかったら案内を消す
      render();
    });
  }
  canvas.addEventListener('dragover', (e) => { if (dragItem) e.preventDefault(); });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const item = dragItem || e.dataTransfer.getData('text/plain');
    if (rules().ITEMS.includes(item)) equip(item, toCanvas(e));   // 他の俳優の品は受け取らない
  });

  // 人物の上：押して離せばカード、動かせば鞘をずらす
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e), item = rules().hitItem(state, state.view, p);
    if (!item) return closeCard(false);
    press = { p, item, base: state, moved: false };
    canvas.setPointerCapture(e.pointerId);
    if (item === 'scabbard') canvas.classList.add('grabbing');
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    if (!press) {
      const item = rules().hitItem(state, state.view, p);
      canvas.classList.toggle('over-scabbard', item === 'scabbard');
      canvas.classList.toggle('over-hand', !!item && item !== 'scabbard');
      return;
    }
    if (!press.moved && !W.isDrag(press.p, p)) return;
    press.moved = true;
    if (press.item !== 'scabbard') return;
    state = W.nudgeScabbard(press.base, state.view, Math.round(p.x - press.p.x), Math.round(p.y - press.p.y));
    render();
  });
  const endPress = (e) => {
    if (!press) return;
    const pr = press;
    press = null;
    canvas.classList.remove('grabbing');
    if (pr.moved) {                          // ドラッグだったのでカードは開かない
      if (state !== pr.base) { history.push(pr.base); say(edgeMsg()); }
      render();
    } else if (e.type === 'pointerup') openCard(pr.item, canvas);
  };
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', endPress);

  function edgeMsg() {
    const o = state.offset[state.view];
    return Math.abs(o.x) === W.SCABBARD_RANGE || Math.abs(o.y) === W.SCABBARD_RANGE ? 'これ以上は動きません' : '鞘の位置を整えました';
  }
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? NUDGE_FAST : NUDGE;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    if (actor === 'lydia') return say('リディアは素手です');
    if (actor === 'maren') return say('マレンの持ち物は手に持つだけで、位置は動かしません');
    if (actor === 'brom') return say('ブロムの金槌・手斧・盾は着けるだけで、位置は動かしません');
    if (state.scabbard !== 'waist') return say('鞘を着けると、矢印キーで位置を整えられます');
    if (!commit(W.nudgeScabbard(state, state.view, d[0], d[1]))) return say('これ以上は動きません');
    say(edgeMsg());
  });

  // 台の下：カードへのもう一つの入口（キーボード・支援技術向け）
  for (const b of document.querySelectorAll('.stage-actions button')) {
    b.addEventListener('click', () => (card && card.item === b.dataset.item ? closeCard(true) : openCard(b.dataset.item, b)));
  }
  // カードの外を押したら閉じる（人物の上は canvas 側で扱う）
  document.addEventListener('pointerdown', (e) => {
    if (card && !$('card').contains(e.target) && e.target !== canvas && !e.target.closest('.stage-actions')) closeCard(false);
  });

  // 衣装掛け：マレンの着替え（取り消しできる）
  for (const b of document.querySelectorAll('.outfits button')) {
    b.addEventListener('click', () => {
      const next = b.dataset.outfit;
      if (commit(W.maren.dress(state, next), next === 'dark' ? '黒の旅装に着替えました' : 'いつもの旅装に着替えました')) flash();
    });
  }

  // 見出し：俳優の切替
  for (const b of document.querySelectorAll('.cast button')) b.addEventListener('click', () => switchActor(b.dataset.actor));

  // 床
  for (const b of document.querySelectorAll('.turn button')) {
    b.addEventListener('click', () => { card = null; state = rules().setView(state, b.dataset.view); say(`${VIEW_NAME[state.view]}を見ています`); render(); });
  }
  $('undo').addEventListener('click', undo);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Escape' && card) closeCard(true);
  });
  $('wings').addEventListener('click', () => {
    card = null;
    paint($('wings-front'), 'front');
    paint($('wings-back'), 'back');
    if (actor === 'gareth') state = { ...state, unchecked: null };   // 並べて見たので両面とも確認済み
    render();
    $('wings-dialog').showModal();
  });

  // 棚の絵（品の画像から切り出す）
  function thumb(id, src, sx, sy, sw, sh, filter) {
    const c = $(id), g = c.getContext('2d'), img = images.get(src);
    const k = Math.min(c.width / sw, c.height / sh), w = sw * k, h = sh * k;
    g.save();
    if (filter) g.filter = filter;
    g.drawImage(img, sx, sy, sw, sh, (c.width - w) / 2, (c.height - h) / 2, w, h);
    g.restore();
  }

  const FILES = ['body-front.png', 'body-back.png', 'sheathed-front.png', 'sheathed-back.png', 'scabbard-empty-front.png',
    'scabbard-empty-and-cuff-back.png', 'hand-sword-front.png', 'grip-back.png', 'blade-back.png'].map((f) => W.DIR + f)
    .concat(['maren-empty-review.png', 'maren-lantern-review.png', 'staff-front-source.png', 'staff-back-source.png'].map((f) => W.MAREN_DIR + f))
    .concat([...new Set(Object.values(W.maren.MAREN_DARK_SRC).filter(Boolean).flatMap((p) => [p.front.src, p.back.src]))].map((f) => W.MAREN_DIR + f))
    .concat([W.maren.NECKLACE.src, W.lydia.src])
    .concat([...new Set(Object.values(W.brom.BROM_SRC).flatMap(p => Object.values(p).map(q => W.BROM_DIR + q.src)))]);
  Promise.all(FILES.map((f) => new Promise((ok, ng) => {
    const img = new Image();
    img.onload = () => { images.set(f, img); ok(); };
    img.onerror = () => ng(new Error(f));
    img.src = f;
  }))).then(() => {
    thumb('thumb-sword', W.DIR + 'hand-sword-front.png', 0, 240, 1159, 1060);
    thumb('thumb-scabbard', W.DIR + 'scabbard-empty-front.png', 430, 535, 140, 440);
    thumb('thumb-staff', W.MAREN_DIR + 'staff-front-source.png', 25, 80, 110, 420);   // 杖の頭（全長だと細すぎて見えない）
    thumb('thumb-lantern', W.MAREN_DIR + 'maren-lantern-review.png', 140, 510, 130, 290);
    thumb('thumb-necklace', W.maren.NECKLACE.src, 140, 95, 1122, 925);
    thumb('thumb-hammer', W.BROM_DIR + 'muted-hammer-v1.png', 45, 525, 255, 260, W.brom.BROM_FILTER);
    thumb('thumb-shield', W.BROM_DIR + 'muted-shield-v1.png', 627, 310, 201, 350, W.brom.BROM_FILTER);
    thumb('thumb-axe', W.BROM_DIR + 'muted-axe-v1.png', 60, 525, 245, 270, W.brom.BROM_FILTER);
    render();
    document.body.dataset.ready = '1';
  }, (e) => { $('load-error').textContent = `素材を読み込めません（${e.message}）。README の起動方法で開いてください。`; });
})();
