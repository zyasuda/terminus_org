import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type: "json" };
import { inspect } from "../src/validate.js";

const copy = () => structuredClone(chapter);

{
  const result = inspect(copy());
  assert.equal(result.structure.filter(({ level }) => level === "error").length, 0);
  assert.ok(result.play.cleared > 0);
}
console.log("ok 1 - 無傷の章は構造エラーなく完走できる");

{
  const broken = copy();
  broken.scenes[2].exits[0].to = 0;
  assert.ok(inspect(broken).structure.some(({ message }) => message.includes("実在しない場面を指している")));
}
console.log("ok 2 - 存在しない出口を検出する");

{
  const broken = copy();
  broken.scenes[3].exits = [];
  const result = inspect(broken);
  assert.ok(result.structure.some(({ message }) => message.includes("出口を持たない場面")));
  assert.ok(result.play.stuck > 0);
}
console.log("ok 3 - 出口なしは静的検査と自動プレイの両方で検出する");

{
  const broken = copy();
  broken.scenes[1].decision.choices[0].input = "あああ";
  assert.ok(inspect(broken).structure.some(({ message }) => message.includes("解決できない")));
}
console.log("ok 4 - 解決できない決断入力を検出する");

{
  const broken = copy();
  broken.intro.brief = "「秘密の扉」について話す。";
  broken.intro.hintChips = [];
  assert.ok(inspect(broken).structure.some(({ message }) => message === "導入文の「秘密の扉」に反応するものが無い"));
}
console.log("ok 5 - 本文の語に反応するものが無いと警告する");

{
  const fixed = copy();
  fixed.intro.brief = "「秘密の扉」について話す。";
  fixed.intro.hintChips = [];
  fixed.intro.secrets = [{ id:"secret_door", entity:"扉", aliases:["秘密の扉"], trigger:"", text:"" }];
  assert.equal(inspect(fixed).structure.some(({ message }) => message === "導入文の「秘密の扉」に反応するものが無い"), false);
}
console.log("ok 6 - aliasesで本文の語への警告が消える");

{
  const broken = copy();
  broken.intro.exits[0].addItems.push("使い道なし");
  const messages = inspect(broken).structure.map(({ message }) => message);
  assert.ok(messages.some(message => message === "「使い道なし」は入手できるが、使う手段が無い"));
  // 開始時の持ち物は、持ち主ごとの入れ物。持ち主の名前を持ち物として数えない
  for (const owner of ["player", "member_2"]) assert.equal(messages.some(message => message.includes(`「${owner}」`)), false);
  assert.ok(messages.some(message => message.includes("「ロープ」")), "開始時の持ち物そのものは見ている");
  // 終端の出口で渡して消えるものは、使い道がある(誤検出を出さない)
  assert.equal(messages.some(message => message.includes("「心石の欠片」")), false);
  // 終端の出口でもらう報酬は、この章では使えなくて当然
  assert.equal(messages.some(message => message.includes("「30ゴールド」")), false);
}
console.log("ok 7 - 使い道の無いアイテムを警告する");

{
  const broken = copy();
  broken.scenes[0].secrets.push({ id:"spelling_1", entity:"木札", aliases:[], trigger:"", text:"" });
  broken.scenes[0].secrets.push({ id:"same_scene", entity:"鉄の札", aliases:[], trigger:"", text:"" });
  broken.scenes[1].secrets.push({ id:"spelling_2", entity:"木の札", aliases:[], trigger:"", text:"" });
  const messages = inspect(broken).structure.map(({ message }) => message);
  assert.ok(messages.some(message => message.includes("「木札」") && message.includes("「木の札」") && message.includes("同じものですか")));
  assert.equal(messages.some(message => message.includes("「鉄の札」") && message.includes("同じものですか")), false);
}
console.log("ok 8 - 場面をまたぐ綴りの揺れだけを警告する");

