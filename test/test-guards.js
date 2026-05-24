#!/usr/bin/env node
/**
 * 测试 phase-guard.js 守卫逻辑
 *
 * 通过环境变量模拟 Claude Code hook 调用
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

function runGuard(projectDir, toolName, toolInput) {
  const pluginRoot = path.join(__dirname, "..");
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    TOOL_NAME: toolName,
    TOOL_INPUT: typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput),
  };
  try {
    const output = execSync(`node "${path.join(SCRIPTS_DIR, "phase-guard.js")}"`, {
      encoding: "utf-8",
      env,
      timeout: 5000,
    });
    return { output: output.trim() || "{}", exitCode: 0 };
  } catch (e) {
    return {
      output: e.stdout ? e.stdout.trim() : "",
      stderr: e.stderr ? e.stderr.trim() : "",
      exitCode: e.status || 1,
    };
  }
}

// 基础配置模板
function makeConfig(overrides = {}) {
  return JSON.stringify({
    version: 1,
    pipeline: {
      phases: {
        "1": { name: "需求" }, "2": { name: "规划" },
        "3": { name: "编码" }, "4": { name: "QA" }, "5": { name: "归档" },
      },
    },
    detection: { strategy: "state-file" },
    source_patterns: ["src/"],
    guard: {
      rules: [
        { phases: [1, 2], tools: ["Edit", "Write"], source_only: true, reason: "阶段1-2禁止编辑源码" },
        { phases: [4], tools: ["Bash"], command_pattern: "git\\s+commit", when_qa_failed: true, reason: "QA未通过禁止提交" },
      ],
      skill_rules: [
        { phases: [1, 2], skill_patterns: ["opsx:apply"], reason: "阶段1-2禁用 opsx:apply" },
      ],
      dangerous_commands: {
        enabled: true,
        patterns: [
          { pattern: "rm\\s+-rf\\s+[/~]", reason: "禁止删除根目录" },
          { pattern: "git\\s+push\\s+--force\\s+origin\\s+(main|master)", reason: "禁止强推主分支" },
        ],
      },
    },
    ...overrides,
  });
}

function makeStateConfig(phase, overrides = {}) {
  return {
    ".claude/phase-config.json": makeConfig(overrides),
    ".claude/phase-state.json": JSON.stringify({ phase }),
  };
}

console.log("\n=== 测试 phase-guard.js ===\n");

// --- 危险命令拦截 ---

test("危险命令 rm -rf / 应被拦截 (exit 1)", () => {
  const dir = createFixture("guard-danger", makeStateConfig(3));
  const result = runGuard(dir, "Bash", { command: "rm -rf /" });
  assert.equal(result.exitCode, 1, "危险命令应该 exit 1");
});

test("强推主分支应被拦截", () => {
  const dir = createFixture("guard-force-push", makeStateConfig(5));
  const result = runGuard(dir, "Bash", { command: "git push --force origin main" });
  assert.equal(result.exitCode, 1, "强推主分支应该 exit 1");
});

// --- allow 路径 ---

test("阶段3 编辑源码应被允许", () => {
  const dir = createFixture("guard-allow-edit", makeStateConfig(3));
  const result = runGuard(dir, "Edit", { file_path: "/project/src/main.js" });
  assert.equal(result.exitCode, 0, "阶段3编辑源码应该被允许");
  const parsed = JSON.parse(result.output);
  assert.ok(!parsed.permissionDecision, "不应该有 deny 决策");
});

test("阶段5 git commit 应被允许", () => {
  const dir = createFixture("guard-allow-commit", makeStateConfig(5));
  const result = runGuard(dir, "Bash", { command: "git commit -m 'test'" });
  assert.equal(result.exitCode, 0, "阶段5 git commit 应该被允许");
});

test("阶段3 执行安全命令应被允许", () => {
  const dir = createFixture("guard-allow-safe", makeStateConfig(3));
  const result = runGuard(dir, "Bash", { command: "npm run test" });
  assert.equal(result.exitCode, 0, "安全命令应该被允许");
});

// --- 阶段守卫 deny ---

test("阶段1 编辑源码文件应被拒绝", () => {
  const dir = createFixture("guard-deny-edit-p1", makeStateConfig(1));
  const result = runGuard(dir, "Edit", { file_path: "/project/src/main.js" });
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.permissionDecision, "deny", "阶段1编辑源码应该被拒绝");
});

test("阶段2 编辑源码文件应被拒绝", () => {
  const dir = createFixture("guard-deny-edit-p2", makeStateConfig(2));
  const result = runGuard(dir, "Write", { file_path: "/project/src/app.js" });
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.permissionDecision, "deny", "阶段2写入源码应该被拒绝");
});

// --- source_patterns 边界 ---

test("阶段1 编辑非源码文件应被允许（source_only 规则不匹配）", () => {
  const dir = createFixture("guard-allow-nonsrc", makeStateConfig(1));
  const result = runGuard(dir, "Edit", { file_path: "/project/README.md" });
  assert.equal(result.exitCode, 0, "非源码文件在阶段1应该被允许");
});

test("source_patterns 为空时所有文件都不是源码（不拦截任何编辑）", () => {
  const config = makeStateConfig(1);
  config[".claude/phase-config.json"] = makeConfig({ source_patterns: [] });
  const dir = createFixture("guard-empty-patterns", config);
  const result = runGuard(dir, "Edit", { file_path: "/project/src/main.js" });
  assert.equal(result.exitCode, 0, "source_patterns 为空时不应拦截任何编辑");
});

test("编辑 .claude/ 下文件应被允许（即使阶段1）", () => {
  const dir = createFixture("guard-allow-claude-dir", makeStateConfig(1));
  const result = runGuard(dir, "Edit", { file_path: "/project/.claude/settings.json" });
  assert.equal(result.exitCode, 0, ".claude/ 文件在阶段1应该被允许");
});

// --- QA 失败场景 ---

test("QA 失败时 git commit 应被拒绝", () => {
  const config = makeStateConfig(4);
  config[".claude/phase-state.json"] = JSON.stringify({ phase: 4, qa_failed: true });
  const dir = createFixture("guard-qa-fail-commit", config);
  const result = runGuard(dir, "Bash", { command: "git commit -m 'test'" });
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.permissionDecision, "deny", "QA失败时git commit应该被拒绝");
});

test("QA 通过时 git commit 应被允许", () => {
  const config = makeStateConfig(4);
  config[".claude/phase-state.json"] = JSON.stringify({ phase: 4, qa_failed: false });
  const dir = createFixture("guard-qa-pass-commit", config);
  const result = runGuard(dir, "Bash", { command: "git commit -m 'test'" });
  assert.equal(result.exitCode, 0, "QA通过时git commit应该被允许");
});

cleanAllFixtures();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
