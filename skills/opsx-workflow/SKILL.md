---
description: "为 Claude Code 项目生成配置驱动的五阶段自动化开发流程。通过 phase-config.json 驱动所有 hook 行为，支持 filesystem/state-file/custom 三种检测策略，内置 OpenSpec+GStack 和最小化两套预设。"
---

# Claude Code 五阶段流水线

## Overview

为 Claude Code 项目生成五阶段自动化开发流程。所有 hook 行为由 `phase-config.json` 单一配置驱动。

五阶段：需求澄清 → 任务规划 → 编码执行 → 质量门禁 → 提交归档

三种检测策略：
- **filesystem**: 从文件系统状态推导（适用于 OpenSpec 等文件驱动项目）
- **state-file**: 读写 JSON 状态文件（零依赖，任何项目可用）
- **custom**: 调用自定义检测脚本

## 插件目录结构

```
opsx-workflow/                           # 插件根目录
├── .claude-plugin/plugin.json           # 插件清单
├── hooks/hooks.json                     # Hook 注册（自动生效）
├── skills/opsx-workflow/SKILL.md        # 本文件
├── scripts/
│   ├── phase-detector.js                # 阶段检测引擎
│   ├── phase-guard.js                   # PreToolUse 守卫
│   ├── phase-reminder.js               # UserPromptSubmit 提醒
│   ├── startup-check.js                # SessionStart 检查
│   ├── check-gstack.sh                 # GStack 检查脚本
│   ├── detect-project-phase.js         # 阶段检测运行器
│   ├── install-dependencies.js         # 依赖检测与安装
│   └── validate-setup.js               # 搭建完整性验证
├── templates/
│   ├── phase-config.json               # 默认配置模板
│   ├── karpathy.md                     # Karpathy 编码原则
│   ├── settings.local.json             # 权限白名单模板
│   └── presets/
│       ├── full.json                   # 完整版预设
│       └── minimal.json                # 最小化预设
└── bin/opsx-workflow                    # CLI 工具
```

## 目标项目生成的文件

```
<项目根目录>/
├── CLAUDE.md                          # 主规范文件（项目根目录）
└── .claude/
    ├── phase-config.json              # 核心：驱动所有 hook 行为
    ├── karpathy.md                    # Karpathy 编码原则
    ├── settings.local.json            # 权限白名单
    ├── standards/                     # 编码规范
    ├── skills/                        # OpenSpec + Superpowers（如使用）
    └── hooks/
        └── check-gstack.sh           # 仅 full 预设
```

注意：hook JS 文件和 settings.json 不再复制到目标项目。插件通过 `hooks/hooks.json` 自动注册所有 hooks。

## 使用方式

```
给 /path/to/my-project 搭建五阶段开发流程
```

或指定技术栈：
```
给 /path/to/my-project 搭建五阶段开发流程，技术栈是 React+Express，不用 OpenSpec
```

## 自动执行步骤

### 1. 采集信息

- 目标项目路径
- 技术栈（从 package.json/requirements.txt 推断）
- 是否使用 OpenSpec/GStack（未指定时默认使用完整版）
- 源码目录结构（扫描 src/lib/app 等）

**如果用户未指定技术栈或预设选择，必须使用 AskUserQuestion 询问以下信息后再继续：**

1. 主要编程语言和框架（如 React+Express、Vue+FastAPI、Django 等）
2. 源码目录结构（如 src/、lib/、app/）
3. 是否使用 OpenSpec/GStack（未指定时默认 full）

不要自行假设技术栈。

### 2. 检测与安装依赖

运行 `node "${CLAUDE_PLUGIN_ROOT}/scripts/install-dependencies.js" <项目路径> --install`

| 依赖 | 检测方式 | 自动安装 |
|------|---------|---------|
| OpenSpec CLI | openspec --version | npm install -g |
| GStack | ~/.claude/skills/gstack/ | git clone |
| Superpowers | ~/.claude/skills/superpowers 或 plugins 目录 | /plugin install（交互式） |
| Node.js | node --version | 给提示 |
| Python | python3 --version | 给提示 |

### 3. 初始化 OpenSpec（仅 full 预设）

