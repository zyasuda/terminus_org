import { bindChronicle, exportChronicleFile } from "./chronicle.js";
import {
  initialState,
  STAGNATION_SOFT,
  stateFingerprint as buildStateFingerprint,
  takeInjuryCue as buildInjuryCue,
  takeStagnationCue as buildStagnationCue
} from "./state.js";
import { callGmApi } from "./llm.js";
import { CAST, BANTER, SCENARIO } from "./scenario.js";
// 報告シーンの②層をプレイ結果から動的に組み立てる(world_flagsの簡易版)
function reportDirection() {
  let d = "依頼人マイラ・ヴェインを演じよ。実利的だが村人思いに見える元行商人。";
  d += state.defeated.includes("灯の番人")
    ? "『番人を倒した』という報告には、一瞬の落胆を見せてから取り繕い、労をねぎらわせよ。"
    : "坑道の奥にいた『誰か』の話には、身を乗り出すほどの関心を見せよ。";
  if (state.items.includes("心石の欠片") || revealed.has("s3b")) {
    d += "『青く脈打つ石』や『番人の動力』に話が及んだら、抑えきれない関心を一瞬見せ、すぐに取り繕え。この動揺の理由を説明してはならない。";
  }
  return d;
}

let state, history, revealed, busy, chron; // chron: Chronicle用の構造化イベントログ

function stateFingerprint() {
  return buildStateFingerprint({ SCENARIO, state, revealed });
}

function takeStagnationCue() {
  return buildStagnationCue(state);
}

function takeInjuryCue() {
  return buildInjuryCue(state);
}

function exportChronicle() {
  bindChronicle({ SCENARIO, CAST, state, chron, revealed });
  exportChronicleFile();
}

// コスト概算レート(USD/100万トークン)。モデルはサーバー側で決まるため、
// ここは「桁感を掴む」ための目安。実運用の請求額とは一致しない。
const TOKEN_RATE = { in: 3.0, out: 15.0, usdToJpy: 155 };

/* ---------------- 中断・再開(自動保存) ----------------
   「中断ボタン」は用意しない。中断は多くの場合、突発的(タブを誤って
   閉じる・PCがスリープする等)であり、押し忘れれば意味がないため。
   代わりに、状態が変わるたびにlocalStorageへ黙って自動保存し、
   次に開いた時は自動で続きから再開する。「最初から」は保存も消す。
   セッション管理(保存・再開)は物語情報ではないので、GMには一切通さない
   ——三層知識モデルは物語の秘密を管理する層であって、UIの状態管理はここを通さない。 */
const SAVE_KEY = "terminus_save_v1";

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, chron, history, revealed: [...revealed] }));
  } catch (e) { /* 容量超過・プライベートモード等で失敗してもプレイは止めない */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no-op */ }
}

// chronの1件をDOMへ再生する(chronへの再pushはしない=保存済みログをそのまま画面に描き直すだけ)
function renderChronEntry(e) {
  switch (e.kind) {
    case "gm": addMsg("gm", e.text); break;
    case "player": addMsg("player", e.text); break;
    case "sys": addMsg("sysnote", e.text); break;
    case "companion": {
      const name = (CAST[e.who] && CAST[e.who].name) || "ガレス";
      addMsg("companion companion-" + e.who, name + "「" + e.text + "」");
      break;
    }
    case "dice": {
      const el = document.createElement("div");
      el.className = "msg dice";
      const label = e.crit ? "クリティカル!" : e.fumble ? "ファンブル…" : e.ok ? "成功" : "失敗";
      el.innerHTML = `🎲 ${esc(e.reason)} — d20 → <b>${e.roll}</b> / DC ${e.diff} … <b class="${e.ok ? "ok" : "ng"}">${label}</b>`;
      chat().appendChild(el);
      const log = document.getElementById("diceLog");
      log.innerHTML = `[T${e.t}] d20=${e.roll} vs DC${e.diff} ${e.ok ? "OK" : "NG"}${e.crit ? " CRIT" : ""}${e.fumble ? " FUMBLE" : ""} (${esc(e.reason)})<br>` + log.innerHTML;
      break;
    }
    case "reveal": {
      const el = document.createElement("div");
      el.className = "msg reveal";
      el.textContent = "🔓 情報開示:システムがこの秘密をLLMに注入した";
      chat().appendChild(el);
      break;
    }
    case "hp": break; // チャットには出さない項目(クロニクルのみで使う)
  }
}

function restoreGame(saved) {
  state = saved.state;
  chron = saved.chron || [];
  history = saved.history || [];
  revealed = new Set(saved.revealed || []);
  busy = false;
  document.getElementById("chat").innerHTML = "";
  document.getElementById("diceLog").innerHTML = "";
  chron.forEach(renderChronEntry);
  chat().scrollTop = chat().scrollHeight;
  addNote(`↻ 前回の続きから再開しました(シーン${state.sceneIndex + 1} / ターン${state.turn})`);
  renderDebug();
}

function boot() {
  renderModelInfo();
  const saved = loadGame();
  if (saved && saved.state && Array.isArray(saved.chron)) {
    try { restoreGame(saved); return; } catch (e) { /* 壊れた保存は無視して新規開始 */ }
  }
  resetGame();
}

function resetGame() {
  clearSave();
  state = initialState();
  history = [];
  revealed = new Set();
  chron = [];
  busy = false;
  document.getElementById("chat").innerHTML = "";
  document.getElementById("diceLog").innerHTML = "";
  if (SCENARIO.scenes[0].img) addPic(SCENARIO.scenes[0].img);
  const openingBrief = SCENARIO.intro + "\n\n" + SCENARIO.scenes[0].brief;
  addGm(openingBrief + "\n\nどうする?");
  // シーン切替時と同じ理由(app.js内の該当コメント参照)で、LLMの会話履歴にも残しておく
  history.push({ role: "user", content: "【システム】セッションが始まった。" });
  history.push({ role: "assistant", content: JSON.stringify({ narration: openingBrief, companion: null, check: null, state_updates: null, engage_enemy: false, flee_enemy: false, scene_complete: false, meta_request: null }) });
  renderDebug();
}

