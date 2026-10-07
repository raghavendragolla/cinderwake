# Cinderwake

A dash-combat roguelite for the browser. You are the last lantern in an ink-dark
world, and your movement is your only weapon: the dash cuts everything it passes
through, costs Flame, and every kill pays some of that Flame back.

Plain HTML, CSS and JavaScript. No build step, no libraries, no image, font or
audio files, no accounts, no network requests. It costs nothing to run or host.

## Run it locally

Either of these works:

- Double-click `index.html`. The scripts are ordinary `<script>` tags, so the
  game runs straight from the file system.
- Or serve the folder: `python3 -m http.server 8000`, then open
  `http://localhost:8000`.

`dist/cinderwake.html` is the same game as one self-contained file. Rebuild it
with `node tools/bundle.js` after changing anything.

## Deploy for free

**GitHub Pages**

1. Create a repository on GitHub and push this folder to it, with `index.html`
   at the top level.
2. In the repository, open Settings, then Pages.
3. Under "Build and deployment", choose "Deploy from a branch", pick the `main`
   branch and the `/ (root)` folder, and save.
4. After a minute the game is live at `https://<your-name>.github.io/<repo>/`.

**Cloudflare Pages**

1. In the Cloudflare dashboard, open Workers & Pages and create a Pages project.
2. Either connect the GitHub repository, or choose direct upload and drop this
   folder in.
3. If you connected a repository: framework preset "None", leave the build
   command empty, and set the output directory to `/`.
4. Deploy. The game is live at `https://<project>.pages.dev`.

Both hosts serve static files, which is all this game is. Menu labels on either
site may change over time; the settings above are the ones that matter.

## How to play

| | Keyboard and mouse | Touch |
|---|---|---|
| Move | W A S D or arrow keys | Drag on the left side |
| Aim | Mouse | Drag on the right side |
| Dash | Click or Space | Let go of the right thumb (a tap dashes at the nearest enemy) |
| Pause | Esc or P | Pause button, top right |

Without a mouse, Space dashes in the direction you are moving. Menus work with
Tab or the arrow keys, Enter and Esc; card choices also answer to 1, 2, 3 and R.

## Mechanics

- **Flame.** A dash spends Flame (34 of 100 for the starting lantern). Flame
  comes back slowly on its own and quickly from kills: one kill nearly pays for
  the dash, two or more leave you ahead. The ring around the lantern shows one
  bright segment per dash you can afford.
- **Invulnerability.** Nothing can hurt you mid-dash. Shockwaves, beams, bolts
  and crowds are meant to be dashed through.
- **Dash quality.** Every dash is named by what it cut: one kill is Clean, two
  is Sharp, three is Brutal, four or more is Masterful — each a step up in
  pitch, hit-stop, shake and burst, not just a bigger number.
- **Perfect dash.** Pass your blade through a bolt, a shockwave, a sweeping
  beam or a boss mid-lunge and come out the other side untouched: that is a
  Perfect dash. It pays Flame, a moment of hit-stop and slow motion, a touch
  of extra invulnerability, and its own cold chime. Ordinary dashing stays
  the main tool; Perfect dashing is the advanced skill layered on top of it.
- **Combo.** Kills within three seconds of each other build a combo that
  multiplies score, up to three times.
- **Hearts.** Three hits end the run. Beating a boss heals one heart.
- **Warm and cold.** Warm light is always yours. Cold light is always about to
  hurt you.

**Enemies.** Blot (fodder, lines up), Dart (telegraphed lunge, winded after),
Bulwark (front shield, must be cut from behind), Blister (bursts when it dies,
hurting everything nearby), Seer (fires along a sightline), Clot (splits into
three fast clotlings), Husk (three cuts, ground slam), Twins (linked by a
burning thread; dash along it to cut both).

**Elites.** From Dusk 2 on, some enemies are elite, and an elite is never just
bigger numbers — it plays by one new rule: Frenzied (everything about it is
faster), Volatile (bursts on death like a Blister, whatever it is), Armored
(shrugs off the first killing blow), Splitting (dying sets two quick motes
loose), Regenerating (left alone, its wounds close), Hunting (the farther you
run, the faster it closes), Vampiric (mends itself on every hit it lands on
you). Each is marked by its own ring colour and a small glyph above it, never
colour alone.

