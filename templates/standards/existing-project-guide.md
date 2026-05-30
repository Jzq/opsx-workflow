# 现有项目架构分析指南

本文件指导 agent 如何分析现有代码结构并生成架构约束文件。

---

## 分析目标

从现有代码中提取架构决策、编码风格和项目约定，生成一份约束文件，确保后续开发与现有代码保持一致。

---

## 分析步骤

### 第一步：扫描目录结构

```
分析目标：
- 顶层目录划分（src/、lib/、app/、pkg/ 等）
- 模块/功能分区方式
- 是否有 monorepo 结构
- 测试文件位置和命名
```

重点关注：
- 目录层级反映的架构分层
- 文件组织方式（按功能 vs 按类型）
- 是否有明确的模块边界

### 第二步：识别架构模式

检查以下特征判断架构模式：

| 架构模式 | 识别特征 |
|---------|---------|
| **MVC** | models/ + views/ + controllers/ 目录 |
| **Clean Architecture** | entities/ + usecases/ + interfaces/ + infrastructure/ |
| **DDD** | domain/ + application/ + infrastructure/ + presentation/ |
| **分层架构** | layers/ 或 service/ + repository/ + controller/ |
| **六边形架构** | ports/ + adapters/ + domain/ |
| **CQRS** | commands/ + queries/ + handlers/ |
| **微服务** | services/ 下多个独立服务目录 |

如果无法识别出明确模式，归类为「自由结构」并描述实际的文件组织方式。

### 第三步：提取编码风格

阅读 3-5 个代表性源文件，提取：

```
命名规范：
- 变量/函数：camelCase / snake_case / PascalCase
- 类名：PascalCase
- 常量：UPPER_SNAKE / camelCase
- 文件名：kebab-case / camelCase / snake_case
- 目录名：kebab-case / camelCase

代码组织：
- 单文件最大行数（取样本平均值）
- 类/函数的平均长度
- 是否使用 index 文件做导出聚合
- import/require 风格

错误处理：
- try-catch / Result / Either / 异常类继承
- 错误日志格式
- 是否有统一错误码体系

日志：
- 日志框架和级别
- 日志格式模板
- 关键信息字段（traceId、userId 等）
```

### 第四步：提取技术栈特征

```
数据层：
- ORM/查询构建器（TypeORM、Prisma、SQLAlchemy、Sequelize 等）
- 数据库类型（MySQL、PostgreSQL、MongoDB 等）
- 是否有迁移文件，迁移工具

依赖注入：
- DI 框架（InversifyJS、tsyringe、Python dependency-injector 等）
- 或手动依赖注入

API 层：
- HTTP 框架（Express、Fastify、FastAPI、Django REST 等）
- API 风格（REST、GraphQL、gRPC）
- 中间件使用

测试：
- 测试框架（Jest、pytest、Vitest 等）
- 测试目录位置（__tests__/、tests/、*.spec.ts、*_test.py）
- 测试覆盖率要求

其他：
- 配置管理方式（env、config 文件）
- 缓存策略
- 消息队列使用
```

### 第五步：检查现有约束

查看项目中是否已有架构相关的文件：
- `CLAUDE.md`、`AGENTS.md`、`.editorconfig`、`.eslintrc`、`pyproject.toml` 等
- 提取其中有价值的约束信息，合并到生成的文件中

---

## 输出格式

生成 `<项目>/.claude/standards/architecture.md`，结构如下：

```markdown
# 现有项目架构约束

本文件基于对现有代码结构的分析自动生成，后续开发必须遵循以下约束。

## 架构模式

[识别出的架构模式名称和描述]

## 目录结构约定

[项目实际的目录组织方式和规则]

## 分层规则

[识别出的分层方式和依赖方向]

## 编码风格

[命名规范、代码组织、错误处理、日志格式]

## 技术栈约定

[框架、ORM、测试框架等的使用约定]

## 禁止事项

[从代码中推断出的明确反模式或不允许的做法]

---

**约束生效条件：** 本文件通过 @.claude/standards/architecture.md 注入 CLAUDE.md，在每次会话中自动加载。编码执行阶段（阶段3）的所有产出必须遵守上述约束。
```

---

## 注意事项

1. **只提取，不改造**：目标是记录现有约定，不是建议重构
2. **有疑问时优先保守**：如果不确定某个模式是有意设计还是偶然，按"有意设计"处理
3. **具体优于抽象**：写 `使用 SQLAlchemy ORM，模型类继承 Base` 而不是 `使用 ORM`
4. **代码示例辅助**：对关键约定附上项目中的实际代码片段作为参考
