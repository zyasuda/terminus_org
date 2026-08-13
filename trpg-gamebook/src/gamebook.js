import * as inv from "./inventory.js";
import {
  actionCandidates,
  approachLevel,
  availableEncounters,
  examineDifficulty,
  exitTargetIndexIn,
  pickExamineSecret,
  requiresMet,
  resolveExit
} from "./progression.js";

const defaultRng = globalThis.Math.random.bind(globalThis.Math);

function currentNode(state) {
  if (state.node === "intro") return state.chapter.intro;
  if (state.node === "ending") return state.chapter.ending;
  return state.chapter.scenes[state.sceneIndex];
}

function die(state, sides) {
  return Math.floor(Math.min(0.9999999999999999, Math.max(0, state.rng())) * sides) + 1;
}

function weaknessFor(state) {
  const sceneFoe = currentNode(state)?.enemy;
  return state.enemy?.weakness || (sceneFoe && sceneFoe.name === state.enemy?.name ? sceneFoe.weakness : undefined);
}

function item(events, state, name, count, add) {
  let changed = 0;
  for (let index = 0; index < count; index += 1) {
    if ((add ? inv.give : inv.take)(state.inventory, name)) changed += 1;
  }
  if (changed) events.push({ type: "item", text: `${name}${add ? "を入手した" : "を消費した"}`, name, count: changed });
  else if (add) events.push({ type: "narrate", text: `${name}は、もう持っている` });
}

function finishCombat(events, state, outcome) {
  const foe = state.enemy;
  // 戦いが終わったことを言わずに次の描写へ移ると、倒せたのか逃げられたのか分からない
  if (outcome === "defeated") events.push({ type: "combat", text: foe.defeatText || `${foe.name}は動かなくなった` });
  if (foe.revealOnDefeat) {
    const secret = currentNode(state).secrets?.find(({ id }) => id === foe.revealOnDefeat);
    state.revealed.add(foe.revealOnDefeat);
    events.push({ type: "reveal", text: secret?.text || foe.revealOnDefeat, entity: secret?.entity || foe.revealOnDefeat });
  }
  if (foe.itemOnDefeat) item(events, state, foe.itemOnDefeat, foe.itemOnDefeatCount || 1, true);
  state[outcome].push(foe.name);
  state.enemy = null;
}

function counterattack(events, state) {
  const foe = state.enemy;
  let damage = (foe.atk || 1) + (foe.openingDanger || 0);
  if (state.guard) damage = Math.max(0, damage - 1);
  state.guard = false;
  foe.openingDanger = 0;
  state.hp -= damage;
  // 0ダメージを「反撃。0ダメージ」と出すと、何も起きていないのに1行増える
  events.push({ type: "combat", text: damage > 0 ? `${foe.name}の反撃。${damage}ダメージ` : `${foe.name}の一撃を受け止めた` });
  if (state.hp <= 0) {
    state.node = "done";
    events.push({ type: "end", text: "力尽きた" });
  }
}

function transition(events, state, exit) {
  if (exit.npcSay) events.push({ type: "say", text: exit.npcSay, who: currentNode(state).npc?.name });
  for (const name of exit.addItems || []) item(events, state, name, 1, true);
  for (const name of exit.removeItems || []) item(events, state, name, 1, false);
  const to = exit.to;
  if (to === "end") {
    state.node = "done";
    events.push({ type: "end", text: exit.arrivalText || exit.text || "章の終わり" });
    return true;
  }
  if (to === "ending") state.node = "ending";
  else {
    const sceneIndex = exitTargetIndexIn(state.chapter.scenes, to);
    if (sceneIndex < 0) {
      events.push({ type: "blocked", text: exit.blockedText || "移動先を解決できない" });
      return false;
    }
    state.node = "scene";
    state.sceneIndex = sceneIndex;
  }
  state.sceneEnteredTurn = state.turn;
  events.push({ type: "move", text: exit.arrivalText || exit.text, to });
  events.push({ type: "narrate", text: currentNode(state).brief });
  return true;
}

