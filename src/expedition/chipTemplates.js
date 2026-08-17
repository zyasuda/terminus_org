import { openSlots, slotPosition } from "./mapgen.js";

const MIN_SLOT_GAP = 6;

export const CHIP_TEMPLATES = {
  // 小規模な遭遇や宝箱に使う、既定どおり各面の中央だけが開く部屋。
  small: { w: [4, 6], h: [4, 6] },
  // 中規模の分岐・合流で、東壁の両端に2本の通路を持たせる縦長の部屋。
  wideHallEast: { w: [4, 6], h: [16, 20], ports: { east: [true, false, true] } },
  // 1つの部屋から3本の枝へ分岐させる、大規模な縦長の部屋。
  tripleBranchEast: { w: [4, 6], h: [18, 20], ports: { east: [true, true, true] } },
  // 複数方向の通路を受ける、大規模な広間・特殊遭遇用の部屋。
  grandJunction: {
    w: [18, 20], h: [18, 20],
    ports: {
      north: [true, true, true], east: [true, true, true],
      south: [true, true, true], west: [true, true, true],
    },
  },
};

export function validateChipTemplate(template) {
  for (const direction of ["north", "east", "south", "west"]) {
    const length = (direction === "north" || direction === "south" ? template.w : template.h)[0];
    const slots = openSlots(template, direction);
    for (let i = 1; i < slots.length; i += 1) {
      const previous = slots[i - 1], current = slots[i];
      const gap = slotPosition(length, current) - slotPosition(length, previous);
      if (gap < MIN_SLOT_GAP) {
        return { ok: false, reason: `${direction}面のslot ${previous} と ${current} の間隔が${gap}マスです（最低${MIN_SLOT_GAP}マス必要）` };
      }
    }
  }
  return { ok: true };
}
