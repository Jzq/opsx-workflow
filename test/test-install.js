#!/usr/bin/env node
/**
 * 测试 install-dependencies.js
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

console.log("\n=== 测试 install-dependencies.js ===\n");

test("--check-only 模式应返回 JSON 格式检测结果", () => {
  const dir = createFixture("install-check");
  const output = execSync(
    `node "${SCRIPTS_DIR}/install-dependencies.js" "${dir}" --check-only`,
    { encoding: "utf-8", timeout: 15000 }
  );
  const result = JSON.parse(output);
  assert.ok(Array.isArray(result.checks), "应该有 checks 数组");
  assert.ok(result.checks.length > 0, "应该至少有一个检查项");
  assert.equal(result.action, "check-only", "action 应该是 check-only");
});

test("检测结果应包含 Node.js 和 Python", () => {
  const dir = createFixture("install-check-runtime");
  const output = execSync(
    `node "${SCRIPTS_DIR}/install-dependencies.js" "${dir}" --check-only`,
    { encoding: "utf-8", timeout: 15000 }
  );
  const result = JSON.parse(output);
  const names = result.checks.map((c) => c.name);
  assert.ok(names.includes("Node.js"), "应该检测 Node.js");
  assert.ok(names.includes("Python"), "应该检测 Python");
  assert.ok(names.includes("OpenSpec CLI"), "应该检测 OpenSpec CLI");
  assert.ok(names.includes("GStack"), "应该检测 GStack");
  assert.ok(names.includes("Superpowers"), "应该检测 Superpowers");
});

cleanAllFixtures();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
