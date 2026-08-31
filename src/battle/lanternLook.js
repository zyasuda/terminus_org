// カンテラ(松明)の「見た目」の正本。戦闘(view3d.js)と探索の一人称(firstPersonScene.js)が
// 同じ灯りになるよう、色・強さ・射程・揺らぎをここだけに置く。
//
// 色は実測で詰めた値。元は0xffa848(濃い橙)だったが、床を石のモノトーンにしたところ
// 床が橙に染まってグレーに見えなくなった。scripts/lantern-tune.mjs で床の無彩色からの
// 偏りを測って決めた(2026-08-25、偏り26.4%→3.3%)。橙みは残っているが、
// カンテラの存在は色ではなく明るさの落ち方で出る(近く明度53 / 遠く明度41)。
// ここを勘で変えると床がまた橙に染まる。変えるなら lantern-tune.mjs で測り直すこと。
export const LANTERN_COLOR = 0xffe3bd;
export const LANTERN_INTENSITY = 4.6;
export const LANTERN_RANGE = 3.0;   // 単位: タイル

// 距離減衰は必ず 0(THREE.PointLightの第4引数)。
// 既定の逆二乗のままだと、光源のすぐ隣にあるものだけが白飛びする。
// 減衰を切ると範囲内が一様に照らされ、distanceの縁でなめらかに落ちる。
export const LANTERN_DECAY = 0;

// 炎の揺らぎ。周期の違う4つのsinを重ねて、繰り返しに聞こえないようにしている。
// 返り値は 0.36〜1.0 前後。intensityに掛けて使う。
export const flicker = t =>
  0.68 + 0.32 * (Math.sin(t) * 0.34 + Math.sin(t * 2.3) * 0.3 + Math.sin(t * 5.7) * 0.22 + Math.sin(t * 9.1) * 0.14);

// 揺らぎの速さ。上げるほど速い。6 → 3.2(2026-08-25) → 2.2(2026-08-31、作者の指示でゆっくりに)。
// ここは戦闘と探索の両方に効く。片方だけ変えたくなったら、共通にした意味を先に考えること。
export const FLICKER_SPEED = 2.2;
