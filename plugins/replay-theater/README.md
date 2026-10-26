# Replay Theater

A Claude Code mod for reviewing edits. After Claude changes your files, type `/replay` and step through every edit it made in the last turn, one change at a time: the file, what was removed (red `-`) and what was added (green `+`). No more comparing versions by hand or asking Claude to list what it changed.

## Use

| Key | What it does |
| --- | --- |
| `/replay` | Open the replay pane on the first edit of the last turn that changed files |
| `n` or `Next` | Next edit |
| `p` or `Prev` | Previous edit |
| a step number | Jump to that edit (up to nine numbers show, around the current one) |
| `c`, `Close` or Esc | Close the pane |

Each step shows its file (with `~` for your home folder), whether it was an edit, a new file or a rewrite of an existing file, and the count of lines added and removed. Lines that did not change are left out.

## Limits

- It watches Claude's `Edit` and `Write` tools, so it works on files Claude edits, not on text written only in the chat. A change made through a shell command (for example `sed`) is not recorded.
- It remembers the last turn that edited files. A new turn that edits files replaces the list.
- It starts watching when it loads: edits made before that are not in the list.
- It shows changes. It does not undo them: to go back to an earlier version, use git or ask Claude.
- A single step shows up to 200 changed lines (the counts stay exact), and the list keeps the last 200 steps.
- Nothing is sent anywhere and no model is called.

## Install

Copy this folder to `~/.claude/skills/replay-theater`, or install it from the repository's marketplace. It loads in every project. To keep it off in one project, put `{"enabledPlugins": {"replay-theater@skills-dir": false}}` in that project's `.claude/settings.json`.
