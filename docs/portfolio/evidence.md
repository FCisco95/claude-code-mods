# Presentation evidence and compatibility

Audit date: **4 November 2026**. Scope: README, portfolio documentation and static presentation assets. Preparation involved no commit, push, release, product code change, mod installation/activation or inference execution. After reviewing both candidates, Cisco authorized publication in this repo session. Only the approved presentation files are eligible for commit/push; no release or mod execution is included.

## Repository state

| Item | Observed state |
|---|---|
| Repository / default branch | `FCisco95/claude-code-mods`, `main`, from `gh repo view`. |
| Local / remote source | Clean at intake; `git fetch origin` without prune succeeded. HEAD and `origin/main` both `6909bae6045003ea6a07b8ebe329b2e0820d6ef0`. |
| Catalog | Nine marketplace entries, nine plugin folders, nine manifests at `0.1.0`. |
| Distribution | GitHub tags API: 0; releases API: 0. Manifest version is source metadata, not a release receipt. Installed mod versions were not inspected. |
| Local project instructions | No repo-local AGENTS.md, CLAUDE.md or HANDOFF found at intake. User-supplied instructions and approved presentation standard governed this wave. |

The approved presentation contract was read from the career vault; this candidate does not modify or link publicly to that private workspace. Presentation-only continuation notes are below; they are not an operational product handoff.

## Compatibility: documented versus tested

