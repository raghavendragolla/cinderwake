# Cinderwake test report

Generated 2026-10-06 by an automated pass against the real page in headless Chromium 141.0.7390.37.

## Meta-loop pass (death screen, mastery, wave variety, discoveries, Cinder Shrine)

Verified after adding: death-cause detection and a restructured "Your flame fades"
game-over screen with a separated permanent-rewards block; a main-menu welcome-back
line; five-level lantern mastery with an L3 starting-card unlock and an L5 title/dash
tint; encounter-variant pools for waves 3/4/6/7/8/9 (including the named enemy-pair
encounters); a redesigned Last Light mutation plus a persistent HUD mutation badge;
lifetime-first discovery toasts for elite modifiers and synergies; per-enemy/per-boss
kill counts in the Bestiary; Personal Records in Statistics; and the Cinder Shrine
between-wave event.

This pass's work landed in the same conversation as unrelated changes from outside
it — a `js/ai.js` tactical layer and several `tools/*wave2*` analysis scripts — which
were reviewed for conflicts (none found; see the README) but are not otherwise
covered by what follows.

- `node --check` on all `js/*.js` files (15, including `js/ai.js`): all pass.
- `python tools/playtest.py`: 36 full bot runs across Wick/Flicker/Glint/Ashen, skills
  0.4-0.8, Dusk 0/2/3/4. Zero page errors, zero invalid-number frames (`bad: null`) in
  every run. The mastery system was confirmed working *organically* through the bot's
  own play: each lantern's L3 starting card (`momentum` for Wick, `fleet` for Flicker,
  `keen` for Glint, `kindling` for Ashen) began appearing in that lantern's `up` list
  partway through the batch, once enough accumulated kills/Perfect dashes crossed the
  threshold within the same browser session — exactly the intended behavior, found
  without having to force it.
- Manual browser pass (served over `http://localhost`, driven via `javascript_tool`,
  screenshots inspected): forced and visually confirmed the restructured death screen
  (title, honest death-cause line, stat grid with Damage taken, the gold-bordered
  "What you keep" block showing a mastery level-up and two discoveries, dash tiers,
  best moment, next goal, "Try again" button); the main-menu welcome-back line
  (correctly suppressed when a run is pending `Continue`, shown otherwise); the
  mutation HUD badge during a Last Light wave; Last Light's flame-tick suppression
  (zoomed screenshot confirms no tick marks on the Flame bar); and the Cinder Shrine's
  two labelled motes rendering correctly.
- Cinder Shrine claim mechanic exercised directly: dashing through the "+15 Cinders"
  mote increased `Save.data.cinders` by exactly 15 and cleared the shrine; a dash that
  didn't reach a mote correctly left the shrine untouched. Confirmed via the real
  `tryDash`/`stepDash` functions, not a mock.
- Console checked throughout the manual pass: zero page-origin errors (one unrelated
  Chrome-extension message, not from the game).
- Not separately exercised: the Cinder Shrine's and wave-variant selection's own RNG
  gating (rare/randomized by design) wasn't forced through the bot, since the bot
  doesn't log which variant or whether a shrine appeared in a given run; their
  *safety* is still covered by the 36 error-free runs above, several of which were
  long enough (wave 9+) to have passed through eligible waves.

## Deep-core upgrade pass (Perfect Dash, synergies, elite mods, mutations, boss phase 3, run analysis)

Re-verified after adding Perfect Dash + dash-quality tiers, 10 build synergies, 7 elite
modifiers, 6 run mutations, a third phase for the Mire and the Loom, a richer
game-over screen, and 7 new skill-based achievements.

- `node --check` on all 14 `js/*.js` files: all pass.
- `python tools/playtest.py` (Playwright/Chromium, installed for this pass — was not
  present before): 25 full bot runs across Wick/Pyre/Glint/Flicker, skills 0.3-0.9,
  Dusk 0/2/3/4/5. Zero page errors, zero invalid-number frames (`bad: null`) in every
  run. 20 of 25 runs reached a normal end state (campaign clear or a clean death); the
  rest are the bot's known early-death pattern on harder Dusk tiers (hits a `ring`,
  `blast`, `mire` or `beam` before building a kit), not a new issue.
