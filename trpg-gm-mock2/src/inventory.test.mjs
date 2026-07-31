/* 所持品のキャラクター別管理の自己チェック。
   実行: npm run test:inventory
   フレームワークは入れない(node標準のassertだけ)。 */

import assert from "node:assert/strict";
import {
  PLAYER, normalizeInventory, held, has, ownerOf,
  give, take, move, startingInventory, byOwner, ensureOwner
} from "./inventory.js";

/* --- 旧セーブの移行 --- */
{
  // 旧形式は items が文字列配列。所有者の情報が無いのでプレイヤーへ寄せる
  const inv = normalizeInventory({ items: ["ランタン", "ロープ"] });
  assert.deepEqual(inv, { player: ["ランタン", "ロープ"] });

  // inventory があればそちらが正。player の欄は必ず作る
  const inv2 = normalizeInventory({ inventory: { member_2: ["ランタン"] }, items: ["無視される"] });
  assert.deepEqual(inv2, { member_2: ["ランタン"], player: [] });

  // 空・不正な入力でも player の空欄だけは返す
  assert.deepEqual(normalizeInventory(undefined), { player: [] });
  assert.deepEqual(normalizeInventory({ items: "文字列" }), { player: [] });
  assert.deepEqual(normalizeInventory({ inventory: [] }), { player: [] });

  // 文字列でない要素と空文字は落とす
  assert.deepEqual(normalizeInventory({ items: ["刀", "", null, 3] }), { player: ["刀"] });

  // 同じ品を2人が持つ状態は不正。先に現れた所有者を残す
  const dup = normalizeInventory({ inventory: { member_1: ["鍵"], member_2: ["鍵", "縄"] } });
  assert.deepEqual(dup, { member_1: ["鍵"], member_2: ["縄"], player: [] });
}

/* --- 平坦化と所有者の解決 --- */
{
  const inv = { player: ["ナイフ"], member_1: ["工具袋"], member_2: ["ランタン", "ロープ"] };
  assert.deepEqual(held(inv), ["ナイフ", "工具袋", "ランタン", "ロープ"]);
  assert.equal(has(inv, "ランタン"), true);
  assert.equal(has(inv, "存在しない品"), false);
  assert.equal(ownerOf(inv, "ロープ"), "member_2");
  assert.equal(ownerOf(inv, "存在しない品"), null);
  assert.deepEqual(held({}), []);
  assert.deepEqual(held(null), []);
}

/* --- 追加 --- */
{
  const inv = normalizeInventory({ items: [] });
  assert.equal(give(inv, "心石の欠片"), true);
  assert.equal(ownerOf(inv, "心石の欠片"), PLAYER);

  // 所有者を指定できる。欄が無ければ作る
  assert.equal(give(inv, "工具袋", "member_1"), true);
  assert.deepEqual(inv.member_1, ["工具袋"]);

  // 誰かが既に持っている品は追加しない。重複所持を作らない
  assert.equal(give(inv, "工具袋", "member_2"), false);
  assert.equal(ownerOf(inv, "工具袋"), "member_1");
  assert.equal(held(inv).filter(n => n === "工具袋").length, 1);

  // 品名が無い・文字列でないときは何もしない
  assert.equal(give(inv, ""), false);
  assert.equal(give(inv, null), false);
}

/* --- 取り除く --- */
{
  const inv = { player: ["ナイフ"], member_2: ["ランタン", "ロープ"] };
  assert.equal(take(inv, "ロープ"), true);
  assert.deepEqual(inv.member_2, ["ランタン"]);

  // 持っていない品は取れない。戻り値で分かる
  assert.equal(take(inv, "ロープ"), false);

  // 誰が持っていても取れる
  assert.equal(take(inv, "ナイフ"), true);
  assert.deepEqual(inv.player, []);
}

/* --- 譲渡 --- */
{
  const inv = { player: ["ランタン"], member_2: [] };
  assert.equal(move(inv, "ランタン", "member_2"), true);
  assert.deepEqual(inv.player, []);
  assert.deepEqual(inv.member_2, ["ランタン"]);

  // 持っていない品は渡せない
  assert.equal(move(inv, "存在しない品", "member_2"), false);
  // 渡し先が無いときは何もしない
  assert.equal(move(inv, "ランタン", ""), false);
  assert.deepEqual(inv.member_2, ["ランタン"]);

  // 譲渡しても総数は変わらない
  assert.equal(held(inv).length, 1);
}

/* --- 章開始時の割り当て --- */
{
  // chapter.startingInventory があればそれが正
  const a = startingInventory({
    chapterStarting: { member_2: ["ランタン", "ロープ"], member_1: ["工具袋"] },
    campaignInitial: ["無視される"]
  });
  assert.deepEqual(a, { member_2: ["ランタン", "ロープ"], member_1: ["工具袋"], player: [] });

  // 無ければ campaign.initialInventory をプレイヤーへ
  const b = startingInventory({ campaignInitial: ["ランタン", "ロープ", "ナイフ"] });
  assert.deepEqual(b, { player: ["ランタン", "ロープ", "ナイフ"] });

  // どちらも無ければ既定値
  const c = startingInventory({ fallback: ["ランタン"] });
  assert.deepEqual(c, { player: ["ランタン"] });

  // 空配列は「指定なし」として扱い、既定値へ落とす
  const d = startingInventory({ campaignInitial: [], fallback: ["ナイフ"] });
  assert.deepEqual(d, { player: ["ナイフ"] });
}

/* --- 画面表示用 --- */
{
  const inv = { player: ["ナイフ"], member_2: ["ランタン"] };
  const rows = byOwner(inv, id => (id === "player" ? "あなた" : "ガレス"));
  assert.deepEqual(rows, [
    { owner: "player", name: "あなた", items: ["ナイフ"] },
    { owner: "member_2", name: "ガレス", items: ["ランタン"] }
  ]);

  // 持ち物が空の所有者も欄を残す。「何も持っていない」を出すため
  const empty = ensureOwner({ player: [] }, "member_1");
  assert.deepEqual(byOwner(empty).map(r => r.owner), ["player", "member_1"]);
}

/* --- 条件判定はパーティ全体で見る（出口の requires と同じ扱い） --- */
{
  const inv = { player: [], member_1: ["古い鍵"] };
  // プレイヤー本人が持っていなくても、パーティの誰かが持っていれば条件を満たす
  assert.equal(has(inv, "古い鍵"), true);
  assert.equal(["古い鍵"].every(n => held(inv).includes(n)), true);
}

console.log("所持品の自己チェック: すべて通過");
