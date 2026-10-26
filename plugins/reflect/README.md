# Reflect

A Claude Code mod that lets you decide what Claude remembers about your rules.

When you tell Claude something that should hold from now on ("never use em dashes", "keep LinkedIn hooks under 12 words"), a card appears above the prompt and asks where to save it. Nothing is saved until you press a button, and `Skip` saves nothing.

```
● That sounds like a lasting rule. Save it?
“Never use em dashes.”
[ Save everywhere ] [ Save to memory ] [ Save to vault ] [ Skip ]
```

## The buttons

| Button | What it writes |
|---|---|
| **Save everywhere** | A bullet in `~/.claude/rules/reflect.md`, a file only Reflect writes and Claude Code loads at the start of every session, in every project. Set another file (a `CLAUDE.md`, an `AGENTS.md`) in the mod's settings. The same rule is never added twice. |
| **Save to memory** | Claude Code's own auto memory for this project: one `feedback_<rule>.md` file and a line in its `MEMORY.md` index. It applies to this project only. |
| **Save to vault** | One note per rule in the folder you choose. Only shown when a vault folder is set in the settings. |
| **Skip** | Nothing. |

## What counts as a rule

Only explicit, lasting instructions. A one-off request ("make this intro shorter"), a question, a bit of feedback on one result ("this is too long") or a thank-you does not trigger the card. When it is unsure, it stays quiet.

How it decides: every prompt of 2 to 600 characters that is not a slash command goes to one small model call (the `haiku` tier) that answers "rule or not". It runs in the background, so your prompt is never delayed, and it works in any language. Longer prompts are never checked. Each check costs one short Haiku call on your own Claude account.

The rule is rewritten as one standalone sentence in your language before you are asked, so the card shows exactly what will be saved.

## Settings

Open the mod's settings (`/config`) and set:

- **File for "Save everywhere"**: absolute path of the file to add rules to. Empty means `~/.claude/rules/reflect.md`.
- **Rules folder for "Save to vault"**: absolute path of the folder in your vault or second brain. Empty hides the vault button.

## Change where rules go

Every destination is one entry in `hooks/destinations.ts`, and the buttons are built from that list. To send rules somewhere else, ask Claude to edit the mod, for example:

- "Change Reflect so Save everywhere appends to the rules section of my `writing` skill."
- "Add a Reflect button that saves rules to `~/notes/rules.md`."
- "Remove the memory button from Reflect."

## Install

```
/plugin install reflect --marketplace FCisco95/claude-code-mods
```

Or copy this folder to `~/.claude/skills/reflect`.

## Limits

- A saved rule is read from the next chat onward; it is not injected into the chat you are in.
- To list your saved rules, open `~/.claude/rules/reflect.md`, or ask Claude "what are my Reflect rules?" if your global instructions point to that file.
- A prompt that holds a rule inside a long task description (over 600 characters) is not checked.
- Claude Code only.