export function newGame(chapter, opts = {}) {
  return {
    chapter,
    node: "intro",
    sceneIndex: 0,
    turn: 0,
    sceneEnteredTurn: 0,
    revealed: new Set(),
    inventory: inv.startingInventory({ chapterStarting: chapter.startingInventory?.player ? { player: chapter.startingInventory.player } : chapter.startingInventory, fallback: ["ランタン", "ナイフ"] }),
    hp: 10,
    maxHp: 10,
    enemy: null,
    defeated: [],
    fled: [],
    encounterCounts: {},
    failures: {},
    flags: {},
    guard: false,
    rng: opts.rng || defaultRng
  };
}

export function candidates(state) {
  const node = currentNode(state);
  const decision = node.decision;
  if (decision && !state.flags[`decision:${decision.id}`]) return decision.choices.map(({ id, label, input }) => ({ id, label, input }));
  const labels = node.authoring?.actionCandidateLabels || {};
  const choices = actionCandidates(state.enemy ? { ...node, secrets: [], encounters: [], exits: [] } : node, state, labels);
  const availableChoices = choices.filter(choice => {
    if (!choice.id.startsWith("secret:")) return true;
    const secret = node.secrets?.find(({ id }) => id === choice.id.slice("secret:".length));
    return secret && requiresMet(secret.requires, state);
  // 同じ言葉を送るボタンが2つ出ないようにする。遭遇のきっかけと出口のmatchが同じ言葉だと
  // 「左へ進む」と「左の坑道へ入る」が並び、押し分けられるように見えてしまう(実際は同じ)
  }).filter((choice, index, all) => all.findIndex(other => other.input === choice.input) === index);
  const weakness = weaknessFor(state);
  if (state.enemy && weakness?.triggers?.some(trigger => inv.held(state.inventory).some(name => name.includes(trigger)))) {
    const trigger = weakness.triggers.find(term => inv.held(state.inventory).some(name => name.includes(term)));
    /* ボタンの文言は、押したら何が起きるかそのものにする。weakness.hintは
       「こいつ、光を嫌がってる——ランタンで照らせ!」という叫びで、
       操作の名前ではない。この候補は「その品を持っていて、相手がそれを嫌う」
       ときにしか出てこないので、出ていること自体が助言になっている */
    availableChoices.push({ id: "combat:weakness", label: `${trigger}で照らす`, input: `${trigger}で照らす` });
  }
  for (const healing of state.chapter.healing || []) {
    if (state.hp < state.maxHp && inv.has(state.inventory, healing.name)) {
      const id = `heal:${healing.name}`;
      availableChoices.push({ id, label: labels[id] || `${healing.name}を飲む`, input: `${healing.name}を飲む` });
    }
  }
  return availableChoices;
}

