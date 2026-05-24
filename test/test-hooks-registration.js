#!/usr/bin/env node
/**
 * 测试 hooks.json 钩子注册
 *
 * 验证 hooks/hooks.json 存在，3种 hook 类型均已注册，
 * 且命令引用 ${CLAUDE_PLUGIN_ROOT}/scripts/ 路径
 */

const fs = require("fs");
const path = require("path");
const { assert } = require("./helpers");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
  }
}

const PLUGIN_DIR = path.join(__dirname, "..");
const HOOKS_PATH = path.join(PLUGIN_DIR, "hooks", "hooks.json");

console.log("\n=== 测试 hooks.json 钩子注册 ===\n");

test("hooks.json 文件应存在", () => {
  assert.ok(fs.existsSync(HOOKS_PATH), "hooks/hooks.json 应该存在");
});

test("hooks.json 应为合法 JSON", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`hooks.json 不是合法 JSON: ${e.message}`);
  }
  assert.ok(typeof parsed === "object", "hooks.json 解析后应为对象");
});

test("应注册 PreToolUse hook", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(parsed.hooks, "应该有 hooks 字段");
  assert.ok(Array.isArray(parsed.hooks.PreToolUse), "PreToolUse 应为数组");
  assert.ok(parsed.hooks.PreToolUse.length > 0, "PreToolUse 不应为空");
});

test("应注册 UserPromptSubmit hook", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.hooks.UserPromptSubmit), "UserPromptSubmit 应为数组");
  assert.ok(parsed.hooks.UserPromptSubmit.length > 0, "UserPromptSubmit 不应为空");
});

test("应注册 SessionStart hook", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.hooks.SessionStart), "SessionStart 应为数组");
  assert.ok(parsed.hooks.SessionStart.length > 0, "SessionStart 不应为空");
});

const ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

test("PreToolUse 命令应引用 " + ROOT_VAR + "/scripts/phase-guard.js", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  const parsed = JSON.parse(content);
  const hook = parsed.hooks.PreToolUse[0].hooks[0];
  assert.ok(
    hook.command.includes(ROOT_VAR + "/scripts/phase-guard.js"),
    "PreToolUse 命令应引用 " + ROOT_VAR + "/scripts/phase-guard.js, 实际: " + hook.command
  );
});

test("UserPromptSubmit 命令应引用 " + ROOT_VAR + "/scripts/phase-reminder.js", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  const parsed = JSON.parse(content);
  const hook = parsed.hooks.UserPromptSubmit[0].hooks[0];
  assert.ok(
    hook.command.includes(ROOT_VAR + "/scripts/phase-reminder.js"),
    "UserPromptSubmit 命令应引用 " + ROOT_VAR + "/scripts/phase-reminder.js, 实际: " + hook.command
  );
});

test("SessionStart 命令应引用 " + ROOT_VAR + "/scripts/startup-check.js", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  const parsed = JSON.parse(content);
  const hook = parsed.hooks.SessionStart[0].hooks[0];
  assert.ok(
    hook.command.includes(ROOT_VAR + "/scripts/startup-check.js"),
    "SessionStart 命令应引用 " + ROOT_VAR + "/scripts/startup-check.js, 实际: " + hook.command
  );
});

test("所有 hook 命令引用的脚本文件应存在", () => {
  const content = fs.readFileSync(HOOKS_PATH, "utf-8");
  const parsed = JSON.parse(content);
  const allHookTypes = Object.values(parsed.hooks);
  for (const hookType of allHookTypes) {
    for (const entry of hookType) {
      for (const hook of entry.hooks) {
        // 将 ${CLAUDE_PLUGIN_ROOT} 替换为实际路径来验证文件存在
        const scriptPath = hook.command
          .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, PLUGIN_DIR)
          .replace(/^node\s+"?/, "")
          .replace(/"?\s*$/, "");
        assert.ok(
          fs.existsSync(scriptPath),
          `脚本文件应存在: ${scriptPath} (来自命令: ${hook.command})`
        );
      }
    }
  }
});

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