/* ---------------- UI helpers ---------------- */
const chat = () => document.getElementById("chat");
// LLM出力を innerHTML に埋め込む箇所で必ず通す(信頼できない入力として扱う)
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function addMsg(cls, text) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  chat().appendChild(d);
  chat().scrollTop = chat().scrollHeight;
}
// LLMはプロンプトの文字数指示を守り切らないことがあるため、GMの語りは表示前に必ず短く切る(子ども向け可読性要件、GDD 1.7)
// 「」の中の句点では区切らない(鍵カッコが閉じる前に切れるのを防ぐ)。文の途中では切らず、常に文の切れ目で止める。
function trimNarration(text) {
  if (!text) return text;
  const sentences = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "「") depth++;
    else if (c === "」") depth = Math.max(0, depth - 1);
    else if ("。!?！？".includes(c) && depth === 0) {
      sentences.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) sentences.push(text.slice(start));

  let out = "";
  for (let i = 0; i < sentences.length; i++) {
    if (out && (out.length + sentences[i].length > 100 || i >= 3)) break;
    out += sentences[i];
  }
  if (!out) out = text;

  // 1文だけで100字を超える場合も、そのまま通さず切る(鍵カッコの途中で切れないよう少しだけ余裕を見る)
  if (out.length > 100) {
    let cut = out.slice(0, 100);
    let d = 0;
    for (const c of cut) { if (c === "「") d++; else if (c === "」") d = Math.max(0, d - 1); }
    if (d > 0) {
      const closeIdx = out.indexOf("」", 100);
      cut = (closeIdx !== -1 && closeIdx < 140) ? out.slice(0, closeIdx + 1) : out.slice(0, 100);
    }
    out = cut;
  }
  return out;
}
const addGm = t => { chron.push({ t: state.turn, ts: Date.now(), kind: "gm", text: t }); addMsg("gm", t); };
const addPlayer = t => { chron.push({ t: state.turn, ts: Date.now(), kind: "player", text: t }); addMsg("player", t); };
const addNote = t => { chron.push({ t: state.turn, ts: Date.now(), kind: "sys", text: t }); addMsg("sysnote", t); };
// 話者(who)対応。既定はガレス。リディアは別スタイルで表示する。
const addCompanion = (t, who = "gareth") => {
  const name = (CAST[who] && CAST[who].name) || "ガレス";
  chron.push({ t: state.turn, ts: Date.now(), kind: "companion", who, text: t });
  addMsg("companion companion-" + who, name + "「" + t + "」");
};
// クリティカル/ファンブル時の画面演出(フラッシュ+シェイク)
function screenFx(kind) {
  const fx = document.getElementById("fx");
  fx.className = ""; void fx.offsetWidth; // アニメーション再トリガーのためのreflow
  fx.className = kind;
  document.body.classList.remove("shake"); void document.body.offsetWidth;
  document.body.classList.add("shake");
  setTimeout(() => { fx.className = ""; document.body.classList.remove("shake"); }, 700);
}
// ダイス演出: 出目が高速で回転してから確定する。確定までawaitできる(判定確定を溜めてから語らせるため)
function addDice(roll, diff, ok, crit, fumble, reason) {
  const el = document.createElement("div");
  el.className = "msg dice";
  el.innerHTML = `🎲 ${esc(reason)} — d20 → <b class="rollnum">?</b> / DC ${diff} …`;
  chat().appendChild(el);
  chat().scrollTop = chat().scrollHeight;
  const num = el.querySelector(".rollnum");
  return new Promise(resolve => {
    const iv = setInterval(() => { num.textContent = 1 + Math.floor(Math.random() * 20); }, 60);
    setTimeout(() => {
      clearInterval(iv);
      num.textContent = roll;
      const label = crit ? "クリティカル!" : fumble ? "ファンブル…" : ok ? "成功" : "失敗";
      el.insertAdjacentHTML("beforeend", ` <b class="${ok ? "ok" : "ng"}">${label}</b>`);
      if (crit || fumble) screenFx(crit ? "crit" : "fumble");
      chron.push({ t: state.turn, ts: Date.now(), kind: "dice", roll, diff, ok, crit, fumble, reason });
      const log = document.getElementById("diceLog");
      log.innerHTML = `[T${state.turn}] d20=${roll} vs DC${diff} ${ok?"OK":"NG"}${crit?" CRIT":""}${fumble?" FUMBLE":""} (${esc(reason)})<br>` + log.innerHTML;
      resolve();
    }, 750);
  });
}
function addPic(src) {
  const d = document.createElement("div");
  d.className = "msg pic";
  const img = document.createElement("img");
  img.src = "images/" + src;
  img.onload = () => { chat().scrollTop = chat().scrollHeight; };
  d.appendChild(img);
  chat().appendChild(d);
}
function addReveal(text, img) {
  chron.push({ t: state.turn, ts: Date.now(), kind: "reveal", text });
  const el = document.createElement("div");
  el.className = "msg reveal";
  el.textContent = "🔓 情報開示:システムがこの秘密をLLMに注入した";
  chat().appendChild(el);
  if (img) addPic(img); // 画像も③層に従う: 開示条件を満たした時にだけ表示される
}

// トークン消費(通算)を右ペインに表示。桁感のためのコスト概算も添える(実請求とは別物)
function renderTokens() {
  const t = state.tokens;
  const total = t.in + t.out;
  const usd = (t.in / 1e6) * TOKEN_RATE.in + (t.out / 1e6) * TOKEN_RATE.out;
  const jpy = usd * TOKEN_RATE.usdToJpy;
  const perTurn = state.turn > 0 ? Math.round(total / state.turn) : 0;
  document.getElementById("tokenView").textContent =
    `入力 : ${t.in.toLocaleString()}\n` +
    `出力 : ${t.out.toLocaleString()}\n` +
    `合計 : ${total.toLocaleString()}  (API ${t.calls}回 / 1手番 約${perTurn.toLocaleString()})\n` +
    `概算 : $${usd.toFixed(4)} ≒ ¥${jpy.toFixed(1)}  ※目安`;
}

