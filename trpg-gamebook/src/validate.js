import { newGame, candidates, act } from "./gamebook.js";
import {
  decisionInputResolves,
  encounterRequiredElementsMet,
  exitTargetIndexIn
} from "./progression.js";

const seeded = seed => {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 2 ** 32);
};

const nodes = chapter => [
  ["intro", chapter.intro],
  ...(chapter.scenes || []).map((scene, index) => [`scene ${scene.id ?? index + 1}`, scene]),
  ["ending", chapter.ending]
];

const issue = (level, where, message) => ({ level, where, message });

const quotedTerms = brief => [...String(brief || "").matchAll(/「([^」]*)」|『([^』]*)』/g)]
  .map(match => match[1] ?? match[2]).filter(Boolean);

const reactsTo = (shown, reaction) => shown === reaction || shown.includes(reaction) || reaction.includes(shown);

const sceneLabel = where => where === "intro" ? "イントロ" : where === "ending" ? "エンディング" : where.replace(/^scene /, "シーン");

function vocabularyFor(chapter) {
  const structure = [];
  for (const [where, node] of nodes(chapter)) {
    const shown = [];
    for (const term of quotedTerms(node?.brief)) if (!shown.some(item => item.term === term)) shown.push({ term, source: "導入文" });
    for (const term of node?.hintChips || []) if (term && !shown.some(item => item.term === term)) shown.push({ term, source: "hintChips" });
    const reactions = [
      ...(node?.secrets || []).flatMap(secret => [secret.entity, ...(secret.aliases || []), secret.trigger]),
      ...(node?.exits || []).flatMap(exit => exit.match || []),
      ...(node?.encounters || []).flatMap(encounter => encounter.triggerTerms || [])
    ].filter(Boolean).map(String);
    for (const { term, source } of shown) {
      if (!reactions.some(reaction => reactsTo(term, reaction))) {
        structure.push(issue("warn", `${sceneLabel(where)} / ${source}`, `${source}の「${term}」に反応するものが無い`));
      }
    }
  }

  const spellings = [];
  const normalize = value => String(value).replace(/[のがをにはへと\s・-]/g, "");
  for (const [where, node] of nodes(chapter)) {
    for (const secret of node?.secrets || []) {
      if (typeof secret.entity !== "string" || !secret.entity) continue;
      spellings.push({ entity:secret.entity, where, normalized:normalize(secret.entity) });
    }
  }
  for (let left = 0; left < spellings.length; left += 1) {
    for (let right = left + 1; right < spellings.length; right += 1) {
      const a = spellings[left], b = spellings[right];
      if (a.where === b.where || !a.normalized || a.entity === b.entity || a.normalized !== b.normalized) continue;
      structure.push(issue("warn", `${sceneLabel(a.where)} / ${sceneLabel(b.where)}`, `「${a.entity}」（${sceneLabel(a.where)}）と「${b.entity}」（${sceneLabel(b.where)}）は同じものですか`));
    }
  }
  return structure;
}

function itemVocabularyFor(chapter) {
  const obtainable = new Map();
  const used = [];
  const addObtainable = (name, where) => {
    if (typeof name === "string" && name && !obtainable.has(name)) obtainable.set(name, where);
  };
  const addUsed = name => {
    if (typeof name === "string" && name) used.push(name);
  };

  if (Array.isArray(chapter.startingInventory)) {
    for (const item of chapter.startingInventory) addObtainable(typeof item === "string" ? item : item?.name, "開始時の持ち物");
  } else if (chapter.startingInventory && typeof chapter.startingInventory === "object") {
    for (const owner of Object.keys(chapter.startingInventory)) addObtainable(owner, "開始時の持ち物");
  }

  for (const [where, node] of nodes(chapter)) {
    for (const exit of node?.exits || []) {
      // 章の終わりでもらう報酬は、この章では使えなくて当然。消せない警告を出さない
      if (exit.to !== "end") for (const name of exit.addItems || []) addObtainable(name, sceneLabel(where));
      // 章の終わりで渡す・消費するのも立派な使い道(「心石の欠片」がこれに当たる)
      for (const name of exit.removeItems || []) addUsed(name);
      for (const key of ["itemsAny", "itemsAll"]) for (const name of exit.requires?.[key] || []) addUsed(name);
    }
    for (const loot of node?.loot || []) addObtainable(loot?.name, sceneLabel(where));
    const enemies = [node?.enemy, ...(node?.encounters || []).map(encounter => encounter.enemy)];
    for (const enemy of enemies.filter(Boolean)) {
      addObtainable(enemy.itemOnDefeat, sceneLabel(where));
      for (const trigger of enemy.weakness?.triggers || []) addUsed(trigger);
    }
  }

  const structure = [];
  for (const [name, where] of obtainable) {
    if (!used.some(reference => reference === name || name.includes(reference))) {
      structure.push(issue("warn", where, `「${name}」は入手できるが、使う手段が無い`));
    }
  }
  return structure;
}

