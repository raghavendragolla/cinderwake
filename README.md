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

**A run.** Fifteen waves with a boss on every fifth. After the Eclipse you can
bank the run or continue into endless waves, which keep speeding up.

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
- **Dusk tiers.** Clearing the campaign unlocks the next of five harder tiers,
  each adding a rule and 20% more Cinders.
- **Achievements.** Twenty-seven, each paying Cinders once — including a run
  of skill-based ones: your first Perfect dash, 10 and 50 of them, a
  Masterful dash, clearing the campaign in under 12 minutes, and clearing it
  on 3 cards or fewer.
- **Run analysis.** The run-over screen now reads the run back to you: dash
  tiers landed, Perfect dashes, kills per dash, Flame efficiency, any
  synergies in play, your best single moment, and one concrete, reachable
  goal for the next attempt.
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
  beams and a boss mid-lunge — not Husk's instant ground slam, which has no
  travelling hazard to time against.
- "Last Light" only removes the auto-aim-at-nearest-enemy assist, which
  mainly matters on touch; mouse and keyboard play were already manually
  aimed, so the mutation reads weaker there.
- No deterministic seeds, daily challenge, practice arena, or lantern-mastery
  cosmetic tracks yet — all deliberately out of scope for this pass so the
  systems that shipped could be built and tested properly instead of
  everything arriving half-finished.
