import { createGrid } from "../battle/core.js";

const ROWS = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########"
];

export function createLightChamberStage(party) {
  const grid = createGrid(ROWS);
  grid.stage = { id: "light-chamber", name: "灯りの部屋", scenarioSceneId: 3, investigations: [], props: [] };
  const companions = party.map((unit, index) => ({ ...unit, x: 3 + index, y: 4 }));
  const guardian = {
    id: "guardian", modelId: "guardian", name: "灯りの番人", side: "npc",
    x: 4, y: 1, hp: 12, maxHp: 12, atk: 2, agility: 1, defenseDc: 13, height: 1.8, facing: 0
  };
  return { grid, units: [...companions, guardian] };
}
