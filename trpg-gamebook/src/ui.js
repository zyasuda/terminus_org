/* 画面の担当。ゲームの判定は一切しない。
   進行は gamebook.js、判定は progression.js / inventory.js が持つ。
   ここがやるのは「状態を読んで描く」「押されたら act へ渡す」だけ。 */
import { newGame, candidates, act } from "./gamebook.js";
import { approachLevel, APPROACH_MAX } from "./progression.js";
import { held } from "./inventory.js";

const $ = id => document.getElementById(id);
const log = $("logInner");
// この章の開示本文は中央値42字・最長94字なので、中央値1.4秒・最長3.1秒に収まる。
const REVEAL_CHAR_DELAY_MS = 1000 / 30;
const PLAYLOG_KEY = "gamebook:playlog";
const PLAYLOG_LIMIT = 200 * 1024;

let chapter = null;
let state = null;
let usingDraft = false;
let finishReveal = null;
let choiceVersion = 0;
let playlogVersion = 0;

/* ── 描画 ───────────────────────────────────── */

function line(cls, text, extra) {
  if (!text && !extra) return null;
  const p = document.createElement("p");
  p.className = `in ${cls}`;
  if (extra) {
    const b = document.createElement("span");
    b.className = "what";
    b.textContent = extra;
    p.appendChild(b);
  }
  p.appendChild(document.createTextNode(text));
  log.appendChild(p);
  return p;
}

function tick(cls, html) {
  const p = document.createElement("p");
  p.className = `in tick ${cls}`;
  p.innerHTML = html;
  log.appendChild(p);
  return p;
}

function seam(label) {
  const d = document.createElement("div");
  d.className = "in seam";
  d.textContent = label || "";
  log.appendChild(d);
  return d;
}

function recordPlaylog(element) {
  const text = element?.textContent?.replace(/\s+/g, " ").trim();
  if (!text) return;
  const lines = (localStorage.getItem(PLAYLOG_KEY) || "").split("\n").filter(Boolean);
  lines.push(text);
  while (new Blob([lines.join("\n")]).size > PLAYLOG_LIMIT) lines.shift();
  localStorage.setItem(PLAYLOG_KEY, lines.join("\n"));
}

function clearPlaylog() {
  localStorage.removeItem(PLAYLOG_KEY);
}

/* イベントの型ごとに描き分ける。知らない型が来ても黙って落とさず地の文で出す
   （エンジン側が型を足したときに、画面から消えるより見えている方がよい） */
function followLog() {
  requestAnimationFrame(() => $("log").scrollTo({ top: log.scrollHeight }));
}

function reveal(e) {
  const p = line("prose reveal", "", e.entity);
  const body = document.createTextNode("");
  p.appendChild(body);
  const text = e.text || "";

  if (getComputedStyle(document.documentElement).getPropertyValue("--reveal-char-delay").trim() === "0ms") {
    body.data = text;
    followLog();
    return Promise.resolve(p);
  }

  return new Promise(resolve => {
    let index = 0;
    let timer = null;
    const finish = () => {
      clearTimeout(timer);
      body.data = text;
      $("log").removeEventListener("click", finish);
      if (finishReveal === finish) finishReveal = null;
      followLog();
      resolve(p);
    };
    const next = () => {
      body.data += text[index++] || "";
      followLog();
      if (index < text.length) timer = setTimeout(next, REVEAL_CHAR_DELAY_MS);
      else finish();
    };
    finishReveal = finish;
    $("log").addEventListener("click", finish);
    if (text) next(); else finish();
  });
}

async function render(events) {
  const version = playlogVersion;
  for (const e of events || []) {
    if (version !== playlogVersion) break;
    let rendered;
    switch (e.type) {
      case "reveal":
        rendered = await reveal(e); break;
      case "roll":
        rendered = tick(e.ok ? "ok" : "ng",
          `${esc(e.label || "判定")} — d20 <b>${e.roll}</b> / 難度 ${e.dc} · <b>${e.ok ? "成功" : "失敗"}</b>`);
        break;
      case "item":
        rendered = tick("gain", `<b>${esc(e.name || "")}</b>${e.count > 1 ? ` ×${e.count}` : ""} ${esc(stripName(e.text, e.name))}`);
        break;
      case "combat":
        rendered = line("prose combat", e.text); break;
      case "blocked":
        rendered = line("prose blocked", e.text); break;
      case "move":
        seam(placeName()); rendered = line("prose", e.text); break;
      case "end":
        // 区切り自体が「章の終わり」なので、同じ文言をもう一度本文に出さない
        rendered = seam("章の終わり");
        if (e.text && e.text !== "章の終わり") rendered = line("prose finish", e.text);
        break;
      case "unknown":
        rendered = line("prose blocked", e.text || "それはこの場では試せない。"); break;
      default:
        rendered = line("prose", e.text);
    }
    if (version === playlogVersion) recordPlaylog(rendered);
  }
  followLog();
}

const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
// item イベントの text に品名が含まれていれば重複させない
const stripName = (text, name) => (name && text ? String(text).replace(name, "").trim() : text || "");