async function renderModelInfo() {
  const el = document.getElementById("modelView");
  if (!el) return;
  try {
    const res = await fetch("/api/model-info");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    el.textContent =
      `backend : ${info.backend}\n` +
      `model   : ${info.model}\n` +
      `source  : ${info.source}` +
      (info.normalizedConfiguredModel && info.normalizedConfiguredModel !== info.configuredModel
        ? `\nalias   : ${info.configuredModel} -> ${info.normalizedConfiguredModel}`
        : "") +
      (info.configuredModel && !info.configuredModelAccepted
        ? `\nignored : ${info.configuredModel}`
        : "");
  } catch (e) {
    el.textContent = `取得失敗: ${e.message}`;
  }
}

function renderDebug() {
  renderTokens();
  const curScene = SCENARIO.scenes[state.sceneIndex];
  document.getElementById("directionView").textContent = curScene.report ? reportDirection() : curScene.direction;
  document.getElementById("hpFill").style.width = (state.hp / state.maxHp * 100) + "%";
  document.getElementById("hpFill").style.background = state.hp <= 3 ? "var(--ng)" : "var(--ok)";
  document.getElementById("hpNum").textContent = `${state.hp}/${state.maxHp}`;
  document.getElementById("stateView").textContent = JSON.stringify(
    { scene: state.sceneIndex + 1, turn: state.turn, items: state.items,
      enemy: state.enemy ? { name: state.enemy.name, hp: state.enemy.hp + "/" + state.enemy.maxHp } : null,
      ambushResolved: state.ambushResolved || [],
      noProgressTurns: state.noProgressTurns },
    null, 1);
  const sv = document.getElementById("secretsView");
  sv.innerHTML = "";
  SCENARIO.scenes.forEach(sc => sc.secrets.forEach(s => {
    const open = revealed.has(s.id);
    const row = document.createElement("div");
    row.className = "secretRow " + (open ? "open" : "locked");
    row.innerHTML = `<span class="lock">${open ? "🔓" : "🔒"}</span><span class="body">${
      open ? s.text : "シーン" + sc.id + "の未開示情報(判定成功で開放)"}</span>`;
    sv.appendChild(row);
  }));
  saveGame(); // 状態が変わるたびに黙って自動保存(中断ボタンの代わり)
}

/* ---------------- ゲームロジック(システム側の権威) ---------------- */
// d20判定(GDD D-013): 出目20=クリティカル(自動成功)、出目1=ファンブル(自動失敗)
function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

// LLMが返した state_updates を検証・クランプして適用。勝手な回復や即死は許さない。
// opts.allowEnemyDamage: 敵ダメージを受理してよいか。プロンプト契約は「判定成功時のみ提案」
// なので、システム側でも判定成功のPhase Bに限って受理する(判定を経ないダメージは構造的に通らない)
function applyUpdates(u, opts = {}) {
  if (!u) return;
  if (typeof u.hp_delta === "number") {
    const delta = Math.max(-3, Math.min(2, Math.round(u.hp_delta)));
    state.hp = Math.max(0, Math.min(state.maxHp, state.hp + delta));
  }
  // 敵へのダメージ提案。判定成功時のみ有効、-1〜-3にクランプ(回復・即死は不可)
  if (opts.allowEnemyDamage && state.enemy && typeof u.enemy_hp_delta === "number") {
    const delta = Math.max(-3, Math.min(0, Math.round(u.enemy_hp_delta)));
    state.enemy.hp = Math.max(0, state.enemy.hp + delta);
  }
  // add_itemsはシーン定義のloot(ホワイトリスト)にある品のみ許可(D-021検証中)。
  // LLMが即興で作った品は構造的に入らない=次シーンへ持ち越されない
  if (Array.isArray(u.add_items)) {
    const allowed = SCENARIO.scenes[state.sceneIndex].loot || [];
    u.add_items.slice(0, 2).forEach(i => {
      if (i === "心石の欠片" && !revealed.has("s3b")) return;
      if (typeof i === "string" && allowed.includes(i) && !state.items.includes(i)) state.items.push(i);
    });
  }
  if (Array.isArray(u.remove_items)) u.remove_items.forEach(i => {
    const k = state.items.indexOf(i); if (k >= 0) state.items.splice(k, 1);
  });
}

// applyUpdatesの前後でHP変化を検知し、クロニクルに残す。
// (戦績には最終HPしか出ず、途中の増減が時系列から見えないと「日記」として不完全になる)
function applyUpdatesLogged(u, opts) {
  const before = state.hp;
  applyUpdates(u, opts);
  if (state.hp < before) state.pendingInjuryConcern = true;
  if (state.hp !== before) {
    chron.push({ t: state.turn, ts: Date.now(), kind: "hp", from: before, to: state.hp });
  }
}

// 相棒の発言。頻度の決定権はシステム側(3ターンのクールダウンで連発を防ぐ)。
// ただしプレイヤーが直接話しかけた時(addressed)はクールダウンを無視して必ず答える
// ——会話の最低限のルール(話しかけられたら返す)を頻度制御より優先する。
// who: "gareth"(既定) | "lydia"。
// ボケの素として溜めるのは「頼まれていない癖の一言(aside)」だけ。
// プレイヤーの質問への誠実な回答(addressed)や普通の進言はボケではない
// ——「発言=ボケ」と数えるとボケの無い場面にツッコミが暴発する(2026-07-04プレイで露見)。
function maybeCompanion(r, addressed) {
  if (!r.companion || !r.companion.say) return;
  const who = CAST[r.companion.who] ? r.companion.who : "gareth";
  if (addressed || state.turn - state.lastCompanionTurn >= 3) {
    const say = String(r.companion.say).slice(0, 120);
    addCompanion(say, who);
    state.lastCompanionTurn = state.turn;
    // aside(癖の一言)かつ呼びかけへの回答でない時だけ、ボケとして溜める
    if (r.companion.aside && !addressed) registerBoke(who, say);
  }
}