function structureFor(chapter) {
  const structure = [];
  const allSecrets = new Map();
  const duplicateSecrets = new Set();
  const reveals = new Set();
  const incomingScenes = new Set();

  for (const [where, node] of nodes(chapter)) {
    for (const secret of node?.secrets || []) {
      if (allSecrets.has(secret.id)) duplicateSecrets.add(secret.id);
      else allSecrets.set(secret.id, { where, secret });
    }
    for (const encounter of node?.encounters || []) {
      if (encounter.enemy?.revealOnDefeat) reveals.add(encounter.enemy.revealOnDefeat);
    }
    if (node?.enemy?.revealOnDefeat) reveals.add(node.enemy.revealOnDefeat);
  }
  for (const id of duplicateSecrets) structure.push(issue("error", "secrets", `秘密の id「${id}」が章内で重複している`));

  for (const [, node] of nodes(chapter)) for (const exit of node?.exits || []) {
    if (exit.to !== "ending" && exit.to !== "end") {
      const index = exitTargetIndexIn(chapter.scenes || [], exit.to);
      if (index >= 0) incomingScenes.add(index);
    }
  }
  for (const [index, scene] of (chapter.scenes || []).entries()) {
    if (!incomingScenes.has(index)) structure.push(issue("warn", sceneLabel(`scene ${scene.id ?? index + 1}`), "どこからも来られない場面がある"));
  }

  const usedSecrets = new Set();
  for (const [where, node] of nodes(chapter)) {
    if (!node) continue;
    if (where !== "ending" && !(node.exits || []).length) {
      structure.push(issue("error", sceneLabel(where), "出口を持たない場面がある"));
    }
    for (const exit of node.exits || []) {
      const exitWhere = `${sceneLabel(where)} / 行き先${exit.match?.[0] ? `「${exit.match[0]}」` : ""}`;
      if (exit.to !== "ending" && exit.to !== "end" && exitTargetIndexIn(chapter.scenes || [], exit.to) < 0) {
        structure.push(issue("error", exitWhere, "出口が実在しない場面を指している"));
      }
      for (const key of ["secretsAll", "secretsAny"]) for (const id of exit.requires?.[key] || []) {
        usedSecrets.add(id);
        if (!allSecrets.has(id)) structure.push(issue("error", exitWhere, "必要な発見が存在しない"));
      }
    }
    if (node.decision) {
      const decisionWhere = `${sceneLabel(where)} / 決断`;
      if (!decisionInputResolves(node, node.decision.choices?.[0]?.input || "")) {
        // choices are checked below; this branch only keeps empty choices visible.
      }
      for (const choice of node.decision.choices || []) {
        if (!decisionInputResolves(node, choice.input || "")) {
          structure.push(issue("error", decisionWhere, `決断の入力「${choice.input || ""}」を解決できない`));
        }
      }
    }
    for (const encounter of node.encounters || []) {
      const labels = new Set((node.secrets || []).flatMap(secret => [secret.entity, ...(secret.aliases || [])]));
      const ctx = { revealed: new Set((node.secrets || []).map(secret => secret.id)) };
      if (!encounterRequiredElementsMet(encounter, node, ctx) || (encounter.requiredElements || []).some(label => !labels.has(label))) {
        structure.push(issue("error", `${sceneLabel(where)} / 遭遇${encounter.enemy?.name ? `「${encounter.enemy.name}」` : ""}`, "遭遇に必要な発見が同じ場面の秘密に存在しない"));
      }
      const reveal = encounter.enemy?.revealOnDefeat;
      if (reveal && !allSecrets.has(reveal)) structure.push(issue("error", `${sceneLabel(where)} / 遭遇${encounter.enemy?.name ? `「${encounter.enemy.name}」` : ""}`, `撃破後に開示する秘密「${reveal}」が存在しない`));
    }
  }

  const decisions = new Set();
  for (const [where, node] of nodes(chapter)) if (node?.decision?.id) {
    if (decisions.has(node.decision.id)) structure.push(issue("error", sceneLabel(where), "同じ決断が章内で2つある"));
    decisions.add(node.decision.id);
  }
  for (const [id, { where, secret }] of allSecrets) {
    if (usedSecrets.has(id) && !secret.trigger && !(secret.aliases || []).length && !reveals.has(id)) {
      structure.push(issue("warn", sceneLabel(where), `「${secret.entity}」は必要とされているのに、調べる手段も他の開示経路も無い`));
    }
  }
  return structure.concat(vocabularyFor(chapter), itemVocabularyFor(chapter));
}