**Bosses.** The Mire at wave 5 (lunges, shockwaves, broods; a third phase
chains quake into lurch without resting), the Loom at wave 10 (rotating
shields with gaps, bolt patterns, blinks away when cut; a third phase narrows
the gaps and reverses faster), the Eclipse at wave 15 (invulnerable until its
moons are cut, sweeping beam, darkness, every mechanic the campaign taught
you at once).

**Run mutations.** From Dusk 2 on, some late waves carry a mutation instead
of a plain modifier — a real rule change, shown clearly before the wave
starts: Black Rain (bolts fall from above all wave), Hungry Flame (no passive
Flame regen, but kills pay far more), Thin World (the arena closes in as the
wave runs long), Blood Moon (kills refund half Flame, but every third kill is
free), Echo Chamber (every dash echoes once, built for it or not), Last Light
(a shorter light radius, and no auto-aim to lean on).

**A run.** Fifteen waves with a boss on every fifth. Several early and mid
waves (3, 4, 6, 7, 8, 9) pick from two or three encounter variants at the same
difficulty, so a run stays readable but not identical every time — some of
those variants are the named pairs (Bulwark+Blister, Bulwark+Seer, Clot+Seer,
Husk+Blister, Twin+Dart) that ask which enemy to cut first. After the Eclipse
you can bank the run or continue into endless waves, which keep speeding up.
Rarely, a wave also carries a **Cinder Shrine**: two small motes appear, each
labelled with what it grants (a full refill of Flame, or 15 Cinders on the
spot) before you choose — dash into one, or leave both and lose nothing.

## Progression

- **Within a run.** After each wave, choose 1 of 3 cards. Cards belong to five
  builds: Chain (longer, cheaper lines), Trail (burning wakes), Echo (your dash
  repeats itself), Shard (kills throw projectiles) and Guard (deflect, riposte,
  wards), plus plain Lantern cards. Cards from a build you have started are
  somewhat more likely to appear. After each boss, choose a relic.
- **Synergies.** Start two builds and the kit changes, not just the numbers —
  ten pairings exist (Chain+Trail, Echo+Chain, Trail+Shard, Guard+Echo,
  Guard+Chain, Shard+Echo, Trail+Echo, Guard+Trail, Guard+Shard, Chain+Shard).
  A toast names the synergy the moment the second card lands.
- **Between runs.** Runs pay Cinders: 4 per wave cleared, 25 per boss, plus the
  square root of the score times 0.8, multiplied by the Dusk tier. Spend them at
  the Hearth on three more lanterns, ten more cards, two more relics and two
  perks. Nothing at the Hearth is a flat stat boost.
- **Lanterns.** Wick (balanced), Flicker (short cheap dashes), Pyre (hold to
  charge a long, double-damage dash), Glint (blinks and bursts instead of
  cutting a path), Ashen (two hearts, double damage; earned by clearing the
  campaign).
- **Lantern mastery.** Each lantern tracks its own five-level ladder (a run,
  100 kills, 10 Perfect dashes, wave 10, a campaign clear), shown right on its
  card when you pick a lantern. Level 3 quietly adds one thematic card to
  every run with that lantern from then on (a new option, not a stat bump);
  level 5 marks it mastered with a title and a tinted dash trail. A save from
  before mastery existed starts counted fairly — a lantern you'd already
  cleared the campaign with reads as mastered immediately.
- **Discoveries.** The first time ever you meet an elite modifier or complete
  a synergy, a distinct toast names it and it's logged for good — visible
  afterwards in the Bestiary (now showing kills/defeats per enemy and boss)
  and the new build-synergies grid under "How to play".
- **Dusk tiers.** Clearing the campaign unlocks the next of five harder tiers,
  each adding a rule and 20% more Cinders.
- **Achievements.** Twenty-seven, each paying Cinders once — including a run
  of skill-based ones: your first Perfect dash, 10 and 50 of them, a
  Masterful dash, clearing the campaign in under 12 minutes, and clearing it
  on 3 cards or fewer.