- One run (Dusk 2, skill 0.7) hit the bot's step ceiling stuck on wave 13 with two
  Husks still in their approach state; re-running the identical settings six more
  times did not reproduce it. Logged as bot-pathing flakiness, not confirmed as a
  regression — the project's own bot is a weaker, differently-skilled player than a
  human (see "Known limitations" in the README) and has always had rare stalls of
  this kind.
- Confirmed in the bot logs: the new "gambit" relic (Last Gambit, double dash damage
  for double heart loss on a hit) was taken and survived to a campaign clear more than
  once, including a kit with 3 hearts intact afterward.
- Not re-run through the bot: Perfect dash, synergy unlocks and the new mutations are
  not something the bot deliberately seeks out, so their *triggering* was verified by
  code review and a manual browser pass instead of bot statistics; their *safety*
  (no crashes, no invalid numbers) is covered by the runs above, since Dusk 2+ and
  wave 6+ make mutations and elite modifiers a routine part of what the bot already
  played through.

## Functional checks

| Check | Result | Note |
|---|---|---|
| Page loads and shows the main menu | PASS |  |
| New run starts from the keyboard alone (Enter, Enter) | PASS |  |
| Keyboard movement (D moves right) | PASS |  |
| Keyboard dash (Space) | PASS |  |
| Mouse aim and click dash kills an enemy and refunds Flame | PASS |  |
| Pause and resume with Esc | PASS |  |
| Restart from the pause menu settles the old run and starts a new one | PASS |  |
| Card pick, wave 2, save and quit, reload, Continue resumes wave 2 with the card | PASS |  |
| Death shows the summary, clears the saved run, and Enter plays again | PASS |  |
| Hearth purchase and a settings change both survive a reload | PASS |  |
| Erase progress (two presses) resets everything except settings | PASS |  |
| Unparseable save: game still boots, bad data set aside | PASS |  |
| Save with wrong types and out-of-range values is sanitised field by field | PASS |  |
| Every menu screen opens, Esc returns to the main menu, arrow keys move focus | PASS |  |
| With storage blocked the game still runs (progress kept in memory only) | PASS |  |
| prefers-reduced-motion turns off shake, slow motion and flashes by default | PASS |  |
| Phone: run starts by tapping | PASS |  |
| Phone: left-thumb drag moves the lantern | PASS |  |
| Phone: right-thumb drag upward and release dashes upward | PASS |  |
| Phone: a tap on the right dashes | PASS |  |
| Phone: page cannot scroll during play | PASS |  |
| Single-file build (dist/cinderwake.html) boots and starts a run | PASS |  |
| 31 full bot runs: no invalid numbers, no soft-locks, every run ended normally | PASS | [] |
| No console errors or uncaught exceptions in any test page | PASS | [] |

## Bot play-through

Each run is a whole game played by `tools/bot.js` through the real update loop at a fixed 60 steps per second, with card choices made at random. The bot checks the player and every enemy for non-finite numbers on every frame. Skill sets its aim error, how often it re-plans movement and how many threats it notices.

| Setting | Runs | Wave reached | Campaign clears | Avg run (s) | Avg hits taken | Avg Cinders | Best single dash |
|---|---|---|---|---|---|---|---|
| Wick, weak bot | 5 | 7/7/8/3/5 | 0 | 99 | 4.2 | 104 | 6 |
| Wick, average bot | 5 | 15/5/15/15/15 | 4 | 322 | 2.6 | 283 | 10 |
| Wick, strong bot | 5 | 12/11/15/15/5 | 2 | 247 | 2.6 | 243 | 7 |
| Flicker, average bot | 3 | 15/5/4 | 1 | 159 | 3.0 | 176 | 4 |
| Pyre (taps only), average bot | 2 | 5/10 | 0 | 126 | 2.5 | 122 | 5 |
| Glint, average bot | 3 | 15/10/11 | 1 | 256 | 4.0 | 253 | 7 |
| Ashen, average bot | 3 | 12/15/15 | 2 | 297 | 1.7 | 326 | 7 |
| Wick on Dusk 5, strong bot | 3 | 5/15/5 | 1 | 213 | 2.0 | 432 | 8 |
| Wick endless to wave 31, strong bot | 2 | 5/31 | 1 | 682 | 4.0 | 565 | 6 |

