# Helper Desk

A Claude Code mod that shows what Claude and its subagents are doing, without a single model call.

- **Task bar.** A purple bar above the prompt fills as Claude ticks off its to-do list.
- **Subagent panel.** `/helper-desk` opens a side panel with one live card per subagent: its step, model, tokens and time.

It only reads what Claude Code already reports, so it adds no cost.

## Notes

- Claude Code only.

## Install

```
/plugin install helper-desk --marketplace FCisco95/claude-code-mods
```

Or copy `plugins/helper-desk` to `~/.claude/skills/helper-desk` (see the [repo README](../../README.md)).
