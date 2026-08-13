import { inspect } from "./validate.js";
import { decisionInputResolves } from "./progression.js";
import { getKey, setKey, getModel, setModel, hasKey, listModels, ask, backupModel, newId, proposalData, decisionProposalResolves, applyProposal } from "./ai.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
const categories = ["secrets", "exits", "decision", "encounters"];
const categoryLabels = { secrets:"調べられるもの", exits:"行き先", decision:"決断", encounters:"遭遇" };
const opening = {
  secrets:"この場面には、何がありますか。見えるもの、匂い、音、気配。思いつくまま書いてください。",
  exits:"この場面は、どこへ通じていますか。",
  encounters:"この場面に、危険はありますか。",
  decision:"この場面で、プレイヤーは何かを選ばなければなりませんか。"
};
let chapter, selected = { kind:"node", node:"intro", aiCategory:"secrets" }, timer, pendingProposal;
const talks = new Map();
const categoryFor = () => selected.aiCategory || "secrets";
const talkKey = category => `${selected.node}:${category}`;
const talkFor = (category = categoryFor()) => talks.get(talkKey(category)) || [{ role:"ai", text:category === "decision" && nodeFor()?.decision ? "この場面には既に決断があります。既存の決断を編集してください。" : opening[category], proposals:[] }];
const setTalk = (category, talk) => talks.set(talkKey(category), talk);
const nodes = () => [["intro", chapter.intro], ...chapter.scenes.map((scene, index) => [`scene:${index}`, scene]), ["ending", chapter.ending]];
const nodeFor = () => selected.node === "intro" ? chapter.intro : selected.node === "ending" ? chapter.ending : chapter.scenes[Number(selected.node.split(":")[1])];
const sceneNumber = () => selected.node.startsWith("scene:") ? chapter.scenes[Number(selected.node.slice(6))].id : selected.node;
const save = () => { localStorage.setItem("gamebook:draft", JSON.stringify(chapter)); $("draft").textContent = "下書きを編集中"; };
function later() { clearTimeout(timer); timer = setTimeout(paintInspection, 400); }
function touch() { save(); later(); }
const field = (label, key, value, type = "text") => `<label>${label}<input data-field="${key}" type="${type}" value="${esc(value)}"></label>`;
const text = (label, key, value) => `<label>${label}<textarea data-field="${key}">${esc(value)}</textarea></label>`;
function displayName(item, kind) {
  if (kind === "exit") {
    if (item.to === "ending") return chapter.ending?.name || "行き先が未設定";
    const id = String(item.to ?? "").replace(/^scene:/, "");
    return chapter.scenes.find(scene => String(scene.id) === id)?.name || "行き先が未設定";
  }
  if (kind === "encounter") return item.enemy?.name || "名前のない遭遇";
  return item.entity || "名称なし";
}
const list = (items, kind, key) => `<div>${items.map((item, index) => `<div class="row"><span>${esc(displayName(item, kind))}</span><button type="button" data-select="${kind}:${index}">編集</button><button type="button" class="remove" data-remove="${key}:${index}">削除</button></div>`).join("")}</div>`;
const kindFor = category => category === "secrets" ? "secret" : category === "decision" ? "decision" : category.slice(0, -1);
const pendingFor = category => pendingProposal?.category === category ? pendingProposal.data : null;
const join = value => Array.isArray(value) ? value.join("、") : "";

function suggestionGroups(node) {
  return [["調べる", (node.secrets || []).map(s => `${s.entity}を調べる`)], ["遭遇", (node.encounters || []).flatMap(e => e.triggerTerms || [])], ["行き先", (node.exits || []).flatMap(e => e.match || [])]]
    // エンジン自身に「その言葉で本当に何か起きるか」を聞く。呼び名の無い秘密は
    // 調べても開かないので、候補に出すと押しても赤いままになる
    .map(([label, values]) => [label, [...new Set(values)].filter(Boolean).filter(value => decisionInputResolves(node, value)).slice(0, 6)]);
}
function contextFor(category, node = nodeFor()) {
  return {
    destinations:nodes().filter(([id]) => id !== selected.node && id !== "intro").map(([id, item]) => ({ label:item.name, id:id === "ending" ? "ending" : item.id })),
    secrets:(node.secrets || []).map(secret => ({ id:secret.id, entity:secret.entity })),
    suggestionGroups:suggestionGroups(node)
  };
}