A bot run is quicker than a person's: it never hesitates between dashes. Expect a human campaign to take roughly half as long again.

## Not covered

- Sound was not listened to (the test browser has no audio output); only that audio code runs without errors.
- Touch was emulated, not tried on a physical device. Firefox and Safari were not tested.
- The bot cannot hold a charge, so Pyre's charged dash was exercised only as taps.
- Balance has not been tried by human players.

## Input-integrity pass (Phase 1 — critical input & simulation fixes)

Fixed the release-blocking regressions found by the independent Chromium audit:
keyboard/touch double-dashing (one gesture produced two dashes), touch dashing on
touch-down instead of on release, mouse dash distance ignoring the lantern's
intended `dashDist`, the AI fairness check marking the top/bottom walls in
inverted directions, and a test bot whose input model (press-only, forced
mouse semantics, always-nominal dash lengths) could never have caught any of it.

- `node --check` on all 15 `js/*.js` files plus `tools/bot.js` and `tools/bundle.js`: all pass.
- New `tools/test_input_parity.py` (28 probes on source, 11 core probes on dist): ALL PASS.
  Real DOM `KeyboardEvent`/`PointerEvent` through the game's own listeners, fixed-timestep
  stepping for determinism. Proves: keyboard tap = 1 dash (Flame 100→72, not 100→38),
  keyboard hold + OS-repeat = 1 dash, keyup dashes nothing, touch-down = 0 dashes,
  drag aims then release = exactly 1 dash along the drag, tap = 1 dash at the nearest,
  touch-down starts a Pyre charge but never a dash, mouse click = 1 dash on release,
  dash length equals cursor distance when shorter and exactly `dashDist` when longer
  (near 120 → 120, far 600 → 235; Flicker 152 restored; Glint blink capped at 285 and
  honoring a near 120; Pyre full charge 450 / quick tap ≈ 175 with a 150 floor;
  Reach +14% now effective under a mouse: 267.9), and the fairness check marks
  top/bottom/left/right walls in the correct sectors, symmetrically.
- New `tools/test_human_input.py`: ALL PASS — the same contract driven through Playwright's
  real keyboard, mouse and touch pipelines against the live rAF loop.
- `tools/bot.js` no longer pokes dash state: decisions start a per-profile gesture
  ("key" / "mouse" / "touch") emitting the same edges a real device would. Smoke runs
  per profile (skill 0.75, to wave 8) each played a clean run — 218/220/221 kills,
  0 page errors, no invalid numbers.
- Existing suites re-run after the changes: `check_desktop.py` (7 viewports) ALL PASS;
  `check_mobile.py` (5 viewports) ALL PASS; `check_screens.py` no overflow;
  `test_polish_and_rekindle.py` (Rekindle state machine, clot stagger, wave-11 intro,
  synergy badges, floating stick) ALL PASS; `test_all_waves_and_five_runs.py` 4/5 campaign
  clears with 0 page errors (the fifth died at wave 12 — the bot's documented variance);
  `verify_all.py` ALL PASS including save migration, Perfect Dash against all seven
  hazard types, and a full campaign played inside `dist/cinderwake.html` with zero
  invalid-number frames.
- `dist/cinderwake.html` rebuilt via the now-single canonical path (`tools/build.py`
  delegates to `tools/bundle.js`; the old duplicate Python implementation that produced
  drifting whitespace/line-endings was removed). The parity suite runs against the dist
  file itself, so bundle and source are proven to behave identically.
- Balance numbers are UNTOUCHED in this pass, as required: all previous bot-derived
  balance conclusions were produced by the inaccurate input model and must be
  re-evaluated before any tuning is trusted.

## Phase 2 — balance, human-playability & fairness pass

Measured first with the corrected gesture model (Phase 1), changed second, re-tested third.

Baseline: 390 full bot campaigns (`tools/balance_baseline.py`, 150 lantern / 180 input-profile /
60 build-intent runs, skills 0.5–0.9, Dusk 0, per-wave telemetry now logged by `tools/bot.js`).
Findings: keyboard, mouse and touch are equitable (Wick 70/70/77 % clears, Flicker 57/60/63 %);
waves 11–12 are the game's intrinsic hit-peak (1.13 / 1.07 hits per isolated attempt with a fixed
mid-game kit, vs 0.13 / 0.00 on waves 13–14 — an inverted late curve); Flicker is the weakest
survivor but its rekindle rate (43–53 %) shows Last Ember doing its job; build-intent runs formed
real kits (checked per-run `up` lists) and measured Trail strongest (83 %) and Shard weakest (8 %
of 12 runs) — Shard got a small range tweak (shard life 0.55 s → 0.7 s), nothing else was buffed.

