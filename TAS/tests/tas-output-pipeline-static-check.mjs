#!/usr/bin/env node
/*
 * TAS 出力パイプラインの静的ガード。
 * 旧チェーンは互換性比較用に残っていますが、HTML末尾の統合層が
 * 実運用の mockCampaignPayload を確定していることを確認します。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(tasDir, "index.html");
const source = fs.readFileSync(indexPath, "utf8");
const unifiedMarker = "function mockCampaignPayloadUnified()";
const finalAssignment = "mockCampaignPayload=mockCampaignPayloadUnified;";
const unifiedIndex = source.lastIndexOf(unifiedMarker);
const assignmentIndex = source.lastIndexOf(finalAssignment);

assert.ok(unifiedIndex >= 0, "統合出力関数が見つかりません");
assert.ok(assignmentIndex > unifiedIndex, "統合出力関数が実運用へ昇格されていません");
assert.equal((source.match(/function mockCampaignPayloadUnified\(\)/g) || []).length, 1, "統合出力関数が重複しています");
assert.equal((source.match(/mockCampaignPayload=function/g) || []).length, 0, "旧mockCampaignPayload代入ラッパーが残っています");
assert.equal((source.match(/baseMockCampaignPayload/g) || []).length, 0, "旧mockCampaignPayload基底参照が残っています");
assert.ok(source.includes("unified:()=>cloneOutputValue(mockCampaignPayloadUnified())"), "統合チェーンの比較入口がありません");
assert.ok(source.includes("active:()=>cloneOutputValue(mockCampaignPayload())"), "実運用出力の比較入口がありません");

const afterAssignment = source.slice(assignmentIndex + finalAssignment.length);
assert.equal(afterAssignment.includes("mockCampaignPayload="), false, "統合昇格後に別の出力チェーンが再代入されています");

console.log("PASS: TAS output pipeline static guard");
