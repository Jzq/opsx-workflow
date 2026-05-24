#!/usr/bin/env node
/**
 * 阶段检测模块 -- 配置驱动版
 *
 * 从 .claude/phase-config.json 读取 detection 配置，
 * 支持三种策略：filesystem / state-file / custom
 *
 * 导出：detectPhase(projectDir) → { phase, change, changeDir, reason, qaFailed }
 */

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = ".claude/phase-config.json";

// 进程内配置缓存，避免同一 hook 调用中重复读取文件
const _configCache = new Map();

/**
 * 加载配置文件（进程内缓存，同一路径只读一次）
 */
function loadConfig(projectDir) {
  const fullPath = path.join(projectDir, CONFIG_PATH);
  if (_configCache.has(fullPath)) {
    return _configCache.get(fullPath);
  }
  try {
    const config = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    _configCache.set(fullPath, config);
    return config;
  } catch {
    _configCache.set(fullPath, null);
    return null;
  }
}

/**
 * 读取文件末尾若干行
 */
function readTail(filePath, maxLines = 30) {
  try {
    const buf = fs.readFileSync(filePath, "utf-8");
    const lines = buf.split("\n").filter((l) => l.trim() !== "");
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

/**
 * 文件末尾是否包含指定标记
 */
function fileContains(filePath, marker) {
  return readTail(filePath, 30).includes(marker);
}

/**
 * 获取活跃 change 目录（排除归档和隐藏目录）
 */
function getActiveChange(changesDir, archiveDirName) {
  try {
    const entries = fs.readdirSync(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        entry.name !== archiveDirName &&
        !entry.name.startsWith(".")
      ) {
        return entry.name;
      }
    }
  } catch {
    // 目录不存在
  }
  return null;
}

/**
 * 解析路径中的 {change_dir} 占位符
 */
function resolvePath(templatePath, changeDir) {
  return templatePath.replace(/\{change_dir\}/g, changeDir);
}

/**
 * 评估单条检测条件
 * 返回 true/false
 */
function evaluateCondition(check, projectDir, changeDir) {
  let filePath = null;
  if (check.path) {
    const resolved = resolvePath(check.path, changeDir);
    // changeDir 已经是绝对路径时，resolved 也是绝对路径，不需要再拼 projectDir
    filePath = resolved.startsWith("/") ? resolved : path.join(projectDir, resolved);
  }

  switch (check.condition) {
    case "no_active_change":
      return !changeDir;

    case "file_missing":
      return filePath && !fs.existsSync(filePath);

    case "file_exists":
      return filePath && fs.existsSync(filePath);

    case "file_contains":
      return filePath && fs.existsSync(filePath) && fileContains(filePath, check.marker);

    case "file_not_contains":
      return filePath && (!fs.existsSync(filePath) || !fileContains(filePath, check.marker));

    case "all_of":
      return check.checks.every((c) => evaluateCondition(c, projectDir, changeDir));

    case "any_of":
      return check.checks.some((c) => evaluateCondition(c, projectDir, changeDir));

    default:
      return false;
  }
}

/**
 * filesystem 策略检测
 */
function detectFilesystem(config, projectDir) {
  const fsConfig = config.detection.filesystem;
  const changesDir = path.join(projectDir, fsConfig.state_dir);
  const archiveDirName = fsConfig.archive_dir_name || "archive";

  const change = getActiveChange(changesDir, archiveDirName);
  const changeDir = change ? path.join(changesDir, change) : null;

  for (const rule of fsConfig.rules) {
    if (evaluateCondition(rule, projectDir, changeDir)) {
      return {
        phase: rule.phase,
        change: change || null,
        changeDir: changeDir || null,
        reason: rule.reason || "",
        qaFailed: rule.qa_failed || false,
      };
    }
  }

  // 兜底：规则未命中
  return {
    phase: 1,
    change: change || null,
    changeDir: changeDir || null,
    reason: "未匹配任何检测规则",
    qaFailed: false,
  };
}

/**
 * 校验 phase 值是否在 pipeline.phases 定义范围内
 */
function validatePhase(phase, config) {
  if (typeof phase !== "number" || !Number.isInteger(phase) || phase < 1) return 1;
  if (config && config.pipeline && config.pipeline.phases) {
    const validPhases = Object.keys(config.pipeline.phases).map(Number);
    if (!validPhases.includes(phase)) return 1;
  }
  return phase;
}

/**
 * state-file 策略检测
 */
function detectStateFile(config, projectDir) {
  const sfConfig = config.detection.state_file || {};
  const statePath = path.join(projectDir, sfConfig.path || ".claude/phase-state.json");

  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    return {
      phase: validatePhase(state.phase, config),
      change: state.change || null,
      changeDir: state.changeDir || null,
      reason: state.reason || "",
      qaFailed: state.qa_failed || false,
    };
  } catch {
    // 状态文件不存在或格式错误，返回初始状态
    const template = sfConfig.template || {};
    return {
      phase: template.phase || 1,
      change: template.change || null,
      changeDir: null,
      reason: template.reason || "状态文件不存在，默认阶段1",
      qaFailed: false,
    };
  }
}