A harness bug was found and fixed during the baseline: the touch gesture set `Input.touch` and
nothing cleared it between bot runs, so the config following a touch batch (flicker-mouse) aimed
by auto-aim and starved; `playRun` now scopes `Input.touch` to the run's profile. The pre-fix
flicker-mouse rows (7 % clears) were an artifact, not game behavior — post-fix all six
profile/lantern configs sit in a fair band.

Targeted changes made (all evidence-gated):
- Wave 11 budget 88 → 82 in all three variants (isolated re-test: clears 13→14/15, hit-free
  6→8/15). Wave 11 remains the hardest non-boss wave by design; waves 12–14 left untouched.
- Last Ember target selection now ranks by distance plus reachability penalties (a Bulwark
  shield facing you +150, a boss +260, a cloaked Lurker +90) so an awkward target only wins
  when nothing better is alive; no-enemy fallback unchanged. `tools/test_rekindle_targets.py`
  (10 scenarios) ALL PASS, including boss-only and no-target cases.
- Coordinator readability: its pulse now marks steered allies with a fading gold ring
  (`markT`, rendered in render.js), plays a quiet two-note command chirp (`Sfx.command`),
  and its Bestiary tip says what the mark means. Effect mechanics unchanged.
- Truth pass: Pyre's "Full charge: double damage" → "Full charge: +1 damage" (and the lantern
  description wording); all other card/lantern descriptions were re-verified against code.

Regressions after the changes: `node --check` all files; `test_input_parity.py` 39/39 (source +
dist); `test_human_input.py` 3/3 with exact near/far assertions; `test_rekindle_targets.py` 10/10;
`test_polish_and_rekindle.py` ALL PASS; `check_desktop.py` 7/7 and `check_mobile.py` 5/5;
`verify_all.py` ALL PASS (0 page errors — save migration, Perfect Dash vs all seven hazard
types, wave-11–14 stress, full campaign inside dist); `test_all_waves_and_five_runs.py` 5/5
campaign clears, 0 page errors. dist rebuilt via the canonical bundler and covered by the
parity suite directly.

Not covered: human playtesting (the observation screenshots in this pass were AI-driven);
wave-11's small-sample hit-rate in campaign context is noisy (33 %→43 % at n=51 with a
different modifier mix) — the isolated A/B is the reliable read.

## Phase 2.5 — release-candidate stabilization

Verified read-only that the Phase 2 state is intact (wave 11 budget 82; Rekindle scoring with
bulwark/boss/lurker penalties; Coordinator markT + command chirp + intact side-flip effect; shard
life 0.7 s; Pyre "+1 damage"; mouse dash `clamp(aimDist, 40, S.dashDist)`; keyboard/mouse/touch
edge contract), then re-ran the full suite: syntax 15/15; input parity 39/39 source + 11/11 dist;
human-input 3/3; Rekindle targets 10/10; polish+Rekindle 8/8; verify_all 8/8 groups (0 page
errors); five-lantern campaigns 4/5 clears with 0 errors (one wave-11 death at documented bot
variance); desktop viewports 7/7; mobile viewports 5/5; an extended 11-viewport matrix including
tablets (1024×1366, 820×1180, 768×1024) and small phones (375×812) — all PASS for overflow, HUD
bounds, menu/card/game-over usability and finite play.

