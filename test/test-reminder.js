#!/usr/bin/env node
/**
 * 测试 phase-reminder.js 阶段提醒注入
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createFixture, cleanAllFixtures, assert } = require("./helpers");

const SCRIPTS_DIR = path.join(__dirname, "..", "scripts");

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

function runReminder(projectDir) {
  const pluginRoot = path.join(__dirname, "..");
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_ROOT: pluginRoot };
  const output = execSync(`node "${path.join(SCRIPTS_DIR, "phase-reminder.js")}"`, {
    encoding: "utf-8",
    env,
    timeout: 5000,
  });
  return JSON.parse(output.trim());
}

function makeStateConfig(phase, overrides = {}) {
  return {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: {
        phases: {
          "1": { name: "需求", superpowers: false },
          "2": { name: "规划", superpowers: false },
          "3": { name: "编码", superpowers: true },
          "4": { name: "QA", superpowers: true },
          "5": { name: "归档", superpowers: true },
        },
      },
      detection: { strategy: "state-file" },
      source_patterns: ["src/"],
      guard: {
        rules: [
          { phases: [1, 2], tools: ["Edit", "Write"], source_only: true, reason: "阶段1-2禁止编辑源码" },
        ],
        skill_rules: [
          { phases: [1, 2], skill_patterns: ["opsx:apply"], reason: "阶段1-2禁用 opsx:apply" },
        ],
      },
      ...overrides,
    }),
    ".claude/phase-state.json": JSON.stringify({ phase }),
  };
}

console.log("\n=== 测试 phase-reminder.js ===\n");

test("应输出 additionalContext 格式", () => {
  const dir = createFixture("reminder-format", makeStateConfig(1));
  const result = runReminder(dir);
  assert.ok(result.additionalContext, "应该有 additionalContext 字段");
});

test("阶段3提醒应包含阶段信息", () => {
  const dir = createFixture("reminder-p3", makeStateConfig(3));
  const result = runReminder(dir);
  assert.ok(result.additionalContext.includes("编码"), "应该包含阶段名称'编码'");
  assert.ok(result.additionalContext.includes("阶段3"), "应该包含阶段编号");
});

test("阶段1应包含禁止操作", () => {
  const dir = createFixture("reminder-p1-forbid", makeStateConfig(1));
  const result = runReminder(dir);
  assert.ok(result.additionalContext.includes("禁止"), "阶段1应该有禁止操作");
  assert.ok(result.additionalContext.includes("编辑源码"), "应该提到禁止编辑源码");
});

test("阶段1 superpowers 应显示禁用", () => {
  const dir = createFixture("reminder-sp-off", makeStateConfig(1));
  const result = runReminder(dir);
  assert.ok(result.additionalContext.includes("Superpowers"), "应该提到 Superpowers");
  assert.ok(result.additionalContext.includes("禁用"), "阶段1 Superpowers 应该禁用");
});

test("阶段3 superpowers 应显示启用", () => {
  const dir = createFixture("reminder-sp-on", makeStateConfig(3));
  const result = runReminder(dir);
  assert.ok(result.additionalContext.includes("Superpowers"), "应该提到 Superpowers");
  assert.ok(result.additionalContext.includes("启用"), "阶段3 Superpowers 应该启用");
});

test("QA失败时应包含QA失败提示", () => {
  const config = makeStateConfig(4);
  config[".claude/phase-state.json"] = JSON.stringify({ phase: 4, qa_failed: true });
  const dir = createFixture("reminder-qa-fail", config);
  const result = runReminder(dir);
  assert.ok(result.additionalContext.includes("QA") || result.additionalContext.includes("qa"), "应该提到QA状态");
});

test("无 phase-config.json 应输出有效JSON不崩溃", () => {
  const dir = createFixture("reminder-no-config");
  const result = runReminder(dir);
  assert.ok(result.additionalContext, "无配置时也应该有 additionalContext");
});

cleanAllFixtures();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
