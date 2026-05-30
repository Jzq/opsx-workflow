# jizhiqiang

[English](README.md)

Claude Code 插件：配置驱动的五阶段自动化开发流程。

## 安装

```bash
# 添加 marketplace
/plugin marketplace add Jzq/jzq-marketplace

# 安装插件
/plugin install jizhiqiang@jzq-marketplace
```

## 功能

插件加载后自动生效：

- **工具守卫**：按开发阶段拦截操作（规划阶段禁止编辑源码，QA 未通过禁止提交等）
- **阶段注入**：每次用户输入时注入当前阶段上下文
- **环境检查**：会话启动时验证依赖工具
- **危险命令拦截**：阻止 rm -rf /、force push main、DROP TABLE 等

## 使用

在加载了插件的 Claude Code 会话中：

```
/jizhiqiang:opsx-workflow
```

然后告诉它做什么：

```
给 /path/to/my-project 搭建五阶段开发流程
```

或指定选项：

```
给 /path/to/my-project 搭建五阶段开发流程，技术栈是 React+Express，不用 OpenSpec
```

插件会生成 `phase-config.json` 和项目配置文件，hooks 自动激活。

## 五个阶段

| 阶段 | 名称 | 说明 |
|------|------|------|
| 1 | 需求澄清 | 收集并澄清需求，禁止编码 |
| 2 | 任务规划 | 拆分任务，定义验收标准 |
| 3 | 编码执行 | 严格 TDD 纪律实现 |
| 4 | 质量门禁 | 运行测试、lint、代码审查 |
| 5 | 提交归档 | 清理提交、更新文档、归档 |

## 检测策略

- **filesystem**：从文件系统状态推导阶段（适用于 OpenSpec 项目）
- **state-file**：读写 JSON 状态文件（零依赖，任何项目）
- **custom**：调用自定义检测脚本

## 插件结构

```
opsx-workflow/
├── .claude-plugin/plugin.json    # 插件清单
├── hooks/hooks.json              # Hook 注册
├── skills/opsx-workflow/SKILL.md # Skill 定义
├── scripts/                      # Hook 脚本 + 工具脚本
├── templates/                    # 配置模板 + 预设
│   ├── presets/full.json         # 完整版预设（OpenSpec + GStack + Superpowers）
│   └── presets/minimal.json      # 最小化预设（state-file，零依赖）
└── bin/opsx-workflow             # CLI（可选）
```

## 开发

```bash
npm test    # 运行全部测试（64 个测试）
```

## 许可证

MIT
