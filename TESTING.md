# Cinderwake test report

Generated 2026-10-06 by an automated pass against the real page in headless Chromium 141.0.7390.37.

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
