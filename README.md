# Claude Code mods

Six small, free mods for [Claude Code](https://claude.com/claude-code) that make long sessions cheaper and easier to read. Each one is a single folder you can read in ten minutes. None of them sends your chat anywhere except through Claude Code itself.

| Mod | What it does | Model calls |
|---|---|---|
| [**cache-clock**](plugins/cache-clock) | Countdown above the prompt until the prompt cache goes cold. Optional keep-warm ping. | Only when keep warm is on |
| [**chat-handoff**](plugins/chat-handoff) | At 250k tokens, on a cold cache, or on `/handover`, writes a detailed prompt for a fresh chat and shows a `Start fresh chat` button. Nothing starts until you click. | One per handoff |
| [**chat-inventory**](plugins/chat-inventory) | Side panel "In this chat": the to-do list with its goal, every connector with a call count, the skills used, and the files read and created. | None |
| [**screen-share**](plugins/screen-share) | `/screen-share` hides names, emails, phone numbers and money amounts as grey bars on screen while you record or present. Claude still reads the real text. | None |
| [**replay-theater**](plugins/replay-theater) | `/replay` steps through every file edit Claude made in the last turn, one change at a time, with what was removed and what was added. | None |
| [**switchboard**](plugins/switchboard) | `/mods` opens one list of every mod you run: switch each on or off, hide its panel, and see new mods appear by themselves. | None |
| [**helper-desk**](plugins/helper-desk) | Task bar that fills as Claude ticks off its to-do list, plus one live card per subagent. | None |
| [**reflect**](plugins/reflect) | Notices a lasting rule in your prompt ("never use em dashes") and asks where to save it: a global rules file, Claude's memory, your vault, or nowhere. Nothing is saved without a click. | One short Haiku call per prompt |
| [**brain-dump**](plugins/brain-dump) | Holds a long, messy prompt, asks 2 to 3 questions about the gaps, and fills the prompt box with a clear four-part prompt. | Two, only for long prompts |

```
 ⇄ Handoff ready   cache went cold · 875 words   [ Start fresh chat ]  [ Copy ]  [ × ]
   Saved to ~/.claude/handoffs/20261026-1447-bc05342a.md (send this file to a teammate)
```

## Install

Requires Claude Code 2.1.292 or later with mods enabled. `cache-clock` (and so `chat-handoff`) also needs Node.js on your PATH: it reads the cache lifetime from the session transcript with `node -e`.

**From the marketplace** (one mod at a time):

```
/plugin install cache-clock --marketplace FCisco95/claude-code-mods
```

**From a clone** (all six, loads in every project):

```sh
git clone https://github.com/FCisco95/claude-code-mods
cd claude-code-mods
./install.sh            # macOS / Linux
./install.ps1           # Windows PowerShell
```

Pass mod names to install only some: `./install.sh cache-clock chat-handoff`. Start a new Claude Code session afterwards.

`chat-handoff` reads Cache Clock's state for its cold-cache trigger, so install both.

## On a new computer

Mods are not tied to your subscription. Claude Code's docs describe plugins and mods as installed per machine (`~/.claude/plugins` for marketplace installs, `~/.claude/skills` for folders), and do not describe any sync between machines. So repeat the install on each computer:

1. Install Claude Code 2.1.292 or later and Node.js.
2. `git clone https://github.com/FCisco95/claude-code-mods && cd claude-code-mods && ./install.sh` (`./install.ps1` on Windows).
3. Start a new Claude Code session.

Prefer the marketplace? `claude plugin install <mod> --marketplace FCisco95/claude-code-mods` also works, but the mod then shows as `<mod>@claude-code-mods` instead of `<mod>@skills-dir`, so use that name in the opt-out below.

Your own data is not in this repo. `reflect` keeps saved rules in `~/.claude/rules/reflect.md` on each machine; carry that file yourself (a dotfiles manager or a copy).

## Global by default, off per project

Mods installed this way are user-level: they run in every project with no setup. To turn one off in a single project, put this in that project's `.claude/settings.json` (other projects are untouched):

```json
{ "enabledPlugins": { "helper-desk@skills-dir": false } }
```

(`@skills-dir` is the name when installed with `install.sh`.)

## Adding a mod

1. Put the folder in `plugins/<name>/` (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`).
2. Add it to `.claude-plugin/marketplace.json`.
3. Run `./install.sh <name>` (or `./install.ps1 <name>`). It copies to `~/.claude/skills/<name>`, which makes it global.

## Status and honesty

- Built on the early-access Claude Code mod API (Claude Code 2.1.310). The API can change; if a mod breaks after an update, open an issue.
- Tested by hand in real sessions and with `claude plugin validate`. `chat-handoff` also has a unit test for the transcript reader (`claude plugin test plugins/chat-handoff`).
- Not yet exercised live: the 250k and cold-cache triggers of `chat-handoff`, and the long-prompt hold of `brain-dump`.
- `/handoff` is claimed by some other plugins, so `chat-handoff` answers to `/handover` and also tries `/handoff`.

## Credit

`cache-clock` is inspired by Karan Binsal's "cache tax" mod.

## License

MIT. Written by [Cisco Vieira](https://github.com/FCisco95) with Claude Code.