// 掛け合いを許可するか。悲劇・厳粛なシーン(noBanter)では完全に抑制する。
function banterAllowed() { return !SCENARIO.scenes[state.sceneIndex].noBanter; }

// 掛け合い:あるキャラの「癖の一言(ボケ)」を溜める。頻度と発火の決定権はシステム側。
// to=そのキャラを狙うペアの banterCharge を +1 し、retortEvery 到達でツッコミ権を発行。
// 実 retortEvery = 基準 - (from.retortDrive - 3)。駆動が高いほど早く噛む(下限2)。
// ※「何を言うか」はLLMに書かせる。ここではボケの文面(bokeLine)を持ち越すだけ。
function registerBoke(to, bokeLine) {
  if (!banterAllowed()) return; // 山場では溜めもしない
  BANTER.filter(b => b.to === to).forEach(b => {
    const key = b.from + ">" + b.to;
    state.banterCharge[key] = (state.banterCharge[key] || 0) + 1;
    const need = Math.max(2, b.retortEvery - ((CAST[b.from].retortDrive || 3) - 3));
    if (state.banterCharge[key] >= need) {
      state.banterCharge[key] = 0;
      // 次ターン頭で消化(時差成立=原則2)。ボケの文面も持ち越し、ツッコミが具体的に紐づくように。
      state.pendingRetort = { from: b.from, to: b.to, bokeLine };
    }
  });
}

// 発行済みのツッコミ権を「LLMへの演出許可(②層)」に変換して取り出す。
// システムは「いつ・誰が・何のボケに反応してよいか」までを決め、実際の台詞はLLMが書く。
// (定型文の暴発を避けるため、缶詰の台詞は例=トーン見本としてのみ渡す。)
function takeBanterCue() {
  const p = state.pendingRetort;
  state.pendingRetort = null;
  if (!p || !banterAllowed()) return "";   // 山場に入ったら溜まっていた権利も捨てる
  const pair = BANTER.find(b => b.from === p.from && b.to === p.to);
  if (!pair) return "";
  const fromName = CAST[p.from].name, toName = CAST[p.to].name;
  const samples = (pair.tsukkomi || []).slice(0, 2).join(" / ");
  return `\n# 掛け合い許可(この手番のみ・任意)\n先ほど${toName}が軽口をこぼした:「${p.bokeLine || "(先の一言)"}」\nこれに${fromName}が短く反応してよい。${fromName}らしい呆れ・皮肉、あるいは「ふん」と流す黙殺でもよい。40字以内。companion に who:"${p.from}" で入れ、aside:true とせよ。\nトーン見本(そのまま使わず、場に合わせて書き直せ): ${samples}\n※場面が緊迫・厳粛、または今この反応が不自然なら、無理に入れず companion は null でよい。`;
}

// 戦闘開始はLLMの提案(engage_enemy)をシステムが検証して確定する。
// 奇襲は resolveAmbushIfNeeded が扱う。ランダム遭遇だけで戦闘は始めない。
function maybeEngage(r) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  if (!sc.enemy || state.enemy || state.defeated.includes(sc.enemy.name)) return;
  if (r.engage_enemy) {
    state.enemy = { ...sc.enemy };
    if (!String(r.narration || "").includes(state.enemy.name)) {
      addGm(`${state.enemy.name}が姿を現した。${state.enemy.surface || state.enemy.trait}`);
    }
    addNote(`⚔ 戦闘開始:${state.enemy.name}(HP管理はシステム側)`);
    if (state.enemy.img) addPic(state.enemy.img); // imgを持つ敵のみ表示(番人は③層のため持たない)
  }
}

function maybeAmbushCheck(playerText) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const enemy = sc.enemy;
  if (!enemy || !enemy.ambush || state.enemy || state.defeated.includes(enemy.name)) return null;
  if ((state.ambushResolved || []).includes(enemy.name)) return null;
  const risky = /(奥|暗がり|穴|殻|近づ|進む|踏み込|入る|拾う|触る|取る)/.test(playerText);
  const cautious = /(慎重|気配|警戒|聞く|見る|観察|調べ|ランタン|照ら|確認)/.test(playerText);
  if (!risky || cautious) return null;
  return {
    reason: `${enemy.name}の気配に先に気づけるか`,
    difficulty: enemy.ambushDc || 12,
    enemy
  };
}

async function resolveAmbushIfNeeded(playerText) {
  const ambush = maybeAmbushCheck(playerText);
  if (!ambush) return false;
  const roll = rollD20();
  const crit = roll === 20, fumble = roll === 1;
  const ok = crit || (!fumble && roll >= ambush.difficulty);
  await addDice(roll, ambush.difficulty, ok, crit, fumble, ambush.reason);
  state.ambushResolved = state.ambushResolved || [];
  state.ambushResolved.push(ambush.enemy.name);

  if (ok) {
    addNote(`👁 奇襲察知:${ambush.enemy.name}の気配を先に捉えた`);
    return false;
  }

  state.enemy = { ...ambush.enemy };
  addGm(`${ambush.enemy.name}が暗がりから飛び出した。${ambush.enemy.surface || ambush.enemy.trait}`);
  addNote(`⚔ 奇襲:${ambush.enemy.name}に先手を取られた`);
  if (state.enemy.img) addPic(state.enemy.img);

  const attackRoll = rollD20();
  const hit = attackRoll >= 10;
  addNote(`⚔ ${state.enemy.name}の先制攻撃: d20=${attackRoll} → ${hit ? "命中" : "外れ/かすめる"}`);
  if (hit) {
    applyUpdatesLogged({ hp_delta: -1 });
    addGm(`${ambush.enemy.name}の牙が当たった。熱くて痛い。`);
  } else {
    addGm(`${ambush.enemy.name}の牙は外れた。岩の壁に、爪の音だけが響いた。`);
  }
  return true;
}