Audio (functional, not by ear): instrumented a real run — dash ×80, kill ×98, Flame-refund motes
×318, telegraphs ×12, boss intro/hit/die, wave transitions, achievements, 7 organic Perfect Dash
chimes all fired; forced Last-Ember / Rekindle / Coordinator chirp all ran clean; per-event
volumes 0.03–0.4 on a compressed master bus (compressor present, master 0.8); peak node-start
bursts ~73/100 ms occur during music catch-up + multi-kill stacks — no clipping confirmable
without listening. Listening verified: NO.

Performance: 36k-step synchronous deep run + 75 s live-rAF sampling — entity maxima all under
their caps (enemies 13/20, bolts 1/160, shards 27/90, particles 400/520, rings 22/60), heap flat
at 10 MB (quantized buckets — no measurable growth), headless median fps ≈ 56 with no in-game
degradation trend. Human playtesting instrumentation: the death screen now also shows
"Rekindle used"; `HUMAN_PLAYTEST.md` added as the test sheet. Human playtesting performed: NO.

## Phase 2.5 — FINAL STATUS UPDATE (blocks the section above)

The stabilization pass above completed and verified green, but **while it was running a
concurrent writer modified the repository again** (16:47–16:50): `js/player.js` dash-length
helpers were rewritten from the specified `clamp(aimDist, 40, S.dashDist)` to
`clamp(aimDist, S.dashDist, max(dashDist, arena diagonal × 2))` (every mouse dash at least
full lantern length, no ceiling), the `js/render.js` aim-guide wall clamp was removed, and
`tools/test_human_input.py`'s exact near/far assertions were replaced with loose ones that
pass under the changed behavior. The dist bundle rebuilt at 16:55 therefore contains the
unsanctioned contract, and the parity suite correctly fails 11 distance probes against both
source and dist.

The Phase 2.5 verification results above (audio, performance, viewports, Rekindle tests,
save/mastery/Perfect-Dash suites) were all captured against the compliant Phase 2 state before
this intervention and remain valid as measurements of that state. The frozen release-candidate
build does not currently exist: **Phase 2.5 verdict is BLOCKED by concurrent modification**
until one writer owns `js/player.js`, `js/render.js` and `tools/test_human_input.py` and the
dash-distance contract is fixed by decision, not by whichever process writes last.

## Phase 2.5 — RECOVERY & FREEZE (final)

The concurrent writer was stopped by the user; exclusive single-writer ownership was verified
(two snapshots 60 s apart, no writes for 18+ minutes). The specified contract was then restored:
`dashLengthFor`/`blinkLengthFor` back to `clamp(aimDist, 40, S.dashDist)`, the aim-guide wall
clamp re-applied, and `tools/test_human_input.py`'s exact near/far assertions re-applied. No
80-unit minimum, no uncapped ceiling, no other behavior changed.

Full regression on the restored state: input parity 39/39 (source + dist); real-browser input
3/3 (keyboard one-press-one-dash, mouse near 120/far 235 exactly, touch tap/drag-release);
Rekindle targets 10/10; polish+Rekindle 8/8; verify_all ALL PASS (0 page errors); five-lantern
campaigns 4/5 clears, 0 errors (one wave-12 death at documented bot variance); desktop 7/7 and
mobile 5/5 viewports; final-build distance matrix on dist itself 9/9 (Wick near 120 / far 235,
Flicker 152, Pyre full charge 450, Glint blink 285 capped / 110 near honored, Ashen 235,
Reach 267.9). dist rebuilt via `node tools/bundle.js` (canonical) at 17:16 and covered by parity.

**FROZEN at this state for human playtesting. No further gameplay changes until human feedback.**
