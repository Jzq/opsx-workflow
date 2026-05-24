#!/usr/bin/env node
/**
 * 测试 plugin.json 插件清单
 *
 * 验证 .claude-plugin/plugin.json 存在且字段合法
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
const MANIFEST_PATH = path.join(PLUGIN_DIR, ".claude-plugin", "plugin.json");

console.log("\n=== 测试 plugin.json 插件清单 ===\n");

test("plugin.json 文件应存在", () => {
  assert.ok(fs.existsSync(MANIFEST_PATH), ".claude-plugin/plugin.json 应该存在");
});

test("plugin.json 应为合法 JSON", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`plugin.json 不是合法 JSON: ${e.message}`);
  }
  assert.ok(typeof parsed === "object", "plugin.json 解析后应为对象");
});

test("plugin.json 应包含 name 字段", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(typeof parsed.name === "string", "name 应为字符串");
  assert.ok(parsed.name.length > 0, "name 不应为空");
});

test("plugin.json 应包含有效的 version 字段", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(typeof parsed.version === "string", "version 应为字符串");
  // 验证 semver 格式 (major.minor.patch)
  const semverRegex = /^\d+\.\d+\.\d+/;
  assert.ok(
    semverRegex.test(parsed.version),
    `version "${parsed.version}" 应符合 semver 格式 (x.y.z)`
  );
});

test("plugin.json 应包含 description 字段", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(typeof parsed.description === "string", "description 应为字符串");
  assert.ok(parsed.description.length > 0, "description 不应为空");
});

test("plugin.json 应包含 displayName 字段", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(typeof parsed.displayName === "string", "displayName 应为字符串");
  assert.ok(parsed.displayName.length > 0, "displayName 不应为空");
});

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