// 撃破・戦闘離脱の確定はシステム側。撃破は秘密開示のトリガーとしても扱う
// (どの経路で倒しても同じ扱いになるよう、開示はここで一元化する)
function checkEnemyDown() {
  if (state.enemy && state.enemy.hp <= 0) {
    addNote(`⚔ ${state.enemy.name}を倒した`);
    state.defeated.push(state.enemy.name);
    state.enemy = null;
    const secret = unlockNextSecret();
    if (secret) addReveal(secret.text, secret.img);
    return true;
  }
  return false;
}

// 判定成功時、現シーンの未開示秘密を1つ開放して返す(=このターンだけLLMに注入)
function unlockNextSecret() {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const next = sc.secrets.find(s => !revealed.has(s.id));
  if (!next) return null;
  revealed.add(next.id);
  return next; // {id, entity, surface, text, img?}
}

/* ---------------- Chronicle Lite(D-015/D-016): 構造化ログの.md書き出し。LLM不使用 ----------------
   【日記の原則】クロニクルは「プレイヤーが実際に体験・知り得たこと」だけを載せる。

/* ---------------- プロンプト構築 ---------------- */
function systemPrompt(extra) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const revealedTexts = SCENARIO.scenes.flatMap(s => s.secrets)
    .filter(s => revealed.has(s.id))
    .map(s => "・" + s.text);
  // エンティティ契約(D-021検証中): 未開示の秘密の「器」だけを列挙する。③層の本文は渡さない
  const depthTargets = sc.secrets.filter(s => !revealed.has(s.id) && s.entity)
    .map(s => "・" + s.entity + (s.surface ? `(表層: ${s.surface})` : ""));
  const depthBlock = depthTargets.length
    ? `\n# 深さのある対象(未開示の詳細がシステム側にある)\n以下の対象について語ってよいのは、括弧内の「表層」の範囲まで。対象を指す時は上記の名称を一字一句そのまま使え。\n${depthTargets.join("\n")}\n【厳守】\n・あなたは対象の正体・仕組み・来歴・目的を知らない。それを語るな。\n・表層で説明がつかない時、正体を推測・創作して埋めてはならない(例:「石になっていく」「呪いだ」等、独自の設定をでっち上げるのは禁止)。分からないものは、見えた所作・音・質感だけで描き、分からないまま残せ。\n・「最近」「誰かが」「今も」など、変化や活動の兆候を匂わせる描写も真相の一部である。表層に無ければ、たとえ一言でも判定なしに語ってはならない(例:「最近こすれた跡がある」「誰かが最近触れた形跡」は不可。「古い」「錆びている」等、静的な状態の描写に留めよ)。\n・真相は「判定成功時にシステムが渡した文」だけが根拠。渡されていない限り、対象が何であるか・なぜそうしているかを断定・示唆してはならない。\n・プレイヤーが対象を観察・質問・分析するなど深く知ろうとしたら、地の文で答えを出さず、必ず check を要求せよ(真相はその成功時にのみ解禁される)。\n・判定に失敗しても、対象を破壊・消失させてはならない。`
    : "";
  // 物語上意味のある入手品(正名)。ここに無い品はシステムが拒否する
  const lootBlock = (sc.loot && sc.loot.length)
    ? `\n# このシーンで入手しうる品(正名)\n${sc.loot.join("、")} — プレイヤーが物語上、自然に手に入れる流れになった時だけ、add_items にこの正名をそのまま入れて提案せよ。ここに無い品は入手させない。`
    : "";
  const direction = sc.report ? reportDirection() : sc.direction;
  const enemyBlock = state.enemy
    ? `\n# 戦闘中の敵(HP管理はシステム。あなたは変更できない)\n${JSON.stringify({ name: state.enemy.name, hp: state.enemy.hp, maxHp: state.enemy.maxHp })}\n特徴:${state.enemy.trait}`
    : (sc.enemy && !state.defeated.includes(sc.enemy.name)
        ? `\n# このシーンに潜む敵(まだ交戦していない)\n名前:${sc.enemy.name} / 特徴:${sc.enemy.trait}\nプレイヤーが刺激した場合や物語上自然な場合、まず姿・特徴・威嚇を地の文で描写してから engage_enemy を true にして戦闘を開始できる。\n奇襲はシステム専権。敵が潜んでいても、あなたは奇襲成功や先制ダメージを確定してはならない。${sc.enemy.ambush ? `\n奇襲条件:${sc.enemy.ambushTrigger}` : ""}`
        : "");
  const failedCheckBlock = state.pendingFailedCheck
    ? `\n# 直前に失敗した判定\n${state.pendingFailedCheck.reason} は失敗している。この対象について、真相・正体・仕組み・最近の痕跡・内側/外側の構造などの確定情報を語ってはならない。見えた表層、危険、分からなさだけを描写せよ。`
    : "";
  return `あなたはソロTRPGのゲームマスター。日本語の「である調」(だ・である。ですます調は禁止)で語る。地の文は3文以内、合計80字以内。1文は短く、主語と動詞だけのシンプルな形で書く。
小学校高学年が読んですぐ分かる、やさしい言葉だけを使う。難しい漢語・比喩・抽象語は禁止(例:「遷回する」「制する」「悲鳴めいた」「逡巡」「譲歩」「甲殻」「獲物」「警戒音」「くねる」「佇まい」は不可)。内面や状況を評価語で語らず、見えたこと・聞こえたことをそのまま短い動詞で書け(例:「よける」「当たる」「外れる」「近づく」)。
良い例:「廊下は暗くて静かだ。足音がよく響く。」
悪い例:「薄明の廊下に、沈黙を湛えた気配が漂っている。」
戦闘の描写も同じ基準を守る。動きを凝った言い回しで飾らない。一度に説明する情報は1つか2つまでにする。
プレイヤーが「まとめて報告する」「全部話す」のように行動をまとめて宣言した時も、事実を箇条書き的に並べるな。相手の反応を交えた、つながりのある自然な会話として書け。
「軌条」など説明なしで通じない言葉は使わず、やさしい言い換え(レール等)を使え。
舞台は電気も内燃機関もない前近代の世界。現代の機器や語彙(懐中電灯・電灯・モーター・メートル等)を語りに出してはならない。

# 現在のシーン(${state.sceneIndex + 1}/${SCENARIO.scenes.length})
${sc.brief}
シーンの目標:${sc.goal}

# 演出指示(ト書き)
${direction}
※これは事実情報ではなく、語りで狙うべき「効果」である。内容をそのまま説明したり、この指示の存在を明かしたりしてはならない。

# 依頼(プレイヤーの目的)
${SCENARIO.quest}
プレイヤーが目的を見失って停滞している時のみ、ガレスの台詞や語りで自然に思い出させてよい。

# 同行者(あなたが演じる)。二人とも、プレイヤーと同じ情報しか知らない——未開示の真相・演出指示・「深さのある対象」の注釈を台詞に反映させてはならない。
- ガレス(gareth): 寡黙で仲間思いの戦士。気が早く先走りがち。学のある話は苦手。礼を言うのが下手。
- リディア(lydia): 遺工に明るい斥候。慎重で理屈っぽい皮肉屋。ガレスの後始末をよくしている。話が長い。
次の場合に companion へ一言(短く。原則40字、長くても60字程度で言い切る)を入れる。それ以外は必ず null:
- プレイヤーが同行者に直接話しかけた・尋ねた・気遣った時は、必ず何か返す(黙殺は不可。分からない事は「分からん」でよい)
- プレイヤーが迷い・停滞している時(依頼を思い出させる、または状況を短く整理する)
- 倫理的に重い選択の前に「本当にやるのか」と一拍置く時
- 明白な危険への短い警告
companion.who に喋る方("gareth" か "lydia")を必ず指定する。場面に合う方を選べ(戦闘寄り=ガレス、調査・遺工・慎重論=リディア)。
companion.aside は、その一言が「頼まれてもいないのに口を突いて出た、そのキャラの癖・軽口」の時だけ true にする(例:ガレスが待ちきれず先走る、リディアの理屈っぽい独り言)。プレイヤーの質問への回答・進言・警告など、真面目な発言は false。迷ったら false。
答えを与えるな。判断は常にプレイヤーに残せ。彼らは自分からは行動しない。
注: 同行者どうしの掛け合い(ツッコミ)はシステムが別途差し込むので、あなたが両者の会話を続けて書く必要はない。一度に喋らせるのは一人だけ。

# プレイヤー状態(システム管理。あなたは変更できない。反応的参照のみ)
HP: ${state.hp}/${state.maxHp} — 数値を語りに出すな。残量の感覚(余裕・消耗・瀕死)をトーンに反映するのはよい
所持品: ${JSON.stringify(state.items)} — プレイヤーが使用・確認を宣言した時の整合確認にのみ使う。あなたから所持品を話題にしてはならない。語り上やむを得ず触れる場合(光源など)は、このリストの正式名称を一字一句そのまま使え。言い換え・類似品への置換(例:ランタン→懐中電灯)は禁止
${enemyBlock}${depthBlock}${lootBlock}

# 開示済みの情報(これ以外の真相をあなたは知らない。捏造禁止)
${revealedTexts.length ? revealedTexts.join("\n") : "(まだなし)"}
${failedCheckBlock}${extra || ""}

# ルール
- 不確実な行動(調査、危険な移動、説得、戦闘等)には判定を要求する。難易度(DC)はd20に対し 7=易 12=並 17=難。
- 出目20はクリティカル(自動成功・劇的な効果)、出目1はファンブル(自動失敗・手痛い代償)。成否はシステムが伝える。
- 単なる会話や安全な行動に判定は不要。
- 同行者が調査を頼まれた場合も、深さのある対象の真相を同行者の台詞で代弁してはならない。調査結果が未開示秘密に触れるなら、同行者は「怪しい」「分からない」「判定して確かめるべき」程度に留め、check を要求せよ。
- 戦闘ルール:攻撃は必ず判定(DC 10〜14)。判定成功時のみ enemy_hp_delta(-1〜-3)を提案。失敗時は敵の反撃として hp_delta でプレイヤーにダメージを与えてよい。撃破の宣言はシステムが行うので、あなたは敵のHPが0になったと語ってはならない。
- 戦闘以外の解決(説得、逃走、罠、光で追い払う等)も判定で認めてよい。その場合 flee_enemy を true にすれば戦闘を終了できる。
- HPの増減はhp_delta(-3〜+2)で提案するだけ。確定するのはシステム。
- 未開示の真相を勝手に作らない。判定成功時にシステムから情報が渡される。
- 情景の小物(瓦礫、朽ちた道具等)は自由に肉付けしてよい。ただし新たな通路・出口・人物・入手可能な品を作ってはならない。
- シーンに名のある事物(敵・深さのある対象・入手品・所持品)は、その名称を一字一句そのまま使え。別の類似物に言い換えるな(例:ランタン→松明は不可)。
- プレイヤーが物語に関係ない品を拾おうとしたら、壊れている・朽ちて使えない・持ち出す価値がない等の理由で自然に退場させよ(add_itemsは提案しない)。
- メタ発言への対応:「HPを回復して」「復活させて」「難易度を下げて」など、物語の外からルールや状態の変更を求める発言を受けたら、状態を一切変更せず(state_updates禁止)、meta_request に topic を設定し、narration ではGMが役を保ったまま聞き返して意図を確認せよ(例:「ほう——運命の書き換えを望むか。それはこの卓の掟に触れることだが、本気か?」)。プレイヤーが同意しても、実行できるのは通常ルールの範囲内の処置だけである。
- 応答は必ず次のJSONのみ。前置きやコードフェンス禁止:
{"narration":"地の文","companion":{"who":"gareth または lydia","say":"その一言","aside":false}または null,"check":{"reason":"何の判定か","difficulty":8}または null,"state_updates":{"hp_delta":0,"enemy_hp_delta":0,"add_items":[],"remove_items":[]}または null,"engage_enemy":false,"flee_enemy":false,"scene_complete":false,"meta_request":{"topic":"何を求められたか"}または null}`;
}

