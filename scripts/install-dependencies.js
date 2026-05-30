#!/usr/bin/env node
/**
 * 依赖检测与安装脚本
 *
 * 用法:
 *   node install-dependencies.js <项目路径> [--install] [--check-only]
 *
 * --check-only: 只检测不安装
 * --install:    检测并自动安装缺失项
 *
 * 输出 JSON:
 *   { checks: [...], installed: [...], failed: [...] }
 *
 * 关键设计:
 *   1. 安装后验证用同步重检，不走子进程环境继承
 *   2. openspec init 不在此脚本执行（它会覆盖 .claude/ 目录），
 *      改由 agent 在生成完所有项目文件之后再执行
 *   3. GStack 通过 git clone 自动安装
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const projectDir = process.argv[2] || ".";
const shouldInstall = process.argv.includes("--install");
const checkOnly = process.argv.includes("--check-only");

/**
 * 在 shell 中执行命令（保留 nvm 环境）
 */
function run(cmd, opts = {}) {
  // 包装 nvm 初始化，确保子进程能找到 node/npm
  const nvmInit = process.env.NVM_DIR
    ? `source "${process.env.NVM_DIR}/nvm.sh" 2>/dev/null; `
    : "";
  const fullCmd = `${nvmInit}${cmd}`;
  return execSync(fullCmd, {
    encoding: "utf-8",
    timeout: opts.timeout || 30000,
    cwd: opts.cwd || projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  }).trim();
}

/**
 * 检测单个依赖
 */
function checkDependency(dep) {
  const result = { name: dep.name, installed: false, version: null };

  switch (dep.check_type) {
    case "command": {
      try {
        const output = run(dep.check_command);
        result.installed = true;
        result.version = output.replace(/^v/, "");
      } catch (e) {
        // 命令不存在或返回非零，记录 stderr 便于调试
        result.check_error = (e.stderr || "").slice(0, 200) || e.message;
      }
      break;
    }

    case "file_exists": {
      const filePath = dep.check_path.replace(/^~/, os.homedir());
      const fullPath = filePath.startsWith("/")
        ? filePath
        : path.join(projectDir, filePath);
      result.installed = fs.existsSync(fullPath);
      break;
    }

    case "dir_exists": {
      const dirPath = dep.check_path.replace(/^~/, os.homedir());
      const fullPath = dirPath.startsWith("/")
        ? dirPath
        : path.join(projectDir, dirPath);
      result.installed =
        fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
      break;
    }
  }

  return result;
}

/**
 * 安装单个依赖
 */
function installDependency(dep) {
  if (!dep.install_commands || dep.install_commands.length === 0) {
    return { success: false, error: "无安装命令" };
  }

  for (const cmd of dep.install_commands) {
    try {
      run(cmd, {
        timeout: dep.install_timeout || 60000,
        cwd: dep.install_cwd || projectDir,
      });
    } catch (e) {
      return { success: false, error: e.message, command: cmd };
    }
  }

  // 安装后验证：延迟重试，npx/git clone 可能存在文件系统延迟
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) {
      execSync(`sleep ${i}`, { timeout: 5000 });
    }
    const recheck = checkDependency(dep);
    if (recheck.installed) {
      return { success: true, version: recheck.version };
    }
  }

  // 重试耗尽。安装命令本身没报错，可能已安装但验证方式不灵敏
  // 标记 maybe_installed 让调用方决定是否信任
  return { success: false, version: null, maybe_installed: true };
}

// ===== 依赖定义 =====

const DEPENDENCIES = [
  {
    name: "Node.js",
    category: "runtime",
    check_type: "command",
    check_command: "node --version",
    required: true,
    install_commands: [],
    install_hint:
      "Node.js 需要手动安装: https://nodejs.org 或 nvm install 23",
    description: "JavaScript 运行时",
  },
  {
    name: "Python",
    category: "runtime",
    check_type: "command",
    check_command: "python3 --version",
    required: false,
    install_commands: [],
    install_hint:
      "Python 需要手动安装: https://python.org 或 brew install python3",
    description: "Python 运行时（FastAPI 项目必需）",
  },
  {
    name: "OpenSpec CLI",
    category: "core",
    check_type: "command",
    check_command: "openspec --version",
    required: false,
    install_commands: ["npm install -g @fission-ai/openspec"],
    install_timeout: 60000,
    // 注意: 不在此执行 openspec init！
    // openspec init 会覆盖 .claude/ 目录，必须由 agent 在生成完所有项目文件后再执行
    description: "规范驱动的变更管理工具",
  },
  {
    name: "GStack",
    category: "core",
    check_type: "dir_exists",
    check_path: "~/.claude/skills/gstack",
    required: false,
    install_commands: [
      "mkdir -p ~/.claude/skills",
      "git clone https://github.com/nicholasgriffintn/ai-assistants.git ~/.claude/skills/gstack",
    ],
    install_timeout: 120000,
    description: "AI 工程工作流 Skill 集合",
  },
  {
    name: "Superpowers",
    category: "core",
    check_type: "command",
    check_command:
      "grep -q 'superpowers@' \"$HOME/.claude/plugins/installed_plugins.json\" 2>/dev/null",
    required: false,
    install_commands: [],
    install_hint:
      "在 Claude Code 中执行: /plugin marketplace add obra/superpowers-marketplace，然后 /plugin install superpowers@superpowers-marketplace",
    description: "AI 编程超能力 Skill 集合（标准版插件）",
  },
];

// ===== 主流程 =====

function main() {
  const results = [];
  const installed = [];
  const failed = [];

  for (const dep of DEPENDENCIES) {
    const check = checkDependency(dep);
    results.push({
      name: dep.name,
      category: dep.category,
      installed: check.installed,
      version: check.version,
      required: dep.required,
      description: dep.description,
    });

    // 需要安装
    if (!check.installed && shouldInstall && !checkOnly) {
      if (dep.install_commands.length > 0) {
        process.stderr.write(`安装 ${dep.name}...\n`);

        const installResult = installDependency(dep);
        if (installResult.success) {
          installed.push({ name: dep.name, version: installResult.version });
          process.stderr.write(`  ${dep.name} 安装成功\n`);
        } else if (installResult.maybe_installed) {
          // 安装命令没报错，但验证未通过。标记为已安装（信任安装命令）
          installed.push({ name: dep.name, version: null, verified: false });
          process.stderr.write(`  ${dep.name} 安装命令已执行，验证未通过但可能已安装（建议用 --check-only 确认）\n`);
        } else {
          failed.push({
            name: dep.name,
            error: installResult.error,
            hint: dep.install_hint || "",
          });
          process.stderr.write(
            `  ${dep.name} 安装失败: ${installResult.error}\n`
          );
        }
      } else {
        failed.push({
          name: dep.name,
          error: "无法自动安装",
          hint: dep.install_hint || "",
        });
      }
    }
  }

  const output = {
    checks: results,
    installed: installed,
    failed: failed,
    action: checkOnly ? "check-only" : shouldInstall ? "install" : "check",
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main();
