#!/usr/bin/env node
/*
 * TASの安全な検証・コミット補助。
 *
 * 検証のみ:
 *   node scripts/tas-check-and-commit.mjs
 *
 * 検証が通ったらコミット:
 *   node scripts/tas-check-and-commit.mjs --commit
 *
 * コミット後にpush:
 *   node scripts/tas-check-and-commit.mjs --commit --push
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const shouldCommit = args.has("--commit");
const shouldPush = args.has("--push");
if (shouldPush && !shouldCommit) {
  console.error("ERROR: --pushには--commitも必要です");
  process.exit(2);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(result.stderr || "");
    throw new Error(command + " " + commandArgs.join(" ") + " が失敗しました");
  }
  return options.capture ? result.stdout : "";
}

function checkInlineSyntax() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    new vm.Script(match[1], { filename: "index-inline-" + (index + 1) + ".js" });
  });
  console.log("PASS: inline JavaScript syntax");
}

function checkServerSyntax() {
  run(process.execPath, ["--check", "server.cjs"]);
  console.log("PASS: server JavaScript syntax");
}

const tests = [
  "tests/tas-output-pipeline-static-check.mjs",
  "tests/tas-chain-compatibility-harness.mjs",
  "tests/tas-companion-output-contract.mjs",
  "tests/tas-fresh-campaign-output-contract.mjs",
  "tests/tas-complete-requires-contract.mjs"
];

try {
  checkInlineSyntax();
  checkServerSyntax();
  for (const test of tests) run(process.execPath, [test]);
  run("git", ["diff", "--check"]);
  console.log("PASS: git diff --check");

  if (!shouldCommit) {
    console.log("検証のみで終了しました。コミットする場合は --commit を付けてください。");
    process.exit(0);
  }

  const status = run("git", ["status", "--short"], { capture: true }).trim();
  const allowed = /^(?: M|A |M |\?\?) (?:README\.md|index\.html|tests(?:\/|$)|scripts(?:\/|$))/;
  const unexpected = status.split("\n").filter(Boolean).filter(line => !allowed.test(line));
  if (unexpected.length) {
    throw new Error("対象外の変更があるためコミットを中止しました:\n" + unexpected.join("\n"));
  }

  run("git", ["add", "--", "README.md", "index.html", "tests", "scripts"]);
  const staged = run("git", ["diff", "--cached", "--name-only"], { capture: true }).trim();
  if (!staged) {
    console.log("変更がないためコミットしませんでした。");
    process.exit(0);
  }

  const message = process.env.TAS_COMMIT_MESSAGE || "TAS出力互換性ハーネスと自動検証を追加";
  run("git", ["commit", "-m", message]);
  if (shouldPush) run("git", ["push"]);
  console.log(shouldPush ? "PASS: commit and push" : "PASS: commit");
} catch (error) {
  console.error("ERROR: " + error.message);
  process.exit(1);
}
