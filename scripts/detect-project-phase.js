#!/usr/bin/env node
/**
 * 检测目标项目的当前工作流阶段（插件模式）
 *
 * 用法: node detect-project-phase.js <目标项目路径>
 *
 * 优先使用插件自带的 phase-detector.js（通过 CLAUDE_PLUGIN_ROOT），
 * 回退到目标项目 .claude/hooks/lib/ 下的旧版。
 *
 * 输出 JSON: { phase, change, changeDir, reason, qaFailed, strategy }
 */

const path = require("path");
const fs = require("fs");

const projectDir = path.resolve(process.argv[2] || ".");

// 优先使用插件自带的 phase-detector
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
let detectorPath;

if (pluginRoot) {
  detectorPath = path.join(pluginRoot, "scripts/phase-detector.js");
  if (!fs.existsSync(detectorPath)) {
    detectorPath = null;
  }
}

// 回退到目标项目本地安装的 phase-detector
if (!detectorPath) {
  const localPath = path.resolve(path.join(projectDir, ".claude/hooks/lib/phase-detector.js"));
  if (localPath.startsWith(projectDir + path.sep) && fs.existsSync(localPath)) {
    detectorPath = localPath;
  }
}

if (!detectorPath) {
  process.stdout.write(
    JSON.stringify({
      phase: 1,
      change: null,
      changeDir: null,
      reason: "phase-detector.js 未找到",
      qaFailed: false,
      strategy: "unknown",
    }, null, 2) + "\n"
  );
  process.exit(0);
}

try {
  const { detectPhase, loadConfig } = require(detectorPath);
  const result = detectPhase(projectDir);

  const config = loadConfig(projectDir);
  result.strategy = (config && config.detection && config.detection.strategy) || "legacy";

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (e) {
  process.stdout.write(
    JSON.stringify({
      phase: 1,
      change: null,
      changeDir: null,
      reason: `阶段检测执行失败: ${e.message}`,
      qaFailed: false,
      strategy: "error",
    }, null, 2) + "\n"
  );
}
