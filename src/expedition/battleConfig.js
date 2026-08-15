// 遠征戦闘でプレイ後に調整する値の単独正本です。
// d20判定・経路探索・レンダラー内部の計算は、ここには置きません。
export const EXPEDITION_BATTLE_CONFIG = {
  board: {
    corridor: {
      width: 7,
      height: 3,
      partySlots: [{ x: 0, y: 0 }, { x: 0, y: 2 }],
      enemyStart: { x: 6, y: 1 },
    },
    guardian: {
      width: 8,
      height: 8,
      partySlots: [{ x: 1, y: 3 }, { x: 1, y: 4 }],
      enemyStart: { x: 6, y: 3 },
    },
    obstacles: { min: 1, max: 6 },
  },
  units: {
    hero: { name: "あなた", modelId: "gareth", atk: 3, hp: 16, agility: 7, height: 1.6 },
    mage: { name: "リディア", modelId: "lydia", atk: 2, hp: 12, agility: 5, height: 1.6 },
    enemy: { name: "坑道の獣", modelId: "rust-eater", atk: 2, hp: 8, agility: 4, height: 0.9 },
    guardian: { name: "宝箱守護者", modelId: "rust-eater", atk: 3, hp: 18, agility: 4, height: 0.9 },
  },
  timing: {
    aiThinkMs: 650,
    moveSettleMs: 800,
    attackSettleMs: 1000,
    turnTransitionMs: 350,
    attackCameraMs: 700,
  },
  presentation: {
    showBackdropWalls: true,
    modelFacingOffset: { party: 0, enemy: 0 },
  },
};
