#!/usr/bin/env node
/**
 * 测试辅助工具
 *
 * 创建/清理临时项目目录，用于集成测试
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * 创建一个临时项目目录
 */
function createFixture(name, files = {}) {
  const dir = path.join(FIXTURES_DIR, name);
  fs.mkdirSync(dir, { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return dir;
}

/**
 * 清理临时项目目录
 */
function cleanFixture(name) {
  const dir = path.join(FIXTURES_DIR, name);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 清理所有临时项目目录
 */
function cleanAllFixtures() {
  if (fs.existsSync(FIXTURES_DIR)) {
    const entries = fs.readdirSync(FIXTURES_DIR);
    for (const entry of entries) {
      fs.rmSync(path.join(FIXTURES_DIR, entry), { recursive: true, force: true });
    }
  }
}

/**
 * 断言工具
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

assert.equal = function (actual, expected, message = "") {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed${message ? ": " + message : ""}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
};

assert.ok = function (condition, message = "") {
  if (!condition) {
    throw new Error(`Assertion failed${message ? ": " + message : ""}`);
  }
};

module.exports = { createFixture, cleanFixture, cleanAllFixtures, assert, FIXTURES_DIR };
