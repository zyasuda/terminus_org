/* 地図の床の描き方。判定は持たない（地図を受け取って SVG の文字列を返すだけ）。

   作者の指摘:「マスをグラデで色分けしたいとは一言も言っていません」。
   マス単位で明るさを変えればマス目が見える。マス目は移動と判定のためのもので、描くものではない。

   したがって床は【1つの面】として描く。
   - 部屋は rooms{x,y,w,h} から【1つの角丸矩形】
   - 通路は corridors[].path から【太い折れ線】
   マスごとに図形を置く方法は一度試して失敗した（部屋が4〜7×3〜5マスあるため、
   斜めの角に隙間が残って穴だらけになる。probeで通用したのは部屋が1マスだったから）。 */

export const FLOOR = {
  roomInset: 0.06,     // 部屋の矩形を少し内側に。岩との間に余白を作る
  roomRound: 0.3,      // 部屋の角の丸み（マス単位）。大きくすると丸薬のようになる
  corridorWidth: 0.62, // 通路の太さ。部屋より細くして形で区別する
};

const fmt = (n) => Number(n).toFixed(3);

/* 部屋。1部屋＝1つの角丸矩形 */
export function roomShapes(rooms, keep = () => true) {
  let out = "";
  for (const room of rooms.values()) {
    if (!keep(room)) continue;
    const i = FLOOR.roomInset;
    out += `<rect x="${fmt(room.x + i)}" y="${fmt(room.y + i)}" width="${fmt(room.w - i * 2)}" height="${fmt(room.h - i * 2)}" rx="${FLOOR.roomRound}"/>`;
  }
  return out;
}

/* 通路。path を太い折れ線で結ぶ。両端は部屋の中へ少し食い込ませて、
   部屋と通路が確実に繋がるようにする（隙間ができると道が切れて見える） */
export function corridorShapes(corridors, rooms, keep = () => true, keepCell = () => true) {
  let out = "";
  for (const corridor of corridors) {
    if (!keep(corridor)) continue;
    const runs = [];
    let run = [];
    for (const cell of corridor.path) {
      if (keepCell(cell)) run.push(cell);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
    const reach = (end, room) => {
      if (!room) return end;
      // 部屋の中心へ向けて0.6マス伸ばす
      const cx = room.x + room.w / 2;
      const cy = room.y + room.h / 2;
      const dx = cx - end.x;
      const dy = cy - end.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: end.x + (dx / len) * 0.6, y: end.y + (dy / len) * 0.6 };
    };
    for (const cells of runs) {
      const points = cells.map((cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 }));
      const line = [
        ...(cells[0] === corridor.path[0] ? [reach(points[0], rooms.get(corridor.a))] : []),
        ...points,
        ...(cells.at(-1) === corridor.path.at(-1) ? [reach(points.at(-1), rooms.get(corridor.b))] : []),
      ];
      out += `<polyline points="${line.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ")}" fill="none"`
        + ` stroke-width="${FLOOR.corridorWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  return out;
}

/* 岩肌を歪ませるフィルタ。ブラウザ内蔵の機能だけで作る（依存を増やさない）。
   baseFrequency を上げすぎると毛羽立って見える。1マスあたり1周期を切るくらいが、
   掘った跡に見える（実測で 2.0 は細かすぎた）。 */
export const roughFilter = (id = "rough") => `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="3" seed="11" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="0.30" xChannelSelector="R" yChannelSelector="G"/>
</filter>`;
