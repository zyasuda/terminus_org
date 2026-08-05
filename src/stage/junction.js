import { cellAt, createGrid } from "../battle/core.js";

// シーン2「分かれ道」の最初の固定舞台。#は坑道の壁、.は歩ける床。
const ROWS = [
  "#########",
  "###.#.###",
  "###.#.###",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########"
];

const party = () => [
  { id: "gareth", name: "ガレス", side: "party", x: 4, y: 5, hp: 16, maxHp: 16, atk: 3, agility: 7, defenseDc: 12, height: 1.5, facing: Math.PI },
  { id: "lydia", name: "リディア", side: "party", x: 3, y: 5, hp: 14, maxHp: 14, atk: 2, agility: 4, defenseDc: 12, height: 1.425, facing: Math.PI }
];

const enemies = () => [
  { id: "rust1", modelId: "rust-eater", name: "錆喰い", side: "enemy", x: 6, y: 3, hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12, height: 0.8 },
  { id: "rust2", modelId: "rust-eater", name: "錆喰い(2)", side: "enemy", x: 6, y: 2, hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12, height: 0.8 }
];

const block = (grid, x, y, kind) => {
  const cell = cellAt(grid, x, y);
  cell.walkable = false;
  cell.obstacle = { height: 1, kind };
};

export function createJunctionStage() {
  const grid = createGrid(ROWS);
  block(grid, 3, 1, "collapse");
  block(grid, 5, 1, "barrier");
  grid.stage = {
    id: "mine-junction",
    name: "分かれ道",
    scenarioSceneId: 2,
    anchors: {
      arrival: { x: 4, y: 5 },
      collapse: { x: 3, y: 1 },
      barrier: { x: 5, y: 1 },
      ambush: { x: 6, y: 2 }
    },
    investigations: [
      { secretId: "s2a", anchor: "barrier", speakerId: "lydia" },
      { secretId: "s2b", anchor: "arrival", speakerId: "lydia" },
      { secretId: "s2c", anchor: "collapse", speakerId: "gareth" }
    ],
    props: [
      { kind: "collapse", role: "collapse", x: 3, y: 1 },
      { kind: "barrier", role: "barrier", x: 5, y: 1 }
    ]
  };
  return { grid, units: [...party(), ...enemies()] };
}
