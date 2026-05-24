# opsx-workflow

[中文文档](README-zh.md)

A Claude Code plugin for config-driven five-phase automated development workflow.

## Install

```bash
# From local directory
claude --plugin-dir /path/to/opsx-workflow

# Or from GitHub
claude --plugin-url https://github.com/Jzq/claude-code-opsx-workflow/archive/refs/heads/plugin.zip
```

## What It Does

Once installed, the plugin automatically:

- **Guards tool usage** by development phase (blocks source editing in planning, blocks commits when QA fails, etc.)
- **Injects phase context** on every prompt so the agent knows what's allowed
- **Validates environment** on session start (checks for required tools)
- **Intercepts dangerous commands** (rm -rf /, force push to main, DROP TABLE, etc.)

## Usage

In any Claude Code session with the plugin loaded:

```
Set up the five-phase workflow for /path/to/my-project
```

Or with options:

```
Set up the five-phase workflow for /path/to/my-project, tech stack is React+Express, no OpenSpec
```

The plugin will generate `phase-config.json` and project-specific files. Hooks activate automatically.

## Five Phases

| Phase | Name | Description |
|-------|------|-------------|
| 1 | Requirements Clarification | Gather and clarify requirements, no coding |
| 2 | Task Planning | Break down into tasks, define acceptance criteria |
| 3 | Coding Execution | Implement with TDD discipline |
| 4 | Quality Gate | Run tests, lint, review - no shortcuts |
| 5 | Commit & Archive | Clean commit, update docs, archive |

## Detection Strategies

- **filesystem**: Infers phase from file system state (for OpenSpec projects)
- **state-file**: Reads/writes JSON state file (zero dependencies, any project)
- **custom**: Calls your own detection script

## Plugin Structure

```
opsx-workflow/
├── .claude-plugin/plugin.json    # Plugin manifest
├── hooks/hooks.json              # Hook registration
├── skills/opsx-workflow/SKILL.md # Skill definition
├── scripts/                      # Hook scripts + utilities
├── templates/                    # Config templates + presets
└── bin/opsx-workflow             # CLI (optional)
```

## Development

```bash
npm test    # Run all tests (64 tests)
```

## License

MIT