- **When the flame fades.** Death isn't just "game over." The run-over screen
  names *why* the run ended — but only from things actually tracked at that
  moment (ran out of Flame with no dash left, was already down to your last
  heart, got caught before finding your footing in a new wave, or simply what
  hit you), never a guess — then reads the run back: dash tiers landed,
  Perfect dashes, damage taken, Flame efficiency, any synergies in play. A
  separate "What you keep" block then shows anything permanent the run
  earned — a mastery level, a new discovery — before your best single moment
  and one concrete, reachable goal for the next attempt.
- **Welcome back.** The main menu remembers your last run ("Last time you
  reached Wave 8 with Flicker, and kept 142 Cinders. Beat it.") so the reset
  reads as a callback, not a blank slate.
- **Continue.** A run is saved at the start of every wave. Quitting to the menu
  keeps it; starting a new run instead banks its Cinders.

## Project layout

```
index.html          page shell: canvas, HUD and every menu screen
css/style.css       interface styles
js/utils.js         maths helpers, palette, DOM helper
js/data.js          lanterns, cards, relics, achievements, Dusk tiers, enemies, waves
js/save.js          localStorage save with validation and recovery
js/audio.js         Web Audio synth: sound effects and generative music
js/input.js         keyboard, mouse and touch
js/fx.js            particles, streaks, stains, camera feedback
js/ai.js            tactical layer: attack-token throttling, an escape-space
                     fairness check, flank/support positioning, adaptive boss
                     attack selection — enemies.js/waves.js/bosses.js degrade
                     gracefully to their own simpler logic if this isn't loaded
js/enemies.js       enemy behaviours
js/bosses.js        the three bosses
js/player.js        stats, movement, dash, blink, taking damage
js/waves.js         wave director and spawn formations
js/game.js          run state, combat resolution, upgrades, rewards
js/render.js        canvas renderer
js/ui.js            menus, overlays and HUD
js/main.js          boot, main loop, pause, global keys
tools/bundle.js     builds dist/cinderwake.html
tools/bot.js        play-test bot
tools/playtest.py   runs the bot in headless Chromium (needs Playwright)
dist/cinderwake.html  single-file build
```

Almost every number worth tuning is in `js/data.js`.

## Testing

`TESTING.md` holds the results of the last automated pass: functional checks run
against the real page in headless Chromium, and full runs played by a bot at
several skill levels, with every frame checked for invalid numbers.

## Known limitations

- Balance was tuned against a bot, not against people. The bot aims better and
  panics less than a new player, and worse than a practised one; expect to want
  to adjust numbers in `js/data.js` after real play.
- Sound was verified to run without errors but was not listened to, because the
  test browser has no audio output. Volumes and timbres are untested by ear.
- Touch controls were tested with emulated touch events, not on a physical
  phone. Only Chromium was tested; Firefox and Safari were not.
- The bot cannot hold a charge, so Pyre's charged dash was only exercised as
  quick taps.
- On a phone held upright the arena is tall and narrow, which makes long dashes
  hit the side walls more often than on a desktop.
- A run is saved at the start of each wave, so closing the tab mid-wave resumes
  from that wave's beginning with the hearts you had then.
- Progress lives in this browser's local storage only. Clearing site data or
  switching browser loses it.
- Perfect-dash detection covers bolts, expanding shockwave rings, sweeping
  beams, a boss mid-lunge, a Dart's lunge and the Twins' thread — not Husk's
  instant ground slam, which has no travelling hazard to time against.
- "Last Light" also hides the Flame ring's dash-count tick marks (so you
  judge Flame by the bar's fill, not an exact count) on top of removing the
  auto-aim assist and dimming the light — the auto-aim half still matters
  more on touch than on mouse/keyboard, which were already manually aimed.
- The Cinder Shrine has one pair of effects (full Flame vs. 15 Cinders); more
  shrine types, between-wave events beyond it, deterministic seeds, a daily
  challenge, challenge-start modes and a practice arena are all still out of
  scope, named rather than silently dropped.
- `js/ai.js` and the `tools/*wave2*`/`tools/ml_experiment.py`/`tools/verify_all.py`
  scripts came from work outside this pass; this document doesn't vouch for
  what they do beyond what's described for `js/ai.js` above, which was read
  and confirmed not to conflict with anything here.
