#!/bin/bash
# GStack 技能目录检查
if [ ! -d "$HOME/.claude/skills/gstack/bin" ]; then
  cat >&2 <<'MSG'
BLOCKED: gstack 技能目录不存在。

请确认 GStack 已正确安装到 ~/.claude/skills/gstack/
MSG
  echo '{"permissionDecision":"deny","message":"gstack 技能目录缺失，请检查安装。"}'
  exit 1
fi

echo '{}'