export function act(state, originalInput) {
  const events = [];
  const node = currentNode(state);
  let input = originalInput;
  const decision = node.decision;
  if (decision && !state.flags[`decision:${decision.id}`]) {
    const choice = decision.choices.find(choice => choice.input === input);
    if (!choice) return [{ type: "unknown", text: input }];
    state.flags[`decision:${decision.id}`] = choice.id;
    input = choice.input;
  }

  const healing = (state.chapter.healing || []).find(({ name }) =>
    input.includes(name) && (input.includes("飲む") || input.includes("使う")) && inv.has(state.inventory, name)
  );
  // 傷が無いのに飲むと、品だけ消えて何も起きない。候補には出していないが、直に打てば通ってしまう
  if (healing && state.hp >= state.maxHp) {
    return [{ type: "narrate", text: `いまは傷が無い。${healing.name}を使うときではない` }];
  }
  if (healing) {
    item(events, state, healing.name, 1, false);
    state.hp = Math.min(state.maxHp, state.hp + healing.amount);
    events.push({ type: "narrate", text: healing.text ?? `${healing.name}を飲んだ` });
    if (state.enemy) counterattack(events, state);
    state.turn += 1;
    return events;
  }

  if (state.enemy) {
    const weakness = weaknessFor(state);
    if (weakness?.triggers?.some(trigger => input.includes(trigger) && inv.held(state.inventory).some(name => name.includes(trigger)))) {
      events.push({ type: "combat", text: weakness.text });
      if (weakness.effect === "flee") finishCombat(events, state, "fled");
    } else if (input.includes("攻撃")) {
      const roll = die(state, 20);
      let damage;
      if (roll >= (state.enemy.defenseDc || 12)) {
        damage = die(state, 6);
        state.enemy.hp -= damage;
      }
      events.push({ type: "combat", text: damage ? `${state.enemy.name}に ${damage} のダメージ` : `${state.enemy.name}への攻撃は空を切った` });
      // 倒しきったときは「弱っている」ではなく撃破の文だけを出す
      if (damage && state.enemy.hp > 0 && state.enemy.maxHp != null && state.enemy.hp <= state.enemy.maxHp / 3) {
        events.push({ type: "combat", text: `${state.enemy.name}は目に見えて弱っている` });
      }
      if (state.enemy.hp <= 0) finishCombat(events, state, "defeated");
      else counterattack(events, state);
    } else if (input.includes("防御")) {
      state.guard = true;
      // 押した手番に何も出ないと、防御したことが記録にも画面にも残らない
      events.push({ type: "combat", text: `${state.enemy.name}の動きを見て、身構えた` });
      counterattack(events, state);
    } else if (input.includes("逃げ")) {
      const roll = die(state, 20);
      if (roll >= (state.enemy.fleeDc || 10)) {
        events.push({ type: "combat", text: `${state.enemy.name}から逃げ切った` });
        finishCombat(events, state, "fled");
      } else counterattack(events, state);
    } else return [{ type: "unknown", text: input }];
    state.turn += 1;
    return events;
  }

  const encounter = availableEncounters(node, state).find(({ enc }) => enc.triggerTerms?.some(term => input.includes(term)));
  if (encounter) {
    const { enc, foe } = encounter;
    state.enemy = { ...foe, hp: foe.hp ?? foe.maxHp ?? 6, openingDanger: approachLevel(state.turn, state.sceneEnteredTurn) };
    state.sceneEnteredTurn = state.turn;
    state.encounterCounts[enc.id] = (state.encounterCounts[enc.id] || 0) + 1;
    events.push({ type: "combat", text: enc.onsetText });
  } else {
    const picked = pickExamineSecret(node, input, input, state).secret;
    const secret = picked && requiresMet(picked.requires, state) ? picked : null;
    if (secret) {
      const dc = examineDifficulty(secret, state.failures[secret.id] || 0);
      const roll = die(state, 20);
      const ok = roll === 20 || (roll !== 1 && roll >= dc);
      // ボタンに「坑道について尋ねる」と出しておいて判定が「坑道を調べる」では、言い方が二重になる
      const rollLabel = node.authoring?.actionCandidateLabels?.[`secret:${secret.id}`] || `${secret.entity}を調べる`;
      events.push({ type: "roll", label: rollLabel, roll, dc, ok });
      if (ok) {
        state.revealed.add(secret.id);
        events.push({ type: "reveal", text: secret.text, entity: secret.entity });
        for (const loot of node.loot || []) if (loot.requires === secret.id) item(events, state, loot.name, 1, true);
      } else {
        state.failures[secret.id] = (state.failures[secret.id] || 0) + 1;
        events.push({ type: "narrate", text: `${secret.entity}のことはまだ分からない` });
      }
    } else {
      const exit = resolveExit(node, input);
      if (!exit) return [{ type: "unknown", text: input }];
      if (!requiresMet(exit.requires, state)) return [{ type: "blocked", text: exit.blockedText || node.blockedText }];
      if (!transition(events, state, exit)) return events;
    }
  }
  state.turn += 1;
  return events;
}
