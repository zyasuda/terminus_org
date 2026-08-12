/* 画面の担当。ゲームの判定は一切しない。
   進行は gamebook.js、判定は progression.js / inventory.js が持つ。
   ここがやるのは「状態を読んで描く」「押されたら act へ渡す」だけ。 */
import { newGame, candidates, act } from "./gamebook.js";
import { approachLevel, APPROACH_MAX } from "./progression.js";
import { held } from "./inventory.js";

const $ = id => document.getElementById(id);
const log = $("logInner");

let chapter = null;
let state = null;
let usingDraft = false;

/* ── 描画 ───────────────────────────────────── */

function line(cls, text, extra) {
  if (!text) return;
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
}

function tick(cls, html) {
  const p = document.createElement("p");
  p.className = `in tick ${cls}`;
  p.innerHTML = html;
  log.appendChild(p);
}

function seam(label) {
  const d = document.createElement("div");
  d.className = "in seam";
  d.textContent = label || "";
  log.appendChild(d);
}

/* イベントの型ごとに描き分ける。知らない型が来ても黙って落とさず地の文で出す
   （エンジン側が型を足したときに、画面から消えるより見えている方がよい） */
function render(events) {
  for (const e of events || []) {
    switch (e.type) {
      case "reveal":
        line("prose reveal", e.text, e.entity); break;
      case "roll":
        tick(e.ok ? "ok" : "ng",
          `${esc(e.label || "判定")} — d20 <b>${e.roll}</b> / 難度 ${e.dc} · <b>${e.ok ? "成功" : "失敗"}</b>`);
        break;
      case "item":
        tick("gain", `<b>${esc(e.name || "")}</b>${e.count > 1 ? ` ×${e.count}` : ""} ${esc(stripName(e.text, e.name))}`);
        break;
      case "combat":
        line("prose combat", e.text); break;
      case "blocked":
        line("prose blocked", e.text); break;
      case "move":
        seam(placeName()); line("prose", e.text); break;
      case "end":
        // 区切り自体が「章の終わり」なので、同じ文言をもう一度本文に出さない
        seam("章の終わり");
        if (e.text && e.text !== "章の終わり") line("prose finish", e.text);
        break;
      case "unknown":
        line("prose blocked", e.text || "それはこの場では試せない。"); break;
      default:
        line("prose", e.text);
    }
  }
  requestAnimationFrame(() => $("log").scrollTo({ top: log.scrollHeight }));
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

function choose(c) {
  render(act(state, c.input));
  paintRail();
  paintLantern();
  paintChoices();
}

/* ── 起動 ───────────────────────────────────── */

function start() {
  state = newGame(chapter);
  log.innerHTML = "";
  seam(placeName());
  const n = node();
  if (n) {
    if (n.brief) line("prose", n.brief);
    if (n.greeting) line("prose", n.greeting);
  }
  paintRail();
  paintLantern();
  paintChoices();
}

$("restart").addEventListener("click", start);

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
