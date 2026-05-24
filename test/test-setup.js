#!/usr/bin/env node
/**
 * 测试 validate-setup.js 和 detect-project-phase.js
 *
 * 验证完整搭建流程后脚本是否正确工作
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createFixture, cleanFixture, cleanAllFixtures, assert } = require("./helpers");

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

console.log("\n=== 测试 validate-setup.js ===\n");

test("空项目应报告缺少所有必需文件", () => {
  const dir = createFixture("empty-project");
  const output = execSync(`node "${SCRIPTS_DIR}/validate-setup.js" "${dir}"`, {
    encoding: "utf-8",
  });
  const result = JSON.parse(output);
  assert.ok(!result.valid, "空项目应该 valid=false");
  assert.ok(result.missing.length > 0, "应该有缺失文件");
});

test("完整项目应通过验证", () => {
  const dir = createFixture("full-project", {
    ".claude/phase-config.json": JSON.stringify({ version: 1, pipeline: { phases: {} }, detection: { strategy: "state-file" } }),
    "CLAUDE.md": "# test",
    ".claude/karpathy.md": "# test",
    ".claude/settings.local.json": JSON.stringify({ permissions: {} }),
    ".claude/standards/test.md": "# test",
  });
  const output = execSync(`node "${SCRIPTS_DIR}/validate-setup.js" "${dir}"`, {
    encoding: "utf-8",
  });
  const result = JSON.parse(output);
  assert.ok(result.valid, `完整项目应该 valid=true, missing: ${JSON.stringify(result.missing)}`);
  assert.equal(result.missing.length, 0, "不应该有缺失文件");
});

console.log("\n=== 测试 detect-project-phase.js ===\n");

test("无配置项目应返回阶段1", () => {
  const dir = createFixture("no-config-project");
  const output = execSync(`node "${SCRIPTS_DIR}/detect-project-phase.js" "${dir}"`, {
    encoding: "utf-8",
  });
  const result = JSON.parse(output);
  assert.equal(result.phase, 1, "无配置项目应该是阶段1");
});

test("state-file 策略，phase=3 应返回阶段3", () => {
  const DETECTOR_SRC = path.join(__dirname, "..", "scripts", "phase-detector.js");
  const dir = createFixture("state-file-phase3", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1,
      pipeline: { phases: { "1": { name: "a" }, "2": { name: "b" }, "3": { name: "c" } } },
      detection: { strategy: "state-file" },
    }),
    ".claude/phase-state.json": JSON.stringify({ phase: 3, reason: "编码执行中" }),
    ".claude/hooks/lib/phase-detector.js": fs.readFileSync(DETECTOR_SRC, "utf-8"),
  });
  const output = execSync(`node "${SCRIPTS_DIR}/detect-project-phase.js" "${dir}"`, {
    encoding: "utf-8",
  });
  const result = JSON.parse(output);
  assert.equal(result.phase, 3, "state-file phase=3 应该返回阶段3");
  assert.equal(result.strategy, "state-file", "策略应该是 state-file");
});

// 清理
cleanAllFixtures();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
