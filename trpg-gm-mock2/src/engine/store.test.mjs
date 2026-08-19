/* 演出レイヤーの故障がゲーム進行を止めないことの回帰テスト。
   実行: npm run test:store

   2026-08-19の実プレイで、Phaserの演出canvasが0×0のまま作られ、
   クリティカル/ファンブルのフラッシュが毎回WebGLの
   「Framebuffer status: Incomplete Attachment」で例外を投げていた。
   当時のsetStoreは listeners.forEach(fn => fn()) で例外を素通ししていたため、
   その例外が状態更新の呼び出し元まで遡り、判定の途中で手番が中断してゲームが固まった。
   canvasのサイズ自体はPhaserFx.jsx側で直したが、演出が何で壊れても進行は
   続くことをここで担保する(次に別の演出が投げても同じ事故を繰り返さないため)。 */
import { setStore, subscribe, getSnapshot } from "./store.js";

let ng = 0;
const ok = (cond, label) => {
  if (!cond) { console.error(`NG ${label}`); ng++; }
};

// 演出レイヤーの購読が毎回投げる状況を作る(0×0canvasでflashが投げるのと同じ形)
const unsubBroken = subscribe(() => { throw new Error("Framebuffer status: Incomplete Attachment"); });

// 進行側の購読。壊れた購読より後に登録されていても呼ばれ続ける必要がある
let healthyCalls = 0;
const unsubHealthy = subscribe(() => { healthyCalls++; });

// 1. 壊れた購読があっても setStore 自体が投げない(呼び出し元の手番を巻き込まない)
let threw = false;
try { setStore({ turn: 1 }); } catch (e) { threw = true; }
ok(!threw, "壊れた購読があっても setStore は例外を投げない");

// 2. 状態は正しく更新されている
ok(getSnapshot().turn === 1, "壊れた購読があっても状態は更新される");

// 3. 壊れた購読の後ろに並ぶ購読も呼ばれる(1件の故障で通知列が止まらない)
ok(healthyCalls === 1, `壊れた購読の後続も呼ばれる(呼ばれた回数: ${healthyCalls})`);

// 4. 続けて何度更新しても同じ(1回きりの偶然ではない)
setStore({ turn: 2 });
setStore({ turn: 3 });
ok(getSnapshot().turn === 3, "連続更新でも状態が進む");
ok(healthyCalls === 3, `連続更新でも後続の購読が毎回呼ばれる(呼ばれた回数: ${healthyCalls})`);

unsubBroken();
unsubHealthy();

if (ng) { console.error(`\nstore: NG ${ng}件`); process.exit(1); }
console.log("store: OK");