/**
 * custom 策略检测 -- 调用自定义脚本
 */
function detectCustom(config, projectDir) {
  const scriptPath = path.join(projectDir, config.detection.custom.script);
  try {
    const { execSync } = require("child_process");
    const output = execSync(`node "${scriptPath}"`, {
      cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: "utf-8",
      timeout: 5000,
    });
    return JSON.parse(output.trim());
  } catch (e) {
    return {
      phase: 1,
      change: null,
      changeDir: null,
      reason: `自定义检测脚本执行失败: ${e.message}`,
      qaFailed: false,
    };
  }
}

/**
 * 核心检测入口
 */
function detectPhase(projectDir) {
  const config = loadConfig(projectDir);

  // 无配置文件时，尝试旧版 openspec/changes/ 兼容
  if (!config || !config.detection) {
    return detectLegacy(projectDir);
  }

  const strategy = config.detection.strategy || "state-file";

  switch (strategy) {
    case "filesystem":
      return detectFilesystem(config, projectDir);
    case "state-file":
      return detectStateFile(config, projectDir);
    case "custom":
      return detectCustom(config, projectDir);
    default:
      return {
        phase: 1,
        change: null,
        changeDir: null,
        reason: `未知检测策略: ${strategy}`,
        qaFailed: false,
      };
  }
}

/**
 * 旧版兼容：无 phase-config.json 时尝试直接读取 openspec/changes/
 */
function detectLegacy(projectDir) {
  const changesDir = path.join(projectDir, "openspec/changes");
  const change = getActiveChange(changesDir, "archive");
  if (!change) {
    return { phase: 1, change: null, changeDir: null, reason: "无活跃change(legacy)", qaFailed: false };
  }
  const changeDir = path.join(changesDir, change);
  const proposalPath = path.join(changeDir, "proposal.md");
  if (!fs.existsSync(proposalPath) || !fileContains(proposalPath, "STATUS: APPROVED")) {
    return { phase: 1, change, changeDir, reason: "proposal 未批准(legacy)", qaFailed: false };
  }
  const tasksPath = path.join(changeDir, "tasks.md");
  if (!fs.existsSync(tasksPath)) {
    return { phase: 2, change, changeDir, reason: "tasks.md 不存在(legacy)", qaFailed: false };
  }
  if (fileContains(tasksPath, "STATUS: PENDING_REVIEW")) {
    return { phase: 2, change, changeDir, reason: "tasks 待审核(legacy)", qaFailed: false };
  }
  if (fileContains(tasksPath, "STATUS: IN_PROGRESS")) {
    return { phase: 3, change, changeDir, reason: "编码执行中(legacy)", qaFailed: false };
  }
  if (fileContains(tasksPath, "STATUS: DONE")) {
    const qaPath = path.join(changeDir, "qa_report.md");
    if (!fs.existsSync(qaPath)) {
      return { phase: 4, change, changeDir, reason: "质量门禁(legacy)", qaFailed: false };
    }
    if (fileContains(qaPath, "RESULT: PASS")) {
      return { phase: 5, change, changeDir, reason: "QA通过(legacy)", qaFailed: false };
    }
    return { phase: 4, change, changeDir, reason: "QA未通过(legacy)", qaFailed: true };
  }
  return { phase: 2, change, changeDir, reason: "tasks 状态未明确(legacy)", qaFailed: false };
}

/**
 * 写入状态文件（state-file 策略用）
 */
function writePhaseState(projectDir, phaseInfo) {
  const config = loadConfig(projectDir);
  if (!config || (config.detection.strategy || "state-file") !== "state-file") return false;

  const sfConfig = config.detection.state_file || {};
  const statePath = path.join(projectDir, sfConfig.path || ".claude/phase-state.json");
  const state = {
    phase: phaseInfo.phase,
    reason: phaseInfo.reason,
    change: phaseInfo.change || null,
    changeDir: phaseInfo.changeDir || null,
    qa_failed: phaseInfo.qaFailed || false,
    updated_at: new Date().toISOString(),
  };

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

// CLI 调用
if (require.main === module) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const result = detectPhase(projectDir);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

module.exports = { detectPhase, writePhaseState, loadConfig };