{
  const result = inspect(copy());
  assert.ok(result.play.outcomes.length > 0);
  assert.ok(result.play.outcomes.some(({ label }) => label.includes("木柵を調べ、安全な通路を探す")));
  assert.ok(result.play.outcomes.every(({ label }) => !/choice_\d+/.test(label)));
}
console.log("ok 9 - 自動プレイの分岐を人間向けの言葉で集計する");

{
  const result = inspect(copy());
  assert.equal(result.structure.filter(({ level }) => level === "error").length, 0);
  for (const name of ["回復薬"]) {
    assert.ok(result.structure.some(({ message }) => message.includes(`「${name}」は入手できるが`)), name);
  }
  assert.ok(result.structure.filter(({ message }) => message.includes("入手できるが") || message.includes("反応するものが無い") || message.includes("同じものですか")).every(({ level }) => level === "warn"));
}
console.log("ok 10 - 追加の検査項目はerrorを増やさない");

{
  const expanded = copy();
  expanded.scenes.push({ id:99, name:"", brief:"", blockedText:"", secrets:[], exits:[{ to:"ending" }], encounters:[] });
  const result = inspect(expanded);
  assert.ok(result.structure.some(({ level, message }) => level === "warn" && message === "どこからも来られない場面がある"));
}
console.log("ok 11 - どこからも来られない場面をwarnで検出する");

{
  const expanded = copy();
  expanded.scenes.push({ id:99, name:"", brief:"", blockedText:"", secrets:[], exits:[{ to:"ending" }], encounters:[] });
  expanded.intro.exits.push({ to:99 });
  assert.equal(inspect(expanded).structure.some(({ message }) => message === "どこからも来られない場面がある"), false);
}
console.log("ok 12 - 場面への出口を追加すると到達不能警告が消える");

{
  const expanded = copy();
  expanded.scenes.push({ id:99, name:"", brief:"", blockedText:"", secrets:[], exits:[{ to:"ending" }], encounters:[] });
  const result = inspect(expanded);
  assert.equal(result.structure.filter(({ level }) => level === "error").length, 0);
  assert.ok(result.structure.some(({ message }) => message === "どこからも来られない場面がある"));
}
console.log("ok 13 - 到達不能場面の検査はerrorを増やさない");

{
  const broken = copy();
  broken.scenes[0].secrets[0].requires = { secretsAny:["missing_secret"] };
  const issue = inspect(broken).structure.find(({ message }) => message === "必要な発見が存在しない");
  assert.equal(issue.level, "error");
  assert.equal(issue.where, "シーン1");
}
console.log("ok 14 - 秘密の前提に存在しない発見があるとerrorになる");

{
  const result = inspect(copy());
  assert.ok(result.play.reveals.s2a >= 1);
  assert.equal(typeof result.play.reveals.s2a, "number");
}
console.log("ok 15 - 自動プレイの開示回数を集計する");

{
  const broken = copy();
  broken.scenes[0].exits[0].match[0] = "奥へ進む";
  const issue = inspect(broken).structure.find(({ message }) => message === "選択肢の文言が「奥へ進むへ進む」になる");
  assert.equal(issue.level, "warn");
  assert.equal(issue.where, "シーン1");
}
console.log("ok 16 - 重なる行き先文言をwarnで検出する");

{
  const fixed = copy();
  fixed.scenes[0].exits[0].match[0] = "奥へ進む";
  fixed.scenes[0].authoring ||= {};
  fixed.scenes[0].authoring.actionCandidateLabels ||= {};
  fixed.scenes[0].authoring.actionCandidateLabels[`exit:${fixed.scenes[0].exits[0].id}`] = "奥へ進む";
  assert.equal(inspect(fixed).structure.some(({ message }) => message === "選択肢の文言が「奥へ進むへ進む」になる"), false);
}
console.log("ok 17 - 行き先文言を上書きすると警告が消える");

{
  const broken = copy();
  broken.scenes[0].exits[0].match[0] = "奥へ進む";
  const result = inspect(broken);
  assert.equal(result.structure.filter(({ level }) => level === "error").length, 0);
}
console.log("ok 18 - 行き先文言の検査はerrorを増やさない");
