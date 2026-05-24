#!/usr/bin/env node
/**
 * 测试 phase-detector.js 阶段检测逻辑
 *
 * 通过环境变量模拟 Claude Code hook 调用
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createFixture, cleanAllFixtures, assert } = require("./helpers");

const DETECTOR = path.join(__dirname, "..", "scripts", "phase-detector.js");

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

function detectPhase(projectDir) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  const output = execSync(
    `node -e "const d=require('${DETECTOR.replace(/'/g, "\\'")}');console.log(JSON.stringify(d.detectPhase('${projectDir.replace(/'/g, "\\'")}')))"`,
    { encoding: "utf-8", env, timeout: 5000 }
  );
  return JSON.parse(output.trim());
}

// 基础 pipeline 配置
const BASE_PIPELINE = {
  phases: {
    "1": { name: "需求澄清" },
    "2": { name: "任务规划" },
    "3": { name: "编码执行" },
    "4": { name: "质量门禁" },
    "5": { name: "提交归档" },
  },
};

console.log("\n=== 测试 phase-detector.js ===\n");

// --- state-file 策略 ---

test("state-file: phase=1 应返回阶段1", () => {
  const dir = createFixture("det-sf-p1", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1, pipeline: BASE_PIPELINE,
      detection: { strategy: "state-file" },
    }),
    ".claude/phase-state.json": JSON.stringify({ phase: 1, reason: "初始状态" }),
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "应该是阶段1");
});

test("state-file: phase=4 应返回阶段4", () => {
  const dir = createFixture("det-sf-p4", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1, pipeline: BASE_PIPELINE,
      detection: { strategy: "state-file" },
    }),
    ".claude/phase-state.json": JSON.stringify({ phase: 4, reason: "QA" }),
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 4, "应该是阶段4");
});

test("state-file: qa_failed=true 应正确返回", () => {
  const dir = createFixture("det-sf-qa-fail", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1, pipeline: BASE_PIPELINE,
      detection: { strategy: "state-file" },
    }),
    ".claude/phase-state.json": JSON.stringify({ phase: 4, reason: "QA失败", qa_failed: true }),
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 4, "应该是阶段4");
  assert.equal(result.qaFailed, true, "qaFailed 应该为 true");
});

test("state-file: 状态文件不存在应返回阶段1", () => {
  const dir = createFixture("det-sf-no-state", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1, pipeline: BASE_PIPELINE,
      detection: { strategy: "state-file" },
    }),
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "无状态文件应该返回阶段1");
});

// --- filesystem 策略 ---

const FS_CONFIG = {
  version: 1,
  pipeline: BASE_PIPELINE,
  detection: {
    strategy: "filesystem",
    filesystem: {
      state_dir: "openspec/changes",
      archive_dir_name: "archive",
      rules: [
        { condition: "no_active_change", phase: 1, reason: "无活跃change" },
        { condition: "file_missing", path: "{change_dir}/proposal.md", phase: 1, reason: "proposal不存在" },
        { condition: "file_not_contains", path: "{change_dir}/proposal.md", marker: "STATUS: APPROVED", phase: 1, reason: "proposal未批准" },
        // 精确匹配规则（all_of）必须放在宽泛规则之前，避免 file_not_contains 误命中
        { condition: "all_of", checks: [
          { condition: "file_contains", path: "{change_dir}/tasks.md", marker: "STATUS: DONE" },
          { condition: "file_missing", path: "{change_dir}/qa_report.md" },
        ], phase: 4, reason: "质量门禁" },
        { condition: "all_of", checks: [
          { condition: "file_contains", path: "{change_dir}/tasks.md", marker: "STATUS: DONE" },
          { condition: "file_contains", path: "{change_dir}/qa_report.md", marker: "RESULT: PASS" },
        ], phase: 5, reason: "QA通过" },
        { condition: "all_of", checks: [
          { condition: "file_contains", path: "{change_dir}/tasks.md", marker: "STATUS: DONE" },
          { condition: "file_contains", path: "{change_dir}/qa_report.md", marker: "RESULT: FAIL" },
        ], phase: 4, reason: "QA未通过", qa_failed: true },
        // 宽泛规则放在精确规则之后
        { condition: "file_missing", path: "{change_dir}/tasks.md", phase: 2, reason: "tasks不存在" },
        { condition: "file_not_contains", path: "{change_dir}/tasks.md", marker: "STATUS: IN_PROGRESS", phase: 2, reason: "tasks未开始" },
        { condition: "file_not_contains", path: "{change_dir}/tasks.md", marker: "STATUS: DONE", phase: 3, reason: "编码执行中" },
      ],
    },
  },
};

test("filesystem: 无 change 目录应返回阶段1", () => {
  const dir = createFixture("det-fs-no-change", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "无change目录应该是阶段1");
});

test("filesystem: proposal 未批准应返回阶段1", () => {
  const dir = createFixture("det-fs-proposal-draft", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
    "openspec/changes/feat-001/proposal.md": "# Proposal\nSTATUS: DRAFT",
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "proposal未批准应该是阶段1");
  assert.equal(result.change, "feat-001", "change应该是feat-001");
});

test("filesystem: proposal 已批准、无 tasks 应返回阶段2", () => {
  const dir = createFixture("det-fs-approved", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
    "openspec/changes/feat-002/proposal.md": "# Proposal\nSTATUS: APPROVED",
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 2, "proposal已批准无tasks应该是阶段2");
});

test("filesystem: tasks 进行中应返回阶段3", () => {
  const dir = createFixture("det-fs-coding", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
    "openspec/changes/feat-003/proposal.md": "STATUS: APPROVED",
    "openspec/changes/feat-003/tasks.md": "STATUS: IN_PROGRESS",
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 3, "编码执行中应该是阶段3");
});

test("filesystem: tasks 完成、无 QA 报告应返回阶段4", () => {
  const dir = createFixture("det-fs-qa-gate", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
    "openspec/changes/feat-004/proposal.md": "STATUS: APPROVED",
    "openspec/changes/feat-004/tasks.md": "STATUS: DONE",
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 4, "质量门禁应该是阶段4");
});

test("filesystem: QA PASS 应返回阶段5", () => {
  const dir = createFixture("det-fs-qa-pass", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
    "openspec/changes/feat-005/proposal.md": "STATUS: APPROVED",
    "openspec/changes/feat-005/tasks.md": "STATUS: DONE",
    "openspec/changes/feat-005/qa_report.md": "RESULT: PASS",
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 5, "QA通过应该是阶段5");
});

test("filesystem: QA FAIL 应返回阶段4 且 qaFailed=true", () => {
  const dir = createFixture("det-fs-qa-fail", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
    "openspec/changes/feat-006/proposal.md": "STATUS: APPROVED",
    "openspec/changes/feat-006/tasks.md": "STATUS: DONE",
    "openspec/changes/feat-006/qa_report.md": "RESULT: FAIL",
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 4, "QA失败应该是阶段4");
  assert.equal(result.qaFailed, true, "qaFailed 应该为 true");
});

test("filesystem: 应跳过 archive 和隐藏目录", () => {
  const dir = createFixture("det-fs-archive-skip", {
    ".claude/phase-config.json": JSON.stringify(FS_CONFIG),
    "openspec/changes/archive/old-proposal.md": "STATUS: APPROVED",
    "openspec/changes/.hidden/secret.md": "test",
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "archive和隐藏目录应该被跳过");
});

// --- 无配置 fallback ---

test("无 phase-config.json 应 fallback 到阶段1", () => {
  const dir = createFixture("det-no-config");
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "无配置应该 fallback 到阶段1");
});

// --- writePhaseState ---

test("writePhaseState 应正确写入状态文件", () => {
  const dir = createFixture("det-write-state", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1, pipeline: BASE_PIPELINE,
      detection: { strategy: "state-file" },
    }),
  });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  execSync(
    `node -e "const d=require('${DETECTOR.replace(/'/g, "\\'")}');d.writePhaseState('${dir.replace(/'/g, "\\'")}',{phase:3,reason:'编码执行中'})"`,
    { encoding: "utf-8", env, timeout: 5000 }
  );
  const statePath = path.join(dir, ".claude/phase-state.json");
  assert.ok(fs.existsSync(statePath), "状态文件应该已创建");
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  assert.equal(state.phase, 3, "写入的 phase 应该为 3");
  assert.equal(state.reason, "编码执行中", "写入的 reason 应该正确");
});

// --- phase 范围校验 ---

test("state-file: phase=99 超出范围应 fallback 到阶段1", () => {
  const dir = createFixture("det-sf-invalid-phase", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1, pipeline: BASE_PIPELINE,
      detection: { strategy: "state-file" },
    }),
    ".claude/phase-state.json": JSON.stringify({ phase: 99, reason: "非法值" }),
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "非法 phase 应该 fallback 到阶段1");
});

test("state-file: phase=-1 应 fallback 到阶段1", () => {
  const dir = createFixture("det-sf-neg-phase", {
    ".claude/phase-config.json": JSON.stringify({
      version: 1, pipeline: BASE_PIPELINE,
      detection: { strategy: "state-file" },
    }),
    ".claude/phase-state.json": JSON.stringify({ phase: -1, reason: "负数" }),
  });
  const result = detectPhase(dir);
  assert.equal(result.phase, 1, "负数 phase 应该 fallback 到阶段1");
});

cleanAllFixtures();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