| Area | Evidence | What remains unknown |
|---|---|---|
| Historical requirement | Pre-change README at `6909bae` declares Claude Code `2.1.292+` and says built on API `2.1.310`. | No version/platform receipts establishing a support range. |
| Current upstream host | [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview), read 4 November: terminal mods on by default from `2.1.287`; available UI surfaces differ. | Upstream capability does not validate this repository's handlers on any particular host. No universal desktop/IDE/provider claim. |
| Local CLI | `claude --version` returned `2.1.318` on Windows. `plugin install/update/uninstall --help` completed successfully. | Help parsing is not mod execution or acceptance on Windows, WSL, macOS or Linux. |
| Installation and lifecycle | Read both installers. [Install guidance](https://code.claude.com/docs/en/plugins/install) and [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference) checked against local help. | No installs, updates, disable/uninstall operations or rollback drills run. Same-version `0.1.0` cache refresh remains unproven. |
| Historical testing | Old README reports manual sessions and `claude plugin validate`; six mods contain test files. | No fresh runtime test results, retained platform matrix or claim that all nine have unit tests. |

Test files exist for chat-handoff, chat-inventory, reflect, replay-theater, screen-share and switchboard. No test files were found for brain-dump, cache-clock or helper-desk. The commands `claude plugin validate plugins/<name>` and `claude plugin test plugins/<name>` remain future verification actions in a suitable environment, not passed checks in this wave.

Open acceptance items carried forward: cold-cache handoff offer, long-prompt hold, and Save to vault. Before claiming support, exercise the exact source in an explicitly authorized synthetic environment and record version, platform, scenario and outcome. Do not install/activate mods or update tools merely to complete this presentation change.

## Claim-to-source map

| Claim | Local source |
|---|---|
| Catalog and metadata | [Marketplace](../../.claude-plugin/marketplace.json); `plugins/*/.claude-plugin/plugin.json`. |
| Overwrite on reinstall / config root | [install.sh](../../install.sh), [install.ps1](../../install.ps1): selected destination removed before copy; `CLAUDE_CONFIG_DIR` fallback. No built-in backup/uninstaller. |
| Costs | [Cache Clock fork](../../plugins/cache-clock/hooks/register.tsx), [Handoff fork/fallback](../../plugins/chat-handoff/hooks/register.tsx), [Reflect eligibility/model](../../plugins/reflect/hooks/detect.ts), [Brain-Dump threshold and calls](../../plugins/brain-dump/hooks/register.ts). Brain-Dump's source includes exactly 120 words, despite older per-mod prose saying “over 120”. |
| UI coverage and boundaries | [Replay README](../../plugins/replay-theater/README.md), [Helper Desk README](../../plugins/helper-desk/README.md), [Inventory README](../../plugins/chat-inventory/README.md), [Switchboard README](../../plugins/switchboard/README.md), corresponding handlers. |
| Visual privacy | [Screen-Share masker](../../plugins/screen-share/hooks/mask.ts) and [render handlers](../../plugins/screen-share/hooks/register.tsx); per-mod README describes uncovered surfaces. Its broad “every name” / real-chat-sharing language is not adopted by the candidate. |
| Local data writes | [Handoff](../../plugins/chat-handoff/hooks/register.tsx), [Reflect destinations](../../plugins/reflect/hooks/destinations.ts), [Reflect manifest](../../plugins/reflect/.claude-plugin/plugin.json). |
| Media | All ten assets and all nine GIF frames visually inspected. Cisco confirmed the visible invoice data, names, email and phone number are invented on 4 November 2026; [media plan](media-plan.md) records that owner confirmation and remaining capture provenance gaps. No fresh runtime acceptance inferred. |

## Commit-based history, not releases

| Commit | Source change |
|---|---|
| `6909bae` | Helper Desk and Chat Inventory panes open automatically again. |
| `7c8cfe3` | Switchboard hidden tag, restart note and animated demo. |
| `97ffc9f` | Screenshots, GIFs, captions and hero image. |
| `59f16bd` | Stacked bands, theme colours and replay diff context/syntax. |

These entries come from `git log`, not tags or release notes. They do not establish when a user's installed copy acquired the behaviour.

## Candidate verification

Source inspection and read-only host help are complete. Candidate checks performed with already-installed Python MarkdownIt, Pillow and headless Playwright; no dependencies installed:

| Check | Result / boundary |
|---|---|
| Markdown links | Second visual candidate: four Markdown files parsed; 55 relative links, images and anchors resolved, including exact path casing. No planned-but-absent media embedded. |
| Catalog consistency | README contains all nine marketplace names; all nine manifest versions equal `0.1.0`. |
| Local rendered approximation | Second visual candidate: browser loaded all nine images (five SVG controls/indicators and four existing captures) at 1280 px and 375 px, light and dark. Five native disclosure sections opened and closed successfully. No page-wide overflow with sections closed or expanded; narrow tables scroll in the approximation. All four opening layouts visually inspected. This uses local review CSS, not GitHub's actual renderer. |
| Animation / media | All GIF frames visually reviewed. Browser playback of Switchboard confirmed by changing screenshot bytes over successive frames. Replay and Helper Desk frame contents reviewed; their browser timing was not separately measured. |
| Orca preview | `orca file open README.md --focus --json` returned `opened: true`, kind `markdown`. A native screenshot confirmed rendered demonstration sections and images/GIFs. Further scrolling was refused with `window_not_focused`, including the single `--restore-window` retry; no full Orca-page review or return-to-top is claimed. |
| Presentation SVGs | Five local SVGs parsed successfully; no scripts, event attributes, foreign objects, embedded images, references or external resources. These are static image links/indicators, not executable controls. |
| GitHub Markdown renderer | Before publication, GitHub's Markdown API rendered the approved README in repository context. Nine images, five native disclosure sections and all three navigation destinations survived sanitization; no scripts were present. This confirms GitHub markup handling, separately from live-page visual inspection. |
| Diff / scope | `git diff --check` passed; root README, three new portfolio documents and five new presentation SVGs only. Original captures, product code and installers unchanged. Temporary local render/inspection files removed. |

Hero and Switchboard text remain small at mobile width; the second visual candidate moves them into expandable sections and leads with the focused Replay example. Buttons wrap onto two rows in the local 375 px check. Cisco has confirmed the visible invoice data is invented. Original capture environment/version remains unknown. Product tests and live compatibility checks were not run; no installation/update/rollback success is claimed.

## Publication receipt — 4 November 2026

Presentation commit `2e09609c6f17d73a6972abc7eac33d40b4bd71e0` was pushed to `origin/main` after Cisco's approval. GitHub's commits API returned the same SHA, and the published README blob matched the local blob `fe411aab16afaed1499efea20d6c3122f79d5067`. The working tree was clean after the push. This receipt is a subsequent documentation update.

The public repository page was opened in Orca's browser without a signed-in account. A desktop screenshot confirmed the new heading, three button images and MIT/Experimental indicators in GitHub's renderer. All README image elements reported loaded, including GitHub-generated duplicate GIF elements; five native disclosure sections were present. Clicking Explore mods reached `#choose-a-mod`. Opening the Switchboard summary returned `open: true` with its images loaded. Its scrolled screenshot was blank, so that screenshot is not treated as visual acceptance of the expanded gallery. The complete desktop layout, mobile widths and both themes were inspected in the local approximation; the live GitHub mobile/theme combinations were not separately exercised.

GitHub tags and releases APIs both still returned zero. No product code, installer, original capture, account setting or release was changed; no mods were activated and no model inference was executed.

## Animated gallery candidate verification

After the published presentation, Cisco requested more examples or a cycling gallery. The follow-up adds `assets/portfolio/showcase.gif` and `assets/portfolio/screen-share-example.gif`, updates the README/gallery and records the reusable recipe in `docs/portfolio/render-gallery.py`. It does not add new live captures or claim additional runtime acceptance. Cisco reviewed the local result and explicitly authorized commit/push on 4 November 2026. These are pre-publication checks; repository history identifies the resulting commit.

Verification: 59 relative links/images/anchors resolved with exact path casing; local browser rendering loaded 11 images and opened all seven disclosure sections at 1280 px and 375 px, in light and dark, without page-wide overflow. Both new GIFs changed frames during browser playback. All nine montage frames and both Screen-Share comparison frames were visually inspected. Headline/layout screenshots were inspected after image decoding completed. Fine terminal text still benefits from opening the full-size GIF on mobile. Before commit, the links, reviewed GIF hashes, frame counts/durations, size limits and render-recipe syntax were checked again. Live-page read-back follows publication and is not asserted by these pre-publication checks.

`showcase.gif`: 880 × 660, nine frames, 16,200 ms, 415,401 bytes; SHA-256 `2f2ceb01326bae2e16ddb888babff7bb62a61663d44f891df2ad750bc1237242`.

`screen-share-example.gif`: 600 × 500, two frames, 6,000 ms, 33,396 bytes; SHA-256 `a9b6f270cddbe35352e9d5911d35b42eb9a17e48e0163a3c0ece3aa06010d7e7`.

The render used existing FFmpeg 8.1.1 and Pillow 10.4.0, without installing/updating dependencies, mod activation or model inference. The unavailable HyperFrames CLI and fallback are recorded in the media plan. Original captures, installers and product code remain unchanged. Temporary review files were removed after verification.

## Continuation within presentation scope

Cisco approved the second visual candidate and its publication is confirmed above. The subsequent animated gallery is also approved for publication; see the [media plan](media-plan.md). Check the remote commit and live README after push before reporting it published. Live compatibility and new recording remain separate future work.

The invoice data confirmation is complete. Existing captures are reused unchanged; five static presentation SVGs were added after Cisco approved the visual improvements. New recording remains pending; no new public video link exists. Releases, product code changes and paid execution remain outside the publication approval. Preserve concurrent edits.

Suggested skills: task-observer (respect presentation-only write ownership), the-analyst, verification-before-completion; built-in-browser or agent-browser if doing a permitted rendering review. Use handoff for session closure, keeping notes within the authorized presentation paths unless scope is expanded.

Generated artifacts: `docs/portfolio/installation.md`, `media-plan.md`, this evidence/continuation note, the rewritten root README, `assets/portfolio/{install,explore,compatibility,license,experimental}.svg`, `assets/portfolio/{showcase,screen-share-example}.gif`, and `docs/portfolio/render-gallery.py`. No credentials, installed tools or separate deployed resources were created. Public distribution is through the approved repository commits.

Next-session prompt:

```text
Continue the Claude Code Mods presentation candidate. Read README.md and
docs/portfolio/installation.md, docs/portfolio/media-plan.md and
docs/portfolio/evidence.md; inspect git status and diff before editing.
Only README and portfolio/media documentation are owned here.
Check remote publication state and the live README before choosing further work.
Compatibility questions and new recordings remain pending. Do not install mods,
make model calls, change product code or create releases by inference.
Suggested skills: task-observer, the-analyst, verification-before-completion.
```
