// trpg-rogue-map/src/draw.js から移植。床はマスではなく、部屋と通路を一続きの面として描く。
export const FLOOR = { roomInset: 0.06, roomRound: 0.3, corridorWidth: 0.62 };
const fmt = n => Number(n).toFixed(3);
export function roomShapes(rooms, keep = () => true) {
  let out = "";
  for (const room of rooms.values()) if (keep(room)) {
    const i = FLOOR.roomInset;
    out += `<rect x="${fmt(room.x + i)}" y="${fmt(room.y + i)}" width="${fmt(room.w - i * 2)}" height="${fmt(room.h - i * 2)}" rx="${FLOOR.roomRound}"/>`;
  }
  return out;
}
export function corridorShapes(corridors, rooms, keep = () => true, keepCell = () => true) {
  let out = "";
  for (const corridor of corridors) {
    if (!keep(corridor)) continue;
    const runs = [], run = [];
    for (const cell of corridor.path) {
      if (keepCell(cell)) run.push(cell);
      else if (run.length) { runs.push([...run]); run.length = 0; }
    }
    if (run.length) runs.push(run);
    const reach = (end, room) => {
      if (!room) return end;
      const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
      const dx = cx - end.x, dy = cy - end.y, len = Math.hypot(dx, dy) || 1;
      return { x: end.x + dx / len * .6, y: end.y + dy / len * .6 };
    };
    for (const cells of runs) {
      const points = cells.map(cell => ({ x: cell.x + .5, y: cell.y + .5 }));
      const line = [
        ...(cells[0] === corridor.path[0] ? [reach(points[0], rooms.get(corridor.a))] : []), ...points,
        ...(cells.at(-1) === corridor.path.at(-1) ? [reach(points.at(-1), rooms.get(corridor.b))] : []),
      ];
      out += `<polyline points="${line.map(p => `${fmt(p.x)},${fmt(p.y)}`).join(" ")}" fill="none" stroke-width="${FLOOR.corridorWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  return out;
}
