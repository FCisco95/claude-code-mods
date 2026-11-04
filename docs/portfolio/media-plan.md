# Portfolio media plan

Status: **existing assets reviewed; new capture pending**. No recording, mod activation, model inference or new external media upload was performed for this candidate. Cisco approved publishing the existing captures and static presentation assets with the documentation on 4 November 2026. Preserve the existing terminal identity and theme colours.

## Existing assets first

All ten files were opened for visual inspection on 4 November 2026. All three frames of each GIF were reviewed. These are existing demonstration captures, not fresh acceptance evidence for the current source. Their exact host version, terminal build and capture procedure are not recorded. On 4 November, Cisco confirmed in this repo session that the invoice data visible in the GIFs, including names, email and phone number, is invented. This is owner confirmation, separate from visual inspection.

| Asset | Dimensions / frames | Visible action and reuse decision |
|---|---|---|
| `assets/hero.png` | 1552 × 390, still | Mod list, diff and agent cards. Reuse inside the expandable overview; text shrinks on mobile. |
| `assets/switchboard.gif` | 1092 × 620, 3 frames | Cache Clock panel visible → hidden → restored through `/mods`. Reuse inside its expandable gallery section; Cisco confirmed the surrounding invoice, names, email and phone number are invented on 4 November 2026. |
| `assets/replay-theater.gif` | 484 × 276, 3 frames | `C:/demo/dates.js`: change import, change date expression, return to prior step. Primary README demonstration. A single narrow crop truncates some long lines. |
| `assets/helper-desk.gif` | 484 × 376, 3 frames | Two agents count README words/list files: running → one finished → both finished. Reuse inside its expandable gallery section. Token counters belong to agent activity, not a free-execution claim. |
| Six PNGs | See below | Keep linked through per-mod docs; no nine-animation wall on the landing page. |

The six stills are `assets/brain-dump.png` (1113 × 320), `cache-clock.png` (1113 × 84), `chat-handoff.png` (1113 × 85), `chat-inventory.png` (544 × 386), `reflect.png` (1551 × 171), and `screen-share.png` (1180 × 394), all under `assets/`. They show a Portuguese clarification question, cache timer, handoff band, demo file/connector inventory, rule-save choice and a fictional invoice before/after masking respectively. Reflect's visible rule concerns em dashes. Inventory includes `context7` and `C:/demo` paths; it is not proof of a new connector call in this audit.

Existing media arrived in commit `97ffc9f`; Switchboard's animated demonstration was added in `7c8cfe3`. The hero and GIFs are separate moments, not one session narrative. Original captures are unchanged.

## Second visual candidate

Following Cisco's approval to continue, the README now has three image links styled as buttons, a primary Replay demonstration, a compact nine-mod table, and native expandable sections for the other demonstrations and engineering detail. This is document navigation, not a JavaScript application or carousel.

Five new presentation assets live in `assets/portfolio/`: `install.svg`, `explore.svg`, `compatibility.svg`, `license.svg` and `experimental.svg`. They are static local SVGs with text labels and matching alt text, no scripts, external fonts, remote badge service or usage counters. Purple follows the existing terminal UI accent. MIT links to the existing license; Experimental links to the evidence matrix and makes no certification claim. Model costs and visual privacy limits stay visible in the main document; extended cost conditions can be expanded.

The original hero is reused in the overview rather than competing with the primary demonstration. New video/still capture remains pending as described below.

## Main walkthrough: 30 seconds, pending

Use a disposable project with an empty synthetic history, titled `mods-demo`. No real project, account history, credential, personal folder, prompt or client data should appear. The following storyboard describes a future real capture, not an executed fixture or generated product UI.

| Time | Input / action | Result to capture |
|---|---|---|
| 0–8 s | `/mods`, hide and show Cache Clock's panel | Mod list and immediate visibility change. Do not toggle installations or Keep warm for this shot. |
| 8–18 s | `/replay`, Next, Prev after synthetic edits to a date helper | File name, removed/added line and step count. Explain that this is review, not undo. |
| 18–27 s | `/helper-desk` during two bounded synthetic tasks: count words and list demo files | Running and finished cards, readable step labels. Underlying agent usage is separate from the mod. |
| 27–30 s | Hold final frame with caption | Exact Claude Code version and source SHA; “Built on early-access API; compatibility varies. UI mods add no model calls; agent work uses normal usage.” |

Reuse existing footage where its context and legibility are adequate. A combined cut must be labelled a montage of existing examples unless the complete flow is captured in one session. Preparing the plan does not authorize generating edits or running agents with paid inference. If no suitable existing synthetic session is available, leave the new capture pending until Cisco explicitly authorizes the required execution.

Planned output, **not yet created**: `assets/portfolio/mods-walkthrough.mp4`. Planned stills: `assets/portfolio/01-mods.png`, `02-replay.png`, `03-helper-desk.png`. Do not add README embeds or a video thumbnail link until the files exist and the public destination/rendering is verified. No new hosting service or upload is assumed.

## Optional Screen-Share example

Use only invented fixture text, for example `Demo Person`, `demo.person@example.test`, `+1 202 555 0100`, `EUR 1250`. Prepare it without reading any real chat. Show `/screen-share on`, then the matching text as bars. A caption must say **“Display-only pattern masking; original content remains visible to the model and stored in the transcript. Not anonymization.”**

Show a harmless invented unmatched token in the prompt box to make a limit visible. Do not imply coverage of secrets, all names, headings, paths, terminal titles or other mods' status lines. Inspect the entire output; learning names happens during drawing, and strings over 500,000 characters are returned unchanged. Keep the existing fictional before/after screenshot unless a new capture adds useful clarity.

Optional output, **pending**: `assets/portfolio/screen-share-limits.png`. No public reference until it exists and passes review.

## Capture and publication acceptance

1. Record capture date, source SHA, exact host version, OS, terminal, columns, theme, installed mod IDs and steps. Record any inference separately. Do not infer these values from the `0.1.0` manifests.
2. Inspect every frame at original size, including title bar, shell prompt, scrollback, tabs, status lines, paths and tool output. Verify fixture ownership; blur is not a substitute for synthetic inputs.
3. Show action and result at a readable pace. Check the README at desktop and 375 px widths in light/dark surrounds; the source captures use a dark terminal. Avoid shrinking multi-pane text into the only demonstration.
4. Check alt text, relative path casing, animation playback, file size and any public video destination before publication. Use a real thumbnail and link only after that destination works.
5. Record the result in [evidence.md](evidence.md). A screenshot/GIF alone does not prove installation, cross-platform compatibility or release status. Publication remains a separate decision in Cisco's repo session.
