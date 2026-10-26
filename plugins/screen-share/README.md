# Screen-Share Mode

A Claude Code mod for privacy. Type `/screen-share` before you record a video, join a call or present, and every name, email address, phone number and money amount on screen turns into a grey bar (`▒▒▒▒▒▒▒▒`). Type it again to turn the mode off.

Claude still reads the real text. The mod only changes how the transcript is drawn, so you can use your real chats while sharing, with no invented client names.

## Use

| Command | What it does |
| --- | --- |
| `/screen-share` | Toggle the mode on or off |
| `/screen-share on` / `off` | Set it explicitly |
| `/screen-share status` | Say whether it is on |
| `/screen-share add Maria Silva` | Always hide this name while the mode is on |
| `/screen-share forget` | Drop the names added by hand and the ones picked up automatically |

While the mode is on, a band above the prompt says so (with a `Turn off` button) and the status line shows `▒ screen-share ON`.

## What is hidden

| Category | How it is found |
| --- | --- |
| Emails | `name@domain.tld` |
| Money | `$48,500`, `€45k`, `£90`, `USD 5000`, `250 dollars`, `12,000 EUR`, `$1.2M` |
| Phone numbers | 9 to 15 digits with `+`, spaces, dots, dashes or brackets (`+351 912 345 678`, `(555) 123-4567`) |
| Names | After a greeting or title (`Hi Carlos`, `Dr. Silva`); words picked up from email addresses (`john.smith@` hides `john` and `smith` everywhere); names added with `/screen-share add`; and, in prose only, two to four capitalised words in a row (`Maria Silva`) |

Hidden on: your messages, Claude's answers, command output, notices, and the tool rows (the command or file Claude used and its result). Code blocks and headings are left out of the capitalised-words guess.

## Limits

Be honest with yourself before you record:

- It is pattern matching, not understanding. A name Claude writes that is a single word, is not next to an email and was not added by hand can slip through. A capitalised phrase that is not a name (`Start Fresh Chat`) can be hidden by mistake. Do a quick scroll before you share.
- What you are typing in the prompt box is not masked, and neither are other mods' status lines, the terminal title or your shell prompt.
- Turning the mode on redraws the rows already on screen, but a first name is only recognised once its email, or its full name, has been drawn. Scroll through before you share. Anything you shared earlier stays shared.
- The mode lasts for the session. Start a new chat and type `/screen-share` again.
- Nothing is sent anywhere: detection is plain pattern matching on your machine, with no model call.

## Install

Copy this folder to `~/.claude/skills/screen-share`, or install it from the repository's marketplace. It loads in every project. To keep it off in one project, put `{"enabledPlugins": {"screen-share@skills-dir": false}}` in that project's `.claude/settings.json`.
