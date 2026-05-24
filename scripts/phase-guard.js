#!/usr/bin/env node
/**
 * 阶段操作守卫 -- 配置驱动版（插件模式）
 *
 * 从 .claude/phase-config.json 读取 guard 配置，
 * 按 pipeline phases + guard rules + skill_rules 拦截不合规操作。
 *
 * 危险命令拦截也在此处理（当 guard.dangerous_commands.enabled=true 时）。
 */

const path = require("path");
const { detectPhase, loadConfig } = require("./phase-detector");

/**
 * 从配置获取阶段名称
 */
function getPhaseName(config, phase) {
  const phases = (config && config.pipeline && config.pipeline.phases) || {};
  const info = phases[String(phase)];
  return info ? `阶段${phase}·${info.name}` : `阶段${phase}`;
}

/**
 * 构建源码路径正则数组（锚定匹配，避免误匹配）
 */
function getSourcePatterns(config) {
  const patterns = (config && config.source_patterns) || [];
  return patterns
    .filter((p) => typeof p === "string" && !p.startsWith("_"))
    .map((p) => {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "/" ? "\\/" : "\\" + c));
      return new RegExp(`(^|\\/)${escaped}`);
    });
}

function isSourceCode(filePath, config) {
  if (!filePath) return false;
  if (filePath.includes("/openspec/") || filePath.includes("/.claude/")) return false;
  const patterns = getSourcePatterns(config);
  if (patterns.length === 0) return false;
  return patterns.some((p) => p.test(filePath));
}

function deny(phaseInfo, config, message) {
  const name = getPhaseName(config, phaseInfo.phase);
  const full = `[${name}] ${message}`;
  process.stdout.write(JSON.stringify({ permissionDecision: "deny", message: full }) + "\n");
}

function allow() {
  process.stdout.write("{}\n");
}

function main() {
  const toolName = process.env.TOOL_NAME || "";
  const toolInput = JSON.parse(process.env.TOOL_INPUT || "{}");
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const config = loadConfig(projectDir);
  const phaseInfo = detectPhase(projectDir);
  const { phase, qaFailed } = phaseInfo;
  const guardConfig = (config && config.guard) || {};

  // --- 危险命令拦截（与阶段无关） ---
  if (guardConfig.dangerous_commands && guardConfig.dangerous_commands.enabled) {
    if (toolName === "Bash") {
      const cmd = (toolInput.command || "").trim();
      for (const item of guardConfig.dangerous_commands.patterns) {
        if (!item || typeof item.pattern !== "string") continue;
        try {
          if (new RegExp(item.pattern).test(cmd)) {
            process.stderr.write(`BLOCKED: ${item.reason || "危险命令"}\n命令：${cmd}\n`);
            process.exit(1);
          }
        } catch (e) {
          process.stderr.write(`WARNING: 危险命令正则编译失败，安全保护已跳过: pattern="${item.pattern}" error=${e.message}\n`);
        }
      }
    }
  }

  // --- Skill 操作拦截 ---
  if (toolName === "Skill") {
    const skillName = toolInput.skill || "";

    // 检查 skill_routing（如 GStack 检查）
    if (config && config.skill_routing && config.skill_routing.enabled && config.skill_routing.check_script) {
      const checkScript = config.skill_routing.check_script;
      const resolvedScript = path.resolve(projectDir, checkScript);
      if (!resolvedScript.startsWith(path.resolve(projectDir) + path.sep)) {
        deny(phaseInfo, config, `Skill 路由检查脚本路径不合法: ${checkScript}`);
        return;
      }
      try {
        const { execSync } = require("child_process");
        execSync("bash", [resolvedScript], {
          cwd: projectDir,
          env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, HOME: process.env.HOME },
          encoding: "utf-8",
          timeout: 3000,
        });
      } catch (e) {
        const stdout = (e.stdout || "").trim();
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.permissionDecision === "deny") {
            process.stdout.write(JSON.stringify(parsed) + "\n");
            return;
          }
        } catch {
          // 非JSON输出
        }
        deny(phaseInfo, config, "Skill 路由依赖缺失，请检查安装");
        return;
      }
    }

    // 阶段守卫：skill_rules
    const skillRules = guardConfig.skill_rules || [];
    for (const rule of skillRules) {
      if (!rule.phases || !rule.phases.includes(phase)) continue;

      const patterns = rule.skill_patterns || [];
      const matched = patterns.some((p) => {
        try {
          return new RegExp(p).test(skillName);
        } catch {
          return skillName.includes(p);
        }
      });

      if (matched) {
        deny(phaseInfo, config, rule.reason || "当前阶段不允许此 Skill 操作");
        return;
      }
    }
  }

  // --- 通用工具守卫规则 ---
  const rules = guardConfig.rules || [];
  for (const rule of rules) {
    if (!rule.phases || !rule.phases.includes(phase)) continue;
    if (!rule.tools || !rule.tools.includes(toolName)) continue;

    // source_only: 仅对源码文件拦截
    if (rule.source_only) {
      const filePath = toolInput.file_path || toolInput.path || "";
      if (!isSourceCode(filePath, config)) continue;
    }

    // command_pattern: 仅对匹配的命令拦截
    if (rule.command_pattern && toolName === "Bash") {
      const cmd = (toolInput.command || "").trim();
      try {
        if (!new RegExp(rule.command_pattern).test(cmd)) continue;
      } catch {
        continue;
      }
    }

    // when_qa_failed: 仅在 QA 失败时拦截
    if (rule.when_qa_failed && !qaFailed) continue;

    deny(phaseInfo, config, rule.reason || "当前阶段不允许此操作");
    return;
  }

  allow();
}

main();