/* ── 現在地 ─────────────────────────────────── */

/* 終了後(done)は、直前にいた場所を指し続ける。sceneIndexへ落とすと
   エンディングで終わったのに帯が一つ前の場面名に戻って見える */
let lastNode = null;
function node() {
  if (!state) return null;
  if (state.node === "intro") lastNode = chapter.intro;
  else if (state.node === "ending") lastNode = chapter.ending;
  else if (state.node === "scene") lastNode = chapter.scenes[state.sceneIndex];
  return lastNode;
}

function placeName() {
  const n = node();
  return (n && (n.name || n.title)) || "";
}

/* ── 上部の帯 ───────────────────────────────── */

function paintRail() {
  $("place").textContent = placeName();
  $("chapter").textContent = `${chapter.title || ""}${usingDraft ? "（下書き）" : ""}`;

  const max = state.maxHp || 10;
  $("hp").innerHTML = Array.from({ length: max },
    (_, i) => `<i class="${i < state.hp ? "" : "lost"}"></i>`).join("");

  const bag = held(state.inventory).filter(Boolean);
  $("bag").textContent = bag.length ? bag.join(" · ") : "手ぶら";
}

/* 接近度を光溜まりの狭まりに変える。数値は出さない（部屋が暗くなること自体が数値）*/
function paintLantern() {
  const lv = state.enemy ? APPROACH_MAX : approachLevel(state.turn, state.sceneEnteredTurn);
  document.documentElement.style.setProperty("--approach", lv);
  $("lantern").style.setProperty("--pool", `${lv * 9}%`);
}

/* ── 選択肢 ─────────────────────────────────── */

function paintChoices() {
  const box = $("choicesInner");
  box.innerHTML = "";
  box.className = "";

  if (state.node === "done") {
    const p = document.createElement("p");
    p.id = "stuck";
    p.textContent = "この章はここまで。";
    box.appendChild(p);
    return;
  }

  const n = node();
  const list = candidates(state) || [];
  const dec = n && n.decision && !state.flags?.[`decision:${n.decision.id}`] ? n.decision : null;

  if (dec) {
    box.className = "decision";
    const p = document.createElement("p");
    p.id = "prompt";
    p.textContent = dec.prompt;
    box.appendChild(p);
  }

  if (!list.length) {
    const p = document.createElement("p");
    p.id = "stuck";
    p.textContent = "ここで試せることが見つからない。シナリオ側の条件を確認する必要がある。";
    box.appendChild(p);
    return;
  }

  for (const c of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c.label;
    b.addEventListener("click", () => choose(c));
    box.appendChild(b);
  }
}

async function choose(c) {
  const version = ++choiceVersion;
  const box = $("choicesInner");
  box.innerHTML = "";
  box.className = "";
  await render(act(state, c.input));
  if (version !== choiceVersion) return;
  paintRail();
  paintLantern();
  paintChoices();
}

/* ── 起動 ───────────────────────────────────── */

function start(clearLog = false) {
  choiceVersion++;
  finishReveal?.();
  state = newGame(chapter);
  if (clearLog) { playlogVersion++; clearPlaylog(); }
  // 読み込み直しでも記録は消さない。ただし区切りを入れて、何回目の分か分かるようにする
  else if (localStorage.getItem(PLAYLOG_KEY)) recordPlaylog({ textContent:"── ここから遊び直し ──" });
  log.innerHTML = "";
  seam(placeName());
  const n = node();
  if (n) {
    if (n.brief) recordPlaylog(line("prose", n.brief));
    if (n.greeting) recordPlaylog(line("prose", n.greeting));
  }
  paintRail();
  paintLantern();
  paintChoices();
}

$("restart").addEventListener("click", () => start(true));
/* 記録を作者の手元へ渡すための書き出し。自動保存は別に効いているので、押し忘れても消えない。
   気づいたことをこのファイルへ直接書き込んでもらう前提なので、書き込む余白を空けておく */
$("playlog").addEventListener("click", () => {
  const body = localStorage.getItem(PLAYLOG_KEY) || "";
  if (!body) { alert("まだ記録がありません。少し遊んでから押してください。"); return; }
  const head = `# ${chapter?.title || "章"} のプレイ記録\n\n気づいたことは、その場所へそのまま書き込んでください。\n\n---\n\n`;
  // Safariはtext/markdownと、文書に載っていないaタグからの保存を無視することがある
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([head + body.split("\n").join("\n\n")], { type:"text/plain;charset=utf-8" }));
  link.download = "playlog.md";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
});

const draft = localStorage.getItem("gamebook:draft");
if (draft) {
  chapter = JSON.parse(draft);
  usingDraft = true;
  start();
} else {
  const res = await fetch("./data/chapter_01.json");
  if (!res.ok) {
    log.innerHTML = `<p class="prose blocked">章データを読み込めなかった（${res.status}）。` +
      `ローカルサーバー経由で開く必要がある。</p>`;
  } else {
    chapter = await res.json();
    start();
  }
}
