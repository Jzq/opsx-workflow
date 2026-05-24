#!/usr/bin/env node
/**
 * 测试 startup-check.js 启动检查
 */

const { execSync } = require("child_process");
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

function runStartupCheck(projectDir) {
  const pluginRoot = path.join(__dirname, "..");
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_ROOT: pluginRoot };
  const output = execSync(`node "${path.join(SCRIPTS_DIR, "startup-check.js")}"`, {
    encoding: "utf-8",
    env,
    timeout: 10000,
  });
  return JSON.parse(output.trim());
}

console.log("\n=== 测试 startup-check.js ===\n");

test("应输出 additionalContext 格式", () => {
  const dir = createFixture("startup-format", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "需求" } } },
      detection: { strategy: "state-file" },
      environment: { checks: [] },
    }),
  });
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext, "应该有 additionalContext 字段");
});

test("phase-config.json 存在时检查应 OK", () => {
  const dir = createFixture("startup-config-ok", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "需求" } } },
      detection: { strategy: "state-file" },
      environment: { checks: [] },
    }),
  });
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext.includes("OK"), "应该有 OK 状态");
  assert.ok(result.additionalContext.includes("phase-config.json"), "应该提到 phase-config.json");
});

test("command 类型检查应对存在的命令返回 OK", () => {
  const dir = createFixture("startup-cmd-ok", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "需求" } } },
      detection: { strategy: "state-file" },
      environment: {
        checks: [
          { type: "command", name: "Node.js", command: "node --version", required: true },
        ],
      },
    }),
  });
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext.includes("OK"), "node --version 应该 OK");
});

test("command 类型检查应对不存在的命令返回 FAIL", () => {
  const dir = createFixture("startup-cmd-fail", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "需求" } } },
      detection: { strategy: "state-file" },
      environment: {
        checks: [
          { type: "command", name: "不存在的工具", command: "nonexistent-tool-xyz --version", required: true },
        ],
      },
    }),
  });
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext.includes("FAIL"), "不存在的命令应该 FAIL");
});

test("file_exists 类型检查应正确工作", () => {
  const dir = createFixture("startup-file-exists", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "需求" } } },
      detection: { strategy: "state-file" },
      environment: {
        checks: [
          { type: "file_exists", name: "package.json", path: "package.json", required: false },
        ],
      },
    }),
    "package.json": "{}",
  });
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext.includes("OK"), "存在的文件应该 OK");
});

test("file_missing 类型检查应正确工作", () => {
  const dir = createFixture("startup-file-missing", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "需求" } } },
      detection: { strategy: "state-file" },
      environment: {
        checks: [
          { type: "file_missing", name: ".env不应存在", path: ".env", required: false },
        ],
      },
    }),
  });
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext.includes("OK"), "缺失的文件（file_missing）应该 OK");
});

test("无 phase-config.json 时应正常输出（config FAIL）", () => {
  const dir = createFixture("startup-no-config");
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext, "无配置时也应该有 additionalContext");
  assert.ok(result.additionalContext.includes("FAIL"), "无配置应该 FAIL");
});

test("应包含当前阶段信息", () => {
  const dir = createFixture("startup-phase", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "需求" }, "3": { name: "编码" } } },
      detection: { strategy: "state-file" },
      environment: { checks: [] },
    }),
    ".claude/phase-state.json": JSON.stringify({ phase: 3, reason: "编码中" }),
  });
  const result = runStartupCheck(dir);
  assert.ok(result.additionalContext.includes("阶段3"), "应该包含当前阶段编号");
  assert.ok(result.additionalContext.includes("编码"), "应该包含阶段名称");
});

cleanAllFixtures();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