function renderToc() {
  $("toc").innerHTML = nodes().map(([id, node]) => {
    const label = id === "intro" ? "イントロ" : id === "ending" ? "エンディング" : `シーン${Number(id.slice(6)) + 1}　${node.name ? esc(node.name) : "名前のない場面"}`;
    return `<button type="button" data-node="${id}" aria-current="${selected.node === id}">${label}</button>`;
  }).join("") + `<button type="button" data-add="scene">＋ 場面を追加</button>`;
}
function proposalCanAdopt(category, proposal, node) {
  return category !== "decision" ? true : !node.decision && decisionProposalResolves(node, proposal);
}
function proposalFields(category, proposal) {
  if (category === "secrets") return `<b>${esc(proposal.entity)}</b><span>呼び名: ${esc(join(proposal.aliases))}</span><span>調べると: ${esc(proposal.text)}</span>${proposal.surface ? `<span>見た目: ${esc(proposal.surface)}</span>` : ""}`;
  if (category === "exits") return `<b>行き先: ${esc(proposal.toLabel || "未設定")}</b><span>きっかけ: ${esc(join(proposal.match))}</span><span>到着時: ${esc(proposal.text)}</span><span>進めないとき: ${esc(proposal.blockedText)}</span>`;
  if (category === "encounters") return `<b>${esc(proposal.enemyName || "名前なし")}</b><span>きっかけ: ${esc(join(proposal.triggerTerms))}</span><span>必要な発見: ${esc(join(proposal.requiredElements) || "なし")}</span><span>撃破後: ${esc(proposal.revealOnDefeatLabel || "なし")}</span>`;
  return `<b>${esc(proposal.prompt)}</b>${(Array.isArray(proposal.choices) ? proposal.choices : []).map(choice => `<span>${esc(choice.label)}（${esc(choice.input)}）</span>`).join("")}`;
}
function cards(category, proposal) {
  return (proposal.proposals || []).map((p, index) => {
    const invalid = !proposalCanAdopt(category, p, nodeFor());
    const invalidMessage = category === "decision" && invalid ? `<p class="hint error">解決できない選択肢があります。既存の決断編集画面で直してください。</p>` : "";
    return `<div class="proposal">${proposalFields(category, p)}${invalidMessage}${p.adopted ? `<p class="hint ${p.inspection?.error ? "error" : "ok"}">${esc(p.inspection?.text || "採用しました")}</p><button data-ai-undo="${index}" type="button">採用を取り消す</button>` : `<div><button data-ai-adopt="${index}" type="button" ${invalid ? "disabled" : ""}>採用</button><button data-ai-edit="${index}" type="button">直す</button><button data-ai-drop="${index}" type="button">捨てる</button></div>`}</div>`;
  }).join("");
}
function aiPanel(node) {
  const category = categoryFor(), talk = talkFor(category), hasDecision = category === "decision" && node.decision;
  // ここは状態を伝えるだけ。操作は持たせない(設定はAI設定パネルの担当)
  const message = `<p class="hint">${!hasKey() || !getModel() ? "まずAI設定を行ってください" : "シーンに必要な要素について質問します"}</p>`;
  const tabs = categories.map(item => `<button type="button" role="tab" aria-selected="${category === item}" data-ai-category="${item}">${categoryLabels[item]}</button>`).join("");
  const existing = hasDecision ? `<p class="hint">この場面には既に決断があります。既存の決断を確認してください。</p><button type="button" data-select="decision">決断を編集</button>` : `<form data-ai-form><textarea name="message" aria-label="シナリオ補完への入力" placeholder="ここに書く"></textarea><button ${hasKey() ? "" : "disabled"}>送る</button></form>`;
  return `<section class="ai-panel"><h2>シナリオ補完</h2><div class="ai-tabs" role="tablist">${tabs}</div>${message}<div class="conversation">${talk.map((item, talkIndex) => `<div class="talk ${item.role}" data-talk="${talkIndex}"><b>${item.role === "user" ? "作者" : "AI"}</b>${item.status ? `<p class="hint">${esc(item.status)}</p>` : ""}${item.thinking ? `<p class="hint">考えています</p>` : ""}<p>${esc(item.text)}</p>${item.role === "ai" ? cards(category, item) : ""}</div>`).join("")}</div>${existing}</section>`;
}
function nodeEditor(node) {
  // 作ったものは畳まない。折りたたむと、作者は自分の成果が消えたと感じる
  return `${aiPanel(node)}<section id="author-form"><h2>${esc(node.name || "場面")}</h2>${field("場面名", "name", node.name)}${text("導入文", "brief", node.brief)}${text("進めないときの文", "blockedText", node.blockedText)}
  <h3>調べられるもの</h3>${list(node.secrets || [], "secret", "secret")}<button class="add" data-add="secret" type="button">＋ 追加</button>
  <h3>行き先</h3>${list(node.exits || [], "exit", "exit")}<button class="add" data-add="exit" type="button">＋ 追加</button>
  <h3>重要な決断</h3>${node.decision ? `<button data-select="decision" type="button">決断を編集</button>` : `<button class="add" data-add="decision" type="button">＋ 決断を追加</button>`}
  <h3>遭遇</h3>${list(node.encounters || [], "encounter", "encounter")}<button class="add" data-add="encounter" type="button">＋ 追加</button>${selected.node.startsWith("scene:") ? `<div class="actions"><button class="danger" data-remove="scene" type="button">この場面を削除</button></div>` : ""}</section>`;
}
function secretEditor(node, index) {
  const secret = pendingFor("secrets") || node.secrets[index];
  // 呼び名も trigger も無い秘密は pickExamineSecret が拾わない。作者に黙って作らせない
  const unreachable = !secret.trigger && !(secret.aliases || []).length;
  return `<h2>調べられるもの</h2>${field("要素名", "entity", secret.entity)}${field("呼び名（読点区切り）", "aliases", (secret.aliases || []).join("、"))}${unreachable ? `<p class="hint error">呼び名が空のあいだ、これは調べられません。</p>` : ""}${text("調べたときに分かること", "text", secret.text)}${text("見た目の説明", "surface", secret.surface)}${field("調べにくさ", "dc", secret.dc ?? 8, "number")}<p class="hint">${pendingFor("secrets") ? "採用するまで章データには書き込みません。" : "IDと既存の trigger は保持します。"}</p><div class="actions">${pendingFor("secrets") ? `<button data-ai-adopt-pending type="button">採用</button>` : ""}<button data-back type="button">場面へ戻る</button></div>`;
}
function exitEditor(node, index) {
  const exit = pendingFor("exits") || node.exits[index], options = nodes().filter(([id]) => id !== selected.node && id !== "intro").map(([id, n]) => `<option value="${id === "ending" ? "ending" : n.id}" ${String(exit.to).replace("scene:", "") === String(n.id) || exit.to === "ending" && id === "ending" ? "selected" : ""}>${esc(n.name)}</option>`).join("");
  const secretOptions = (node.secrets || []).map(secret => `<option value="${esc(secret.id)}" ${(exit.requires?.secretsAll || []).includes(secret.id) ? "selected" : ""}>${esc(secret.entity)}</option>`).join("");
  return `<h2>行き先</h2><label>どこへ<select data-field="to"><option value="" ${exit.to ? "" : "selected"}>未選択</option>${options}</select></label>${field("進むときの言葉（読点区切り）", "match", (exit.match || []).join("、"))}<label>必要な発見<select multiple data-field="secretsAll">${secretOptions}</select></label>${text("進めないときの文", "blockedText", exit.blockedText)}${text("到着時の文", "text", exit.text)}<div class="actions"><button data-back type="button">場面へ戻る</button></div>`;
}
function decisionEditor(node) {
  const decision = pendingFor("decision") || node.decision, groups = suggestionGroups(node), invalid = (decision.choices || []).some(choice => !decisionInputResolves(node, choice.input || ""));
  return `<h2>重要な決断</h2>${text("問いかけ", "prompt", decision.prompt)}${(decision.choices || []).map((choice, index) => { const resolves = decisionInputResolves(node, choice.input || ""), suggestions = groups.map(([label, values]) => values.length ? `<div><p class="hint">${label}</p>${values.map(value => `<button type="button" data-suggest="${index}" data-value="${esc(value)}">${esc(value)}</button>`).join("")}</div>` : "").join(""); return `<h3>選択肢 ${index + 1}</h3>${field("選択肢の見出し", `choice-label-${index}`, choice.label)}${field("選ぶと起きること", `choice-input-${index}`, choice.input)}<p data-decision-status="${index}" class="hint ${resolves ? "ok" : "error"}">${resolves ? "解決できます" : "解決できません"}</p><div data-decision-hints="${index}" class="choice-hints" ${resolves ? "hidden" : ""}>${suggestions}</div>`; }).join("")}<div class="actions">${pendingFor("decision") ? `<button data-ai-adopt-pending type="button" ${invalid || decision.choices.length !== 2 ? "disabled" : ""}>採用</button>` : `<button data-add="choice" type="button">選択肢を追加</button><button class="danger" data-remove="decision" type="button">決断を削除</button>`}<button data-back type="button">場面へ戻る</button></div>${pendingFor("decision") && invalid ? `<p class="hint error">解決できない選択肢があります。</p>` : ""}`;
}
function encounterEditor(node, index) {
  const enc = pendingFor("encounters") || node.encounters[index], labels = [...new Set((node.secrets || []).flatMap(s => [s.entity, ...(s.aliases || [])]))];
  const choice = (key, selectedValue) => `<label>${key === "requiredElements" ? "必要な発見" : "倒すと分かること"}<select ${key === "requiredElements" ? "multiple" : ""} data-field="${key}">${key === "revealOnDefeat" ? "<option value=\"\">なし</option>" : ""}${(key === "requiredElements" ? labels : node.secrets || []).map(value => { const id = value.id || value, label = value.entity || value; return `<option value="${esc(id)}" ${(Array.isArray(selectedValue) ? selectedValue : [selectedValue]).includes(id) ? "selected" : ""}>${esc(label)}</option>`; }).join("")}</select></label>`;
  return `<h2>遭遇</h2>${field("起きるきっかけの言葉（読点区切り）", "triggerTerms", (enc.triggerTerms || []).join("、"))}${choice("requiredElements", enc.requiredElements || [])}${text("始まりの文", "onsetText", enc.onsetText)}${field("相手", "enemy.name", enc.enemy?.name)}${field("相手のHP", "enemy.hp", enc.enemy?.hp ?? 6, "number")}${choice("revealOnDefeat", enc.enemy?.revealOnDefeat)}<div class="actions"><button data-back type="button">場面へ戻る</button></div>`;
}
function renderEditor() { const node = nodeFor(); let html = nodeEditor(node); if (selected.kind === "secret") html = secretEditor(node, selected.index); if (selected.kind === "exit") html = exitEditor(node, selected.index); if (selected.kind === "decision") html = decisionEditor(node); if (selected.kind === "encounter") html = encounterEditor(node, selected.index); $("editor").innerHTML = html; }
function paintInspection() { const result = inspect(chapter), errors = result.structure.filter(x => x.level === "error").length, branches = result.play.outcomes.length ? `<h3>分岐</h3>${result.play.outcomes.map(item => `<div class="metric"><span>${esc(item.label)}</span><b>${item.count}</b></div>`).join("")}` : ""; $("result").innerHTML = `<h2>検査</h2><div id="summary" class="${errors ? "error" : "ok"}">${errors ? `不整合 ${errors}件` : "問題なし"}</div><h3>自動プレイ</h3><div class="metric"><span>完走</span><b>${result.play.cleared} / ${result.play.runs}</b></div><div class="metric"><span>死亡</span><b>${result.play.died}</b></div><div class="metric ${result.play.stuck > 0 ? "error" : ""}"><span>手詰まり</span><b>${result.play.stuck}</b></div><div class="metric"><span>上限到達</span><b>${result.play.ranOut}</b></div>${result.play.cleared === 0 && result.play.stuckAt[0] ? `<p class="error">最も多く止まった場所: ${esc(result.play.stuckAt[0].place)}</p>` : ""}${branches}<h3>構造</h3>${result.structure.length ? result.structure.map(x => `<div class="issue ${x.level}">${esc(x.message)}<small>${esc(x.where)}</small></div>`).join("") : "<p class=\"ok\">エラー・警告はありません。</p>"}`; }
function secretId(node) { const prefix = selected.node.startsWith("scene:") ? `sc${sceneNumber()}_` : `${selected.node}_`; return newId(prefix, node.secrets || []); }
function inspectProposal(proposal) { const result = inspect(chapter), errors = result.structure.filter(x => x.level === "error").length; proposal.inspection = { error:errors > 0 || result.play.stuck > 0, text:errors ? `不整合 ${errors}件。採用を取り消せます。` : result.play.stuck ? `手詰まり ${result.play.stuck}件。採用を取り消せます。` : `検査済み: 完走 ${result.play.cleared}/${result.play.runs}` }; paintInspection(); }
function adoptProposal(category, proposal, data = proposalData(category, proposal, contextFor(category))) {
  const node = nodeFor();
  if (category === "secrets") { const secret = { ...data, id:secretId(node), trigger:"" }; (node.secrets ||= []).push(secret); proposal.recordId = secret.id; proposal.adopted = true; save(); inspectProposal(proposal); return true; }
  const record = applyProposal(category, proposal, node, { ...contextFor(category), decisions:nodes().map(([, item]) => item.decision).filter(Boolean) }, data);
  if (!record) return false;
  proposal.recordId = record.id; proposal.adopted = true; save(); inspectProposal(proposal);
  if (category === "exits" && !record.to) { selected = { ...selected, kind:"exit", index:node.exits.length - 1 }; }
  return true;
}
function editProposal(category, proposal) { pendingProposal = { category, proposal, data:proposalData(category, proposal, contextFor(category)) }; selected = { ...selected, kind:kindFor(category) }; renderEditor(); }
function add(kind) { if (kind === "scene") { const scenes = chapter.scenes || (chapter.scenes = []), id = Math.max(0, ...scenes.map(scene => Number(scene.id)).filter(Number.isFinite)) + 1; scenes.push({ id, name:"", brief:"", blockedText:"", secrets:[], exits:[], encounters:[] }); selected = { ...selected, kind:"node", node:`scene:${scenes.length - 1}` }; touch(); renderToc(); renderEditor(); return; } const node = nodeFor(); if (kind === "secret") { (node.secrets ||= []).push({ id:secretId(node), entity:"新しい要素", aliases:[], text:"", surface:"", dc:8, trigger:"" }); selected = { ...selected, kind:"secret", index:node.secrets.length - 1 }; } if (kind === "exit") { (node.exits ||= []).push({ id:newId("exit_", node.exits || []), to:"ending", match:[], requires:{ secretsAll:[] }, blockedText:"", text:"" }); selected = { ...selected, kind:"exit", index:node.exits.length - 1 }; } if (kind === "decision") { node.decision = { id:newId("decision_", nodes().map(([, n]) => n.decision).filter(Boolean)), prompt:"", choices:[{ id:"choice_1", label:"", input:"" }] }; selected = { ...selected, kind:"decision" }; } if (kind === "encounter") { (node.encounters ||= []).push({ id:newId("encounter_", node.encounters || []), triggerTerms:[], requiredElements:[], onsetText:"", enemy:{ name:"", hp:6, revealOnDefeat:"" } }); selected = { ...selected, kind:"encounter", index:node.encounters.length - 1 }; } if (kind === "choice") node.decision.choices.push({ id:newId("choice_", node.decision.choices), label:"", input:"" }); touch(); renderEditor(); }
function remove(value) { const node = nodeFor(), [kind, raw] = value.split(":"); if (kind === "scene") { if (!confirm("この場面を削除しますか？")) return; chapter.scenes.splice(Number(selected.node.slice(6)), 1); pendingProposal = null; selected = { ...selected, kind:"node", node:"intro" }; touch(); renderToc(); renderEditor(); return; } if (pendingProposal) { pendingProposal = null; selected = { ...selected, kind:"node" }; renderEditor(); return; } if (kind === "decision") node.decision = null; else node[`${kind}s`].splice(Number(raw), 1); selected = { ...selected, kind:"node" }; touch(); renderEditor(); }
function update(fieldName, value, element) { const node = nodeFor(), item = pendingProposal?.data || (selected.kind === "node" ? node : selected.kind === "decision" ? node.decision : node[`${selected.kind}s`][selected.index]); if (fieldName.startsWith("choice-")) { const [, key, index] = fieldName.split("-"); item.choices[Number(index)][key] = value; if (key === "input") { const resolves = decisionInputResolves(node, value), status = document.querySelector(`[data-decision-status="${index}"]`), hints = document.querySelector(`[data-decision-hints="${index}"]`); status.className = `hint ${resolves ? "ok" : "error"}`; status.textContent = resolves ? "解決できます" : "解決できません"; hints.hidden = resolves; } } else if (fieldName === "aliases" || fieldName === "match" || fieldName === "triggerTerms") item[fieldName] = value.split(/[、,]/).map(x => x.trim()).filter(Boolean); else if (fieldName === "secretsAll") { item.requires ||= {}; item.requires.secretsAll = [...element.selectedOptions].map(o => o.value); } else if (fieldName === "requiredElements") item.requiredElements = [...element.selectedOptions].map(o => o.value); else if (fieldName === "revealOnDefeat") { item.enemy ||= {}; item.enemy.revealOnDefeat = value; } else if (fieldName.startsWith("enemy.")) { item.enemy ||= {}; item.enemy[fieldName.slice(6)] = element.type === "number" ? Number(value) : value; } else item[fieldName] = element.type === "number" ? Number(value) : value; if (!pendingProposal) touch(); if (fieldName === "name" && selected.kind === "node" && !pendingProposal) renderToc(); }

