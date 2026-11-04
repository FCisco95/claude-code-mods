# Install, update and recover

Documentation candidate, checked 4 November 2026 against source `6909bae`. These procedures were inspected, not executed. No mods were installed, enabled, disabled or removed during this audit.

## Before installing

Read the [compatibility matrix](evidence.md). You need Claude Code with mod support permitted by your environment; these mods have no established cross-version/platform support matrix. Git is needed for cloning; Cache Clock needs Node.js on PATH. Chat Handoff uses Cache Clock for its cold-cache trigger.

Choose one installation route per mod to avoid duplicate copies. Review the source first: a mod runs with your account's permissions. [Upstream mod guidance](https://code.claude.com/docs/en/plugins/mods/overview) describes the trust model. No global tool update or early-access environment flag is prescribed here.

## Marketplace: one mod at a time

Inside Claude Code, the repository documents:

```text
/plugin install replay-theater --marketplace FCisco95/claude-code-mods
```

The current local CLI help also accepts the shell equivalent:

```sh
claude plugin install replay-theater --marketplace FCisco95/claude-code-mods --scope user
```

Replace `replay-theater` with a catalog name. Review the installation scope in the host UI; `user` loads across projects. Start a new session and check the Installed view in `/plugin`. Installation success and live rendering remain unverified here.

### Update or remove a marketplace copy

Review upstream changes and preserve your configuration first. The following are documented host commands, not an update receipt:

```sh
claude plugin update replay-theater@claude-code-mods --scope user
claude plugin disable replay-theater@claude-code-mods --scope user
claude plugin uninstall replay-theater@claude-code-mods --scope user
```

Run only the action you intend. Match the scope to the actual installation. Use a new session to check the result. See [plugin command reference](https://code.claude.com/docs/en/plugins/cli-reference) and [installation guidance](https://code.claude.com/docs/en/plugins/install). All manifests are still `0.1.0`: a host reporting “latest” is not proof that its cached files match this repository's HEAD. No tested marketplace downgrade flow is recorded here.

## Local clone: explicitly select folders

```sh
git clone https://github.com/FCisco95/claude-code-mods
cd claude-code-mods
```

macOS / Linux, using the repository's POSIX shell script:

```sh
sh ./install.sh replay-theater switchboard helper-desk
```

Windows PowerShell, using an explicit array for the script's `Mods` parameter:

```powershell
./install.ps1 -Mods @('replay-theater', 'switchboard', 'helper-desk')
```

The scripts target `skills/<mod>` beneath `CLAUDE_CONFIG_DIR` when set, otherwise beneath `~/.claude`. With no names they install all nine, including the model-assisted mods. Each selected existing destination folder is deleted before copying. They do not back up customizations or merge files. Start a new Claude Code session to load the copies; repeat installation on another machine as needed. Saved rules and handoffs are separate user data, not part of the clone.

### Update a local copy

1. Record the currently installed source commit, if known, and back up each selected installed folder outside the scanned `skills` directory. Preserve customized files and relevant settings separately.
2. In a clean clone, inspect incoming changes before advancing it. `git pull --ff-only` can advance the branch without creating a merge; stop if it fails. Do not reset or discard local work.
3. Run the appropriate selective installer above only after reviewing the changes. Its overwrite behaviour is the same on update as on first install.
4. Open a new session and verify the commands and UI for your exact host version. Record failures rather than assuming a version string proves compatibility.

### Disable, uninstall and rollback a local copy

For a project-specific opt-out, merge this entry into that project's existing `.claude/settings.json`, preserving its other keys:

```json
{ "enabledPlugins": { "helper-desk@skills-dir": false } }
```

For a marketplace copy, use its actual ID, such as `helper-desk@claude-code-mods`. Switchboard's on/off control changes the installed scope, while `Hide panel` changes visibility. Already-open chats can retain UI; hiding a panel does not stop model calls or other mod behaviour.

There is no uninstall script for local copies. To remove one reversibly, close relevant sessions and move **only its exact folder** out of the resolved `skills` directory to a backup location, then start a new session and check it no longer loads. Do not delete the whole directory or unrelated skills. Rule files, memory and handoffs written earlier remain; removing a mod does not undo its data writes.

There is no automatic rollback. Recovery means restoring your saved installed folder/configuration, or inspecting and copying the selected plugin from a known-good source commit in a separate checkout. No release tags exist to select a supported downgrade. Replay Theater itself is a viewer, not an undo or recovery tool.