function collectOutcomes(result, state, chapter) {
  const labels = new Map();
  const count = label => labels.set(label, (labels.get(label) || 0) + 1);
  const decisions = new Map(nodes(chapter).flatMap(([, node]) => node?.decision ? [[node.decision.id, node.decision]] : []));
  for (const [key, value] of Object.entries(state.flags)) {
    if (!key.startsWith("decision:")) continue;
    const decision = decisions.get(key.slice("decision:".length));
    const choice = decision?.choices?.find(item => item.id === value);
    if (choice?.label) count(`${choice.label} を選んだ`);
  }
  for (const name of state.defeated || []) count(`${name}を倒した`);
  for (const name of state.fled || []) count(`${name}を逃がした`);
  if (state.hp <= 0) count("死亡した");
  for (const [label, value] of labels) result.outcomeCounts.set(label, (result.outcomeCounts.get(label) || 0) + value);
}

function play(chapter) {
  const result = { runs: 50, cleared: 0, died: 0, stuck: 0, ranOut: 0, stuckAt: [], medianTurns: 0, outcomes: [] };
  result.outcomeCounts = new Map();
  const stuckAt = new Map();
  const turns = [];
  for (let seed = 1; seed <= result.runs; seed += 1) {
    const rng = seeded(seed);
    const state = newGame(chapter, { rng });
    let steps = 0;
    for (; steps < 200 && state.node !== "done"; steps += 1) {
      const choices = candidates(state);
      if (!choices.length) break;
      act(state, choices[Math.floor(rng() * choices.length)].input);
    }
    collectOutcomes(result, state, chapter);
    turns.push(state.turn);
    if (state.node === "done") {
      if (state.hp <= 0) result.died += 1;
      else result.cleared += 1;
    } else if (!candidates(state).length) {
      result.stuck += 1;
      const node = state.node === "intro" ? chapter.intro : state.node === "ending" ? chapter.ending : chapter.scenes[state.sceneIndex];
      const name = node?.name || state.node;
      stuckAt.set(name, (stuckAt.get(name) || 0) + 1);
    } else result.ranOut += 1;
  }
  result.stuckAt = [...stuckAt].map(([place, count]) => ({ place, count })).sort((a, b) => b.count - a.count);
  turns.sort((a, b) => a - b);
  result.medianTurns = (turns[24] + turns[25]) / 2;
  result.outcomes = [...result.outcomeCounts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  delete result.outcomeCounts;
  return result;
}

export function inspect(chapter) {
  return { structure: structureFor(chapter), play: play(chapter) };
}