**必须在第4步之前！** 在项目目录执行 `openspec init`。

### 4. 安装 Superpowers（仅 full 预设）

**必须在 openspec init 之后！**

检测 Superpowers 插件是否已安装。如果 install-dependencies 报告未安装：
- 引导用户在 Claude Code 中执行：
  1. `/plugin install superpowers@claude-plugins-official`
- 安装完成后执行 `/reload-plugins` 刷新插件列表

### 5. 生成配置文件

- 默认 full 预设，不用 OpenSpec → `presets/minimal.json`
- 从 `${CLAUDE_PLUGIN_ROOT}/templates/presets/` 复制预设
- 替换 source_patterns 和 environment.checks 为实际值
- 写入 `<项目>/.claude/phase-config.json`

### 6. 复制非 hook 模板

- `${CLAUDE_PLUGIN_ROOT}/templates/karpathy.md` → `<项目>/.claude/karpathy.md`
- `${CLAUDE_PLUGIN_ROOT}/templates/settings.local.json` → `<项目>/.claude/settings.local.json`
- full 预设时：`${CLAUDE_PLUGIN_ROOT}/scripts/check-gstack.sh` → `<项目>/.claude/hooks/check-gstack.sh`

### 7. 生成项目特定文件

- `CLAUDE.md`（项目根目录）：使用 `@` 引用注入规范文件，声明技术栈和规则
- `.claude/settings.local.json`：按技术栈定制权限白名单
- `.claude/standards/`：按技术栈生成编码规范

**CLAUDE.md 模板（必须使用 @ 注入，确保规范自动加载到上下文）：**

```markdown
# 项目规范

## 阶段配置
@.claude/phase-config.json

## 编码原则
@.claude/karpathy.md

## 技术栈规范
@.claude/standards/[按技术栈生成文件名].md

## 项目信息
- 技术栈: [从步骤1确认的结果]
- 开发流程: 五阶段流水线（需求→规划→编码→QA→归档）
```

### 8. 验证

运行 `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-setup.js" <项目路径>`，确认 valid=true。

## 常见陷阱

1. **openspec init 会覆盖 .claude/ 文件**: 必须在 openspec init 之后再生成配置/hooks。执行顺序：检测 → 安装 → openspec init → Superpowers → 生成项目文件
2. **settings.local.json 工具名首字母大写**: 正确 `"Bash(npm run dev)"`，错误 `"npm run dev"`
3. **source_patterns 过宽过窄**: 太宽误拦截，太窄守卫失效
4. **state-file 状态同步**: AI 必须调用 writePhaseState() 更新状态
5. **filesystem 规则顺序**: 精确规则（all_of）应在宽泛规则（file_not_contains）之前
6. **hooks 由插件自动注册**: 不需要复制 hook JS 文件到目标项目

## 全局强制规则

1. 严格按阶段顺序执行，禁止跨阶段
2. 所有产出落地文件，禁止口头交付
3. 需求变更立即终止返回阶段1
4. 阶段1/2 禁用 Superpowers
5. 严格遵循 TDD，禁止跳过测试
6. 工具缺失或环境异常立即终止
7. QA FAIL 禁止强行归档，返回阶段3修复
8. 拒绝过早抽象、过度工程
9. 代码优先直白可读
10. 先实现可运行版本，再优化
11. 配置驱动优于硬编码，预设优于从零搭建

## 验证清单

- [ ] install-dependencies.js --check-only 确认依赖已安装
- [ ] openspec init 在生成 .claude/ 文件之前执行
- [ ] Superpowers 在 openspec init 之后安装
- [ ] .claude/phase-config.json 存在且格式正确
- [ ] detection.strategy 已选择且有对应子配置
- [ ] source_patterns 与项目源码路径匹配
- [ ] .claude/karpathy.md 存在
- [ ] .claude/settings.local.json 存在且包含 permissions
- [ ] 项目根目录 CLAUDE.md 引用了 phase-config.json
- [ ] .claude/standards/ 包含编码规范
- [ ] validate-setup.js 确认 valid=true
- [ ] plugin hooks 自动注册，无需手动配置