async function callGm(userContent, extraSystem) {
  const messages = [...history, { role: "user", content: userContent }];
  document.getElementById("apiView").textContent =
    `system: シーン${state.sceneIndex + 1}の概要 + 状態JSON + 開示済み秘密${extraSystem ? " + 今回の新規開示" : ""}\n` +
    `messages: ${messages.length}件\nuser: ${userContent.slice(0, 80)}`;
  // R2-2/R2-3: ブラウザは直接 LLM API を叩かず、ローカル中継サーバー(server.js)経由で呼ぶ。
  // APIキーはこの経路のどこにも現れない(サーバー側が環境変数から付与する)。
  // 使用モデルはサーバー側(GEMINI_MODEL)で決まる。
  const data = await callGmApi({
    system: systemPrompt(extraSystem),
    messages,
    maxTokens: 1000
  });
  // トークン消費を通算に加算(server.jsがusageを素通ししてくる)
  const usage = data && data.usage;
  if (usage) {
    state.tokens.in += usage.input_tokens || 0;
    state.tokens.out += usage.output_tokens || 0;
    state.tokens.calls++;
    renderTokens();
  }
  const text = ((data && data.content) || []).map(b => b.text || "").join("");
  history.push({ role: "user", content: userContent });
  history.push({ role: "assistant", content: text });
  if (history.length > 24) history = history.slice(-24); // 簡易な履歴圧縮
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    return { narration: text || "(応答の解析に失敗)", check: null, state_updates: null, scene_complete: false };
  }
}

