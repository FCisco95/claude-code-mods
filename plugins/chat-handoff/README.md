# Chat Handoff

A Claude Code mod that moves a long chat into a fresh one without losing context.

Long chats rot: the fuller the context window, the more details Claude misses. Compacting loses detail through summarizing, and a cold prompt cache makes every new message cost more. Handoff writes a detailed handoff prompt for a fresh chat, and shows a button to start that chat when you choose.

## Triggers

- **250,000 tokens.** The size is the one Cache Clock already tracks: the prompt tokens the next request re-sends (input + cache read + cache write + output of the last main-thread reply). If Cache Clock has no figure yet, it falls back to the status line's context figure (`$.session.usage()`). It checks every 3 seconds while no turn is running.
- **Cold cache.** Reads Cache Clock's own state (`lastRequestAt` and `ttlMs`, shared through `$.state`): the cache is cold when the last request is older than the lifetime Cache Clock read from the API. It needs Cache Clock loaded, and only fires above 50,000 tokens, since a cold cache on a small chat costs next to nothing. One cold spell fires once.
- **`/handover`.** Writes it now. `/handover start`, `/handover copy` and `/handover show` do the rest from the keyboard. The mod also tries to register `/handoff`; if another plugin already owns that name, only `/handover` answers.

## What it writes

One plain-text markdown prompt with:

- how to use it, then Goal, Context, Decisions and rules, Progress (done / in progress / not started), What was tried and failed, Current state, Next steps, Open questions: written by Claude over the whole chat (a fork of the chat, so the cached prefix is reused where it is still warm).
- the working tree: branch, uncommitted changes, recent commits.
- appendices read straight from the transcript, not from memory: files created or changed, files read, skills and slash commands, tools and subagents, links and searches, recent shell commands.

It is also saved to `~/.claude/handoffs/<date>-<session>.md`, so you can send the file to a teammate, or paste the text from `/handoff show`.

## The button

A band above the prompt shows `Start fresh chat`, `Copy` and `×`. Nothing starts until you press `Start fresh chat` (or type `/handover start`). Pressing it runs `/clear` (the old chat stays in `/resume`) and sends the handoff prompt as the first message of the new chat. If `/clear` cannot be run from the mod, it copies the prompt and tells you to run `/clear` and paste.

## Assumptions

- No mod API opens a new chat directly, so "fresh chat" is `/clear` plus a submitted prompt.
- The 250k figure is unreachable on a model whose window is smaller than that, because auto-compact comes first.
- Writing the prompt costs one request over the chat: cheap while the cache is warm, one full re-cache when the trigger was a cold cache.
- Claude Code only. Depends on the `cache-clock` mod for the cold-cache trigger.

## Install

```
/plugin install chat-handoff --marketplace FCisco95/claude-code-mods
```

Or copy `plugins/chat-handoff` to `~/.claude/skills/chat-handoff` (see the [repo README](../../README.md)).

Needs `cache-clock` for the cold-cache trigger.
