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

function structureFor(chapter) {
  const structure = [];
  const allSecrets = new Map();
  const duplicateSecrets = new Set();
  const reveals = new Set();

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

  const usedSecrets = new Set();
  for (const [where, node] of nodes(chapter)) {
    if (!node) continue;
    if (where !== "ending" && !(node.exits || []).length) {
      structure.push(issue("error", where, "出口を持たない場面がある"));
    }
    for (const exit of node.exits || []) {
      const exitWhere = `${where} / exit ${exit.id || "?"}`;
      if (exit.to !== "ending" && exit.to !== "end" && exitTargetIndexIn(chapter.scenes || [], exit.to) < 0) {
        structure.push(issue("error", exitWhere, "出口が実在しない場面を指している"));
      }
      for (const key of ["secretsAll", "secretsAny"]) for (const id of exit.requires?.[key] || []) {
        usedSecrets.add(id);
        if (!allSecrets.has(id)) structure.push(issue("error", exitWhere, `必要な発見「${id}」が存在しない`));
      }
    }
    if (node.decision) {
      const decisionWhere = `${where} / decision ${node.decision.id || "?"}`;
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
        structure.push(issue("error", `${where} / encounter ${encounter.id || "?"}`, "遭遇に必要な発見が同じ場面の秘密に存在しない"));
      }
      const reveal = encounter.enemy?.revealOnDefeat;
      if (reveal && !allSecrets.has(reveal)) structure.push(issue("error", `${where} / encounter ${encounter.id || "?"}`, `撃破後に開示する秘密「${reveal}」が存在しない`));
    }
  }

  const decisions = new Set();
  for (const [where, node] of nodes(chapter)) if (node?.decision?.id) {
    if (decisions.has(node.decision.id)) structure.push(issue("error", where, `決断の id「${node.decision.id}」が章内で重複している`));
    decisions.add(node.decision.id);
  }
  for (const [id, { where, secret }] of allSecrets) {
    if (usedSecrets.has(id) && !secret.trigger && !(secret.aliases || []).length && !reveals.has(id)) {
      structure.push(issue("warn", where, `必要条件の秘密「${id}」を調査または他の経路で開示できない`));
    }
  }
  return structure;
}

function play(chapter) {
  const result = { runs: 50, cleared: 0, died: 0, stuck: 0, ranOut: 0, stuckAt: [], medianTurns: 0 };
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
  return result;
}

export function inspect(chapter) {
  return { structure: structureFor(chapter), play: play(chapter) };
}