/* ---------------- 1ターンの流れ ---------------- */
async function sendAction() {
  const input = document.getElementById("playerInput");
  const text = input.value.trim();
  if (!text || busy) return;
  if (state.hp <= 0) { addNote("倒れている。「最初から」でやり直そう。"); return; }
  busy = true;
  document.getElementById("sendBtn").disabled = true;
  input.value = "";
  state.turn++;
  addPlayer(text);

  // 空回り検知:前回と「宣言文」も「状況の指紋」も完全に同じなら、世界は何も変わっていない。
  // ただし前回が判定(check)を伴っていた場合は除外する——ダイスは振り直せば結果が変わりうるので、
  // 「もう一度試す」こと自体に意味がある(判定の余地を機械的に潰してはならない)。
  // 安全な場合のみ、LLMを呼ばずにシステムの注記で差し戻す(GMの語りを録画再生はしない=嘘にしない)。
  const normalizedText = text.trim();
  const fp = stateFingerprint();
  const prev = state.lastAction;
  const isRepeat = prev && prev.text === normalizedText && prev.fingerprint === fp && !prev.hadCheck;
  if (isRepeat) {
    addNote("🔁 同じ状況で同じ行動を繰り返した。判定の余地もなく、結論は変わらない(APIは呼んでいない) — 別の行動を試すか、先へ進もう");
    renderDebug();
    busy = false;
    document.getElementById("sendBtn").disabled = false;
    return;
  }

  // 前ターンに発行されたツッコミ権を、LLMへの掛け合い許可(②層)に変換して今回の手番に渡す。
  // 中身(台詞)はLLMが文脈に合わせて書く。システムは「いつ・誰が・何のボケに」までを決める。
  const banterCue = takeBanterCue();
  // プレイヤーが同行者の誰かに直接話しかけたか(呼びかけ→クールダウン無視で必ず応答)
  const addressed = Object.values(CAST).some(c => text.includes(c.name));
  // 前ターンまでの停滞度から、②層の誘導ヒントを組み立てる(今ターンで前進すれば
  // 次のターンからカウンタがリセットされる=蓄積は常に「これまで」の分だけ)
  const stagnationCue = takeStagnationCue();
  const nudgeActive = state.noProgressTurns >= STAGNATION_SOFT;
  // 直前ターンで負傷していれば、気遣いの機会を1回だけ渡す(呼びかけ応答と同じ優先度で扱う)
  const injuryCue = takeInjuryCue();
  const concernActive = injuryCue !== "";
  const itemsBefore = state.items.length;
  let progressed = false; // 秘密開示・判定成功・入手・戦闘・シーン進行のいずれかが起きたか

  try {
    const ambushed = await resolveAmbushIfNeeded(text);
    if (ambushed) {
      state.pendingFailedCheck = null;
      state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: true };
      state.noProgressTurns = 0;
      renderDebug();
      return;
    }

    // Phase A: 宣言の解釈と語り(必要なら判定要求)
    let r = await callGm(`プレイヤーの宣言: ${text}`, banterCue + stagnationCue + injuryCue);
    state.pendingFailedCheck = null;
    if (r.narration) addGm(trimNarration(r.narration));
    // 停滞中・負傷直後は、頻度制御より優先して声かけを通す(=呼びかけ応答と同じ扱い)
    maybeCompanion(r, addressed || nudgeActive || concernActive);
    // メタ発言検知: GMは役のまま聞き返し、エンジンは状態を変更していないことを明示する
    if (r.meta_request) {
      addNote(`⚖ メタ発言を検知(${r.meta_request.topic || "内容不明"}) — GMが確認中。状態は変更されていない`);
      r.state_updates = null; // ponytail: 検知時は提案ごと棄却。二重の保険
    }
    maybeEngage(r);
    applyUpdatesLogged(r.state_updates);
    if (r.flee_enemy && state.enemy) { addNote(`⚔ ${state.enemy.name}との戦闘を離脱`); state.enemy = null; }
    if (checkEnemyDown()) progressed = true;
    renderDebug();

    // Phase B: 判定要求があればシステムがダイスを振り、結果を渡して続きを語らせる
    if (r.check && r.check.difficulty) {
      const diff = Math.max(5, Math.min(18, r.check.difficulty)); // DCもクランプ
      const roll = rollD20();
      const crit = roll === 20, fumble = roll === 1;
      const ok = crit || (!fumble && roll >= diff);
      await addDice(roll, diff, ok, crit, fumble, r.check.reason || "判定"); // 出目確定の溜めを作ってからGMが結果を語る

      let extra = "";
      if (ok) progressed = true; // 判定成功はそれ自体が前進の合図(秘密が無くても)
      if (!ok) state.pendingFailedCheck = { reason: r.check.reason || "判定", sceneIndex: state.sceneIndex };
      if (ok && !state.enemy) {
        const secret = unlockNextSecret();
        if (secret) {
          addReveal(secret.text, secret.img);
          extra = `\n# 判定成功によりシステムが開示する新情報(これを語りに織り込め)\n・${secret.text}`;
        }
      }
      const outcome = crit ? "クリティカル(自動成功)" : fumble ? "ファンブル(自動失敗)" : ok ? "成功" : "失敗";
      const hint = crit ? "劇的な大成功として、効果を大きめに描写せよ。"
        : fumble ? "手痛い代償を必ず発生させよ(hp_delta可)。"
        : ok ? "" : "失敗ならリスクを発生させてよい(hp_delta可)。";
      // ターン経済: 戦闘中は敵も毎ターン行動する。命中判定の出目はシステムが振る(決定権はシステム側)
      let enemyDirective = "";
      if (state.enemy) {
        const eRoll = rollD20();
        const eHit = eRoll >= 10;
        addNote(`⚔ ${state.enemy.name}の行動: d20=${eRoll} → ${eHit ? "攻撃が届く" : "外れ/牽制"}`);
        enemyDirective = eHit
          ? `戦闘中:判定成功なら enemy_hp_delta を提案してよい。さらに${state.enemy.name}も行動し、攻撃が届いた——反撃の描写と hp_delta(-1〜-2)を必ず含めよ。`
          : `戦闘中:判定成功なら enemy_hp_delta を提案してよい。${state.enemy.name}も行動したが攻撃は届かない——牽制や威嚇として描写せよ(hp_delta不要)。`;
      }
      const r2 = await callGm(
        `【システム】判定結果: d20=${roll}(DC${diff})→${outcome}。結果を描写せよ。${hint}${enemyDirective}`,
        extra
      );
      if (r2.narration) addGm(trimNarration(r2.narration));
      maybeCompanion(r2, false);
      maybeEngage(r2);
      // 敵ダメージは「判定成功のこの局面」でのみ受理(プロンプト契約のシステム側担保)
      applyUpdatesLogged(r2.state_updates, { allowEnemyDamage: ok });
      if (r2.flee_enemy && state.enemy) { addNote(`⚔ ${state.enemy.name}との戦闘を離脱`); state.enemy = null; }
      if (checkEnemyDown()) progressed = true; // 撃破時の秘密開示は checkEnemyDown 内で一元処理
      r.scene_complete = r.scene_complete || r2.scene_complete;
    }

    // この手番の指紋を記録(次回、完全に同じ宣言・同じ状況なら空回りとして差し戻す判断材料)
    state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: !!(r.check && r.check.difficulty) };

    // 前進の判定:入手・戦闘継続中・シーン進行も前進として扱う。何もなければ停滞カウンタを進める。
    if (state.items.length > itemsBefore) progressed = true;
    if (state.enemy) progressed = true; // 戦闘中であること自体が「起きている」ことの証
    if (r.scene_complete) progressed = true;
    state.noProgressTurns = progressed ? 0 : state.noProgressTurns + 1;

    renderDebug();

    // シーン進行と終了判定(これもシステム側)
    if (state.hp <= 0) {
      addNote("HPが0になった。君は坑道の闇に倒れた——ゲームオーバー。");
    } else if (r.scene_complete) {
      if (state.sceneIndex < SCENARIO.scenes.length - 1) {
        state.sceneIndex++;
        state.enemy = null; // 戦闘はシーンをまたがない
        state.pendingFailedCheck = null;
        history = []; // シーン切替で履歴をリセット(状態はシステムが保持している証明)
        addNote(`—— シーン${state.sceneIndex + 1} ——`);
        if (SCENARIO.scenes[state.sceneIndex].img) addPic(SCENARIO.scenes[state.sceneIndex].img);
        const newBrief = SCENARIO.scenes[state.sceneIndex].brief;
        addGm(newBrief + "\n\nどうする?");
        // このbriefはLLMへの会話履歴に無い(addGmはchron/画面用)。空のまま次ターンを呼ぶと
        // LLMが「まだ語っていない」と誤認し、この場面をもう一度語り直してしまう。履歴に足しておく。
        history.push({ role: "user", content: "【システム】シーンが切り替わった。" });
        history.push({ role: "assistant", content: JSON.stringify({ narration: newBrief, companion: null, check: null, state_updates: null, engage_enemy: false, flee_enemy: false, scene_complete: false, meta_request: null }) });
      } else {
        addNote("—— 物語は決着した。おつかれさま。「最初から」で別の選択を試せる ——");
      }
      renderDebug();
    }
  } catch (e) {
    addNote("通信エラー: " + e.message);
  } finally {
    busy = false;
    document.getElementById("sendBtn").disabled = false;
  }
}

window.exportChronicle = exportChronicle;
window.resetGame = resetGame;
window.sendAction = sendAction;

boot();
