#!/usr/bin/env node
/**
 * 启动检查 -- 配置驱动版（插件模式）
 *
 * 从 .claude/phase-config.json 读取 environment.checks 配置，
 * 逐项验证 + 阶段检测。
 *
 * 支持检查类型：
 *   - command: 执行命令验证可用性
 *   - file_exists: 检查文件存在
 *   - file_missing: 检查文件不存在（反向检查）
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { detectPhase, loadConfig } = require("./phase-detector");

/**
 * 执行单条环境检查
 */
function runCheck(check, projectDir) {
  try {
    switch (check.type || "command") {
      case "command":
        execSync(check.command, { stdio: "pipe", timeout: 5000 });
        return { name: check.name, ok: true, required: check.required !== false };

      case "file_exists": {
        const filePath = check.path.replace(/^~/, process.env.HOME || "");
        const fullPath = filePath.startsWith("/")
          ? filePath
          : path.join(projectDir, filePath);
        const exists = fs.existsSync(fullPath);
        return { name: check.name, ok: exists, required: check.required !== false };
      }

      case "file_missing": {
        const filePath = check.path.replace(/^~/, process.env.HOME || "");
        const fullPath = filePath.startsWith("/")
          ? filePath
          : path.join(projectDir, filePath);
        const missing = !fs.existsSync(fullPath);
        return { name: check.name, ok: missing, required: check.required !== false };
      }

      default:
        return { name: check.name, ok: false, required: false };
    }
  } catch {
    return { name: check.name, ok: false, required: check.required !== false };
  }
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const config = loadConfig(projectDir);

  const checks = (config && config.environment && config.environment.checks) || [];

  // 始终检查 phase-config.json 是否存在
  const results = [];
  results.push({
    name: "phase-config.json",
    ok: config !== null,
    required: true,
  });

  // 执行配置的检查项
  for (const check of checks) {
    if (typeof check !== "object" || !check) continue;
    if (!check.name) continue;
    results.push(runCheck(check, projectDir));
  }

  // 阶段检测
  const phaseInfo = detectPhase(projectDir);
  const phases = (config && config.pipeline && config.pipeline.phases) || {};
  const phaseConf = phases[String(phaseInfo.phase)] || {};
  const phaseName = phaseConf.name ? `${phaseInfo.phase}·${phaseConf.name}` : String(phaseInfo.phase);

  let context = `# 启动检查结果\n`;
  for (const r of results) {
    const icon = r.ok ? "OK" : "FAIL";
    const req = r.required ? "[必需]" : "[可选]";
    context += `${icon} ${req} ${r.name}\n`;
  }
  context += `\n当前工作流阶段：阶段${phaseName}（${phaseInfo.reason}）\n`;

  if (phaseInfo.change) {
    context += `活跃 Change：${phaseInfo.change}\n`;
  }

  // 必需项缺失警告
  const failed = results.filter((r) => !r.ok && r.required);
  if (failed.length > 0) {
    context += `\n以下必需项缺失，请修复后再继续：\n`;
    failed.forEach((r) => (context += `  ${r.name}\n`));
  }

  // 可选项缺失提示
  const optionalFailed = results.filter((r) => !r.ok && !r.required);
  if (optionalFailed.length > 0) {
    context += `\n以下可选项未就绪（不影响基本流程）：\n`;
    optionalFailed.forEach((r) => (context += `  ${r.name}\n`));
  }

  process.stdout.write(JSON.stringify({ additionalContext: context }) + "\n");
}

main();