async function loadModels(unavailable) { const status = $("gemini-status"), select = $("gemini-model"); if (!hasKey()) { status.textContent = "キーを入れるとモデルを取得します"; return; } status.textContent = "モデルを取得しています"; try { const models = await listModels(), current = models.some(model => model.id === getModel() && model.id !== unavailable) ? getModel() : models.find(model => model.id !== unavailable)?.id || models[0]?.id; if (current) setModel(current); select.innerHTML = `<option value="">モデルを選んでください</option>${models.map(model => `<option value="${esc(model.id)}" ${model.id === current ? "selected" : ""}>${esc(model.label)}${model.id === backupModel ? " (バックアップ)" : ""}</option>`).join("")}`; status.textContent = models.length ? "モデルは必要なときだけ変更できます" : "利用できるモデルがありません。入力欄で直接書けます"; } catch { status.textContent = "モデル一覧を取得できませんでした。入力欄で直接書けます"; } }
$("toc").addEventListener("click", event => { const button = event.target.closest("button"); if (!button) return; if (button.dataset.add) { add(button.dataset.add); return; } if (!button.dataset.node) return; pendingProposal = null; selected = { ...selected, kind:"node", node:button.dataset.node }; renderToc(); renderEditor(); });
$("editor").addEventListener("click", event => { const target = event.target.closest("button"); if (!target) return; if (target.dataset.aiCategory) { selected = { ...selected, kind:"node", aiCategory:target.dataset.aiCategory }; renderEditor(); return; } const category = categoryFor(), talkIndex = Number(target.closest("[data-talk]")?.dataset.talk), proposal = talkFor(category)[talkIndex]?.proposals?.[Number(target.dataset.aiAdopt ?? target.dataset.aiEdit ?? target.dataset.aiDrop ?? target.dataset.aiUndo)]; if (target.dataset.aiAdopt !== undefined) { if (adoptProposal(category, proposal)) renderEditor(); } else if (target.dataset.aiEdit !== undefined) editProposal(category, proposal); else if (target.dataset.aiDrop !== undefined) { talkFor(category)[talkIndex].proposals.splice(Number(target.dataset.aiDrop), 1); renderEditor(); } else if (target.dataset.aiUndo !== undefined) { const node = nodeFor(); if (category === "decision") node.decision = null; else node[category] = (node[category] || []).filter(item => item.id !== proposal.recordId); proposal.adopted = false; delete proposal.recordId; save(); paintInspection(); renderEditor(); } else if (target.hasAttribute("data-ai-adopt-pending")) { if (adoptProposal(pendingProposal.category, pendingProposal.proposal, pendingProposal.data)) { pendingProposal = null; selected.kind = "node"; renderEditor(); } } else if (target.dataset.select) { const [kind, index] = target.dataset.select.split(":"); selected = { ...selected, kind, ...(index !== undefined ? { index:Number(index) } : {}) }; renderEditor(); } else if (target.dataset.add) add(target.dataset.add); else if (target.dataset.remove) remove(target.dataset.remove); else if (target.hasAttribute("data-back")) { pendingProposal = null; selected.kind = "node"; renderEditor(); } else if (target.dataset.suggest !== undefined) { const item = pendingProposal?.data || nodeFor().decision; item.choices[Number(target.dataset.suggest)].input = target.dataset.value; if (!pendingProposal) touch(); renderEditor(); } });
$("editor").addEventListener("submit", async event => { if (!event.target.matches("[data-ai-form]")) return; event.preventDefault(); const userText = new FormData(event.target).get("message")?.trim(); if (!userText) return; const category = categoryFor(), node = nodeFor(), talk = talkFor(category), reply = { role:"ai", text:"", proposals:[] }, model = getModel(); setTalk(category, [...talk, { role:"user", text:userText }, reply]); renderEditor(); try { const result = await ask({ chapter, scene:node, category, context:contextFor(category, node), history:talk, userText, onStatus:status => { reply.status = status; renderEditor(); }, onThought:() => { reply.thinking = true; renderEditor(); }, onChunk:chunk => { reply.thinking = false; reply.text += chunk; renderEditor(); } }); reply.thinking = false; reply.text = result.reply; reply.proposals = result.proposals; renderEditor(); } catch (error) { reply.thinking = false; reply.text = error.status === 404 ? "このモデルは今使えません。別のモデルを選んでください" : "つながりませんでした。もう一度試すか、下の入力欄で直接書けます"; if (error.status === 404) { openSettings(); loadModels(model); } renderEditor(); } });
$("editor").addEventListener("input", event => { if (event.target.dataset.field) update(event.target.dataset.field, event.target.value, event.target); });
$("editor").addEventListener("change", event => { if (event.target.dataset.field) update(event.target.dataset.field, event.target.value, event.target); });
// AI設定の入口はここ1つだけにする。シナリオ補完のパネルは状態を伝えるだけで操作を持たない
function openSettings() { if (!$("ai-settings").open) $("ai-settings").showModal(); }
$("gemini-key").value = getKey();
// 保存ボタンを置かない。欄を離れた時点で保存する(押し忘れで空のまま詰まるため)
$("gemini-key").addEventListener("change", event => { setKey(event.target.value.trim()); renderEditor(); loadModels(); });
$("gemini-model").addEventListener("change", event => { setModel(event.target.value); renderEditor(); });
$("ai-open").addEventListener("click", openSettings);
$("gemini-close").addEventListener("click", () => $("ai-settings").close());
$("export").addEventListener("click", () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(chapter, null, 2)], { type:"application/json" })); link.download = "chapter_01.json"; link.click(); URL.revokeObjectURL(link.href); });
$("discard").addEventListener("click", async () => { if (!confirm("下書きを捨てて、元の章データへ戻しますか？")) return; localStorage.removeItem("gamebook:draft"); const response = await fetch("./data/chapter_01.json"); chapter = await response.json(); pendingProposal = null; selected = { ...selected, kind:"node", node:"intro" }; $("draft").textContent = ""; renderToc(); renderEditor(); paintInspection(); });

const draft = localStorage.getItem("gamebook:draft");
if (draft) { chapter = JSON.parse(draft); $("draft").textContent = "下書きを編集中"; } else { const response = await fetch("./data/chapter_01.json"); if (!response.ok) throw new Error(`章データを読み込めなかった (${response.status})`); chapter = await response.json(); }
renderToc(); renderEditor(); paintInspection();
loadModels();
if (!hasKey()) openSettings();
