# Changelog

## 2.0.8 (2026-08-15)

### Bug 修复

- **修复源码保护守卫完全失效的严重问题**（`scripts/phase-guard.js`）
  - 原因：守卫用 `(^|\/) + 模式` 拼接正则。当 `source_patterns` 模式带前导 `/`（如 `/backend/main.py`）时，正则实际要求路径中出现连续 `//` 才能命中，真实文件路径永远不满足，导致阶段 1/2 的"禁止 Edit/Write 源码"规则从未拦截过任何操作
  - 修复：构建正则前对模式做前导斜杠归一化（`replace(/^\/+/, "")`），无论配置是否带前导 `/` 均能正确匹配；带前导 `/` 的存量用户配置无需修改即可恢复防护
- **修复 full.json 预设中的前导斜杠写法**（`templates/presets/full.json`）
  - `source_patterns` 全部去掉前导 `/`，并新增 `_comment_source_patterns` 提示不要带前导斜杠

### 测试

- `test/test-guards.js` 新增 3 条回归测试：带前导 `/` 的模式拦截绝对路径编辑、拦截相对路径写入、直接读取 full.json 预设验证守卫生效

## 2.0.7

- 添加开发者用户名字段 + git commit 提交规范

## 2.0.6

- CLAUDE.md 模板写入五阶段流程详情 + Karpathy 四原则

## 2.0.5

- 版本升级维护

## 2.0.4

- 五阶段流程重写 + Karpathy 四原则 + GStack 阶段路由
