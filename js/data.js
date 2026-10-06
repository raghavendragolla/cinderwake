"use strict";
/* Cinderwake — all tunable content lives here: lanterns, cards, relics,
   achievements, Dusk tiers, enemy facts and the wave table. */

const CAMPAIGN_WAVES = 15;
const DASH_SPEED = 1750; // arena units per second

/* ------------------------------------------------------------ Lanterns */
/* cost = Flame per dash, dist = dash length, refund = Flame per dash kill. */
const LANTERNS = {
  wick: {
    id: "wick", name: "Wick", tag: "The steady flame",
    desc: "One clean, long cut. The balanced way to learn the blade.",
    hearts: 3, flame: 100, cost: 34, dist: 235, width: 15, dmg: 1, speed: 255, regen: 10, refund: 22,
    facts: ["Long dash", "3 dashes on a full Flame"],
    masteryCard: "momentum", masteryRGB: "255,217,138", masteryTitle: "The Steadfast Flame",
  },
  flicker: {
    id: "flicker", name: "Flicker", tag: "Three short breaths",
    desc: "Short, cheap dashes. Stitch kills together one stroke at a time.",
    hearts: 3, flame: 100, cost: 18, dist: 152, width: 14, dmg: 1, speed: 275, regen: 10, refund: 15,
    price: 120,
    facts: ["Short dash", "5 dashes on a full Flame", "Moves faster"],
    masteryCard: "fleet", masteryRGB: "134,182,255", masteryTitle: "Quickwick",
  },
  pyre: {
    id: "pyre", name: "Pyre", tag: "The drawn bow",
    desc: "Hold to charge, release to fly. A full charge crosses the arena and cuts twice as deep.",
    hearts: 3, flame: 100, cost: 38, dist: 450, distMin: 150, width: 16, dmg: 1, speed: 245, regen: 10, refund: 21,
    charge: 0.6, price: 320,
    facts: ["Hold to charge", "Full charge: double damage", "Slow while charging"],
    masteryCard: "heavy", masteryRGB: "255,90,50", masteryTitle: "The Bowmaster",
  },
  glint: {
    id: "glint", name: "Glint", tag: "Here, then there",
    desc: "Blink to your aim point and burst. No path to cut along, only the place you arrive.",
    hearts: 3, flame: 100, cost: 36, dist: 285, width: 15, burst: 82, dmg: 1, speed: 255, regen: 10, refund: 16,
    blink: true, price: 550,
    facts: ["Blinks instead of dashing", "Bursts on arrival", "Aim at crowds, not lines"],
    masteryCard: "keen", masteryRGB: "205,140,255", masteryTitle: "Between Blinks",
  },
  ashen: {
    id: "ashen", name: "Ashen", tag: "Burns twice as bright",
    desc: "Two hearts. Every cut lands twice as hard and feeds more Flame.",
    hearts: 2, flame: 100, cost: 34, dist: 235, width: 15, dmg: 2, speed: 262, regen: 10, refund: 27,
    needAch: "clear",
    facts: ["Only 2 hearts", "Double dash damage", "Richer Flame refunds"],
    masteryCard: "kindling", masteryRGB: "225,225,220", masteryTitle: "Twice-Burned",
  },
};
const LANTERN_ORDER = ["wick", "flicker", "pyre", "glint", "ashen"];

/* ------------------------------------------------------------- Upgrades */
/* build: chain | trail | echo | shard | guard | util | relic
   rarity: c common, u uncommon, r rare.  price: Cinders to add the card to
   the pool at the Hearth (absent = available from the start).            */
const BUILD_NAMES = {
  chain: "Chain", trail: "Trail", echo: "Echo", shard: "Shard", guard: "Guard", util: "Lantern", relic: "Relic",
};

const UPGRADES = [
  // Chain — reward long lines
  { id: "momentum", name: "Momentum", build: "chain", rarity: "c", max: 3,
    desc: ["Each kill extends your dash by 40.", "Each kill extends your dash by 60.", "Each kill extends your dash by 80."] },
  { id: "kindling", name: "Kindling", build: "chain", rarity: "c", max: 3,
    desc: ["+5 Flame from every kill.", "+10 Flame from every kill.", "+15 Flame from every kill."] },
  { id: "fever", name: "Fever", build: "chain", rarity: "u", max: 1, price: 80,
    desc: ["Killing 3 or more in one dash makes your next dash free and quickens your step."] },

  // Trail — hold ground with fire
  { id: "wake", name: "Scorched wake", build: "trail", rarity: "c", max: 3,
    desc: ["Your dash leaves a burning trail for 2 seconds.", "The trail burns for 3 seconds and is wider.", "The trail burns for 4 seconds and is wider still."] },
  { id: "backdraft", name: "Backdraft", build: "trail", rarity: "u", max: 1, req: "wake", price: 100,
    desc: ["When a trail burns out, it detonates along its length."] },
  { id: "wildfire", name: "Wildfire", build: "trail", rarity: "u", max: 1, req: "wake", price: 120,
    desc: ["Enemies killed by fire leave a burning patch behind."] },

  // Echo — your past self cuts again
  { id: "echo", name: "Afterimage", build: "echo", rarity: "u", max: 2,
    desc: ["Half a second after each dash, an echo repeats it.", "A second echo follows the first."] },
  { id: "crosscut", name: "Crosscut", build: "echo", rarity: "u", max: 1, price: 90,
    desc: ["Every dash is crossed by a second cut through its middle."] },
  { id: "resonance", name: "Resonance", build: "echo", rarity: "u", max: 1, req: "echo", price: 100,
    desc: ["Echo kills refund full Flame instead of half."] },

  // Shard — kills throw projectiles
  { id: "splinter", name: "Splinter", build: "shard", rarity: "c", max: 3,
    desc: ["Each dash kill throws 2 shards at nearby enemies.", "Each dash kill throws 3 shards.", "Each dash kill throws 4 shards."] },
  { id: "ricochet", name: "Ricochet", build: "shard", rarity: "u", max: 1, req: "splinter", price: 90,
    desc: ["Shards bounce to a second enemy."] },
  { id: "starburst", name: "Starburst", build: "shard", rarity: "u", max: 1, price: 70,
    desc: ["Killing 3 or more in one dash releases a ring of 10 shards."] },

  // Guard — turn their attacks into openings
  { id: "deflect", name: "Deflect", build: "guard", rarity: "u", max: 1, minWave: 5,
    desc: ["Dashing through a bolt sends it back at them and returns 8 Flame."] },
  { id: "riposte", name: "Riposte", build: "guard", rarity: "u", max: 1,
    desc: ["Cutting an enemy mid-attack deals +2 damage and returns 14 Flame."] },
  { id: "breaker", name: "Shieldbreaker", build: "guard", rarity: "u", max: 1, minWave: 2, price: 80,
    desc: ["Your dash shatters shields instead of bouncing off them."] },
  { id: "ward", name: "Ward", build: "guard", rarity: "u", max: 1,
    desc: ["A ward absorbs one hit. It returns at the start of each wave."] },
  { id: "flare", name: "Flare", build: "guard", rarity: "c", max: 1,
    desc: ["When you are hit, a blast scorches everything near you and refills your Flame."] },

  // Lantern — plain, reliable improvements
  { id: "longwick", name: "Long wick", build: "util", rarity: "c", max: 3,
    desc: ["+25 maximum Flame.", "+50 maximum Flame.", "+75 maximum Flame."] },
  { id: "oil", name: "Lamp oil", build: "util", rarity: "c", max: 3,
    desc: ["Flame regenerates 35% faster.", "Flame regenerates 70% faster.", "Flame regenerates 105% faster."] },
  { id: "fleet", name: "Fleetfoot", build: "util", rarity: "c", max: 3,
    desc: ["Move 10% faster.", "Move 20% faster.", "Move 30% faster."] },
  { id: "reach", name: "Reach", build: "util", rarity: "c", max: 3,
    desc: ["Dash 14% farther.", "Dash 28% farther.", "Dash 42% farther."] },
  { id: "keen", name: "Wide edge", build: "util", rarity: "c", max: 2,
    desc: ["Your cut is 35% wider.", "Your cut is 70% wider."] },
  { id: "heart", name: "Heartwick", build: "util", rarity: "r", max: 2,
    desc: ["+1 maximum heart, and heal 1.", "+1 more maximum heart, and heal 1."] },
  { id: "mend", name: "Mend", build: "util", rarity: "u", max: 99, consumable: true,
    desc: ["Heal 2 hearts now."] },
  { id: "soot", name: "Soot purse", build: "util", rarity: "u", max: 2,
    desc: ["Earn 35% more Cinders this run.", "Earn 70% more Cinders this run."] },
  { id: "heavy", name: "Heavy cut", build: "util", rarity: "r", max: 1, price: 150,
    desc: ["+1 dash damage. Each dash costs 8 more Flame."] },
  { id: "glass", name: "Glass wick", build: "util", rarity: "r", max: 1, price: 120, cursed: true,
    desc: ["+1 dash damage and +8 Flame per kill, but lose 1 maximum heart."] },

  // Relics — one after each boss
  { id: "phoenix", name: "Phoenix feather", build: "relic", relic: true, max: 1,
    desc: ["Once per run, rise from death with 2 hearts and a blast."] },
  { id: "storm", name: "Cinder storm", build: "relic", relic: true, max: 1,
    desc: ["Every 10th kill releases a nova around you."] },
  { id: "timewick", name: "Slow wick", build: "relic", relic: true, max: 1,
    desc: ["Killing 3 or more in one dash slows every enemy for 2 seconds."] },
  { id: "rebound", name: "Rebound", build: "relic", relic: true, max: 1,
    desc: ["A dash started within half a second of your last costs half."] },
  { id: "overheat", name: "Overheat", build: "relic", relic: true, max: 1, price: 140,
    desc: ["Flame can overfill by 50. While overfilled, your dash deals +1 damage."] },
  { id: "undertow", name: "Undertow", build: "relic", relic: true, max: 1, price: 140,
    desc: ["Your dash drags nearby enemies into its path."] },
  { id: "gambit", name: "Last Gambit", build: "relic", relic: true, max: 1, cursed: true,
    desc: ["Dash damage is doubled, but every hit you take costs 2 hearts instead of 1."] },
];
const UP = {};
for (const u of UPGRADES) UP[u.id] = u;

/* ----------------------------------------------------------- Synergies */
/* Two builds, both started, change how the kit plays rather than just
   stacking numbers. `need` names two build ids from BUILD_NAMES.         */
const SYNERGIES = [
  { id: "ashwake", name: "Ashwake", need: ["chain", "trail"],
    desc: "Chain-extending kills refresh your burning trail to full life." },
  { id: "doublecut", name: "Doublecut", need: ["echo", "chain"],
    desc: "Echoes inherit the dash's momentum extension." },
  { id: "cinderthrow", name: "Cinderthrow", need: ["trail", "shard"],
    desc: "Standing trail fire flings a shard at nearby enemies as it burns." },
  { id: "wardedecho", name: "Warded Echo", need: ["guard", "echo"],
    desc: "An absorbed Ward hit spawns an echo burst where you were struck." },
  { id: "riposteMomentum", name: "Riposte Momentum", need: ["guard", "chain"],
    desc: "Riposte hits extend your dash just like a chain kill." },
  { id: "splitfire", name: "Splitfire Echo", need: ["shard", "echo"],
    desc: "Echo kills throw shards too." },
  { id: "twinflame", name: "Twin Flame", need: ["trail", "echo"],
    desc: "Each echo leaves its own short burning wake." },
  { id: "bulwarkash", name: "Bulwark's Ash", need: ["guard", "trail"],
    desc: "A Ward break or Flare ignites a burning ring instead of just a shove." },
  { id: "thornward", name: "Thornward", need: ["guard", "shard"],
    desc: "A Ward break or Flare also fires a ring of shards." },
  { id: "shattercut", name: "Shattercut", need: ["chain", "shard"],
    desc: "A dash that kills 3 or more fires a ring of shards, even without Starburst." },
];
const SYN = {};
for (const s of SYNERGIES) SYN[s.id] = s;
/** Builds the player has actually put a card into. */
function activeBuilds(run) {
  const out = {};
  for (const id in run.up) {
    const u = UP[id];
    if (u && !u.relic && u.build !== "util") out[u.build] = true;
  }
  return out;
}
/** Which synergy ids are live for this set of builds. */
function activeSynergies(run) {
  const builds = activeBuilds(run), out = [];
  for (const s of SYNERGIES) if (builds[s.need[0]] && builds[s.need[1]]) out.push(s.id);
  return out;
}

/* ------------------------------------------------------ Lantern mastery */
/* One shared ladder, since the tracked numbers are comparable in scale
   across lanterns. A level is reached independently of the others below it
   (a save from before mastery existed may already have clears>=1 with the
   newer counters at zero — that player has earned Level 5, full stop).    */
const MASTERY_LEVELS = [
  { id: 1, name: "Level 1", desc: "Complete a run.", check: (b) => b.runs >= 1 },
  { id: 2, name: "Level 2", desc: "Cut down 100 enemies.", check: (b) => b.kills >= 100, prog: (b) => [b.kills, 100] },
  { id: 3, name: "Level 3", desc: "Land 10 Perfect dashes.", check: (b) => b.perfectDashes >= 10, prog: (b) => [b.perfectDashes, 10],
    reward: "Unlocks a starting card for this lantern." },
  { id: 4, name: "Level 4", desc: "Reach wave 10.", check: (b) => b.wave >= 10, prog: (b) => [b.wave, 10] },
  { id: 5, name: "Level 5", desc: "Clear the campaign.", check: (b) => b.clears >= 1,
    reward: "A title, and a marked dash trail." },
];
/** Highest level reached, or 0. Not sequential — see the comment above. */
function masteryLevel(b) {
  if (!b) return 0;
  let lvl = 0;
  for (const L of MASTERY_LEVELS) if (L.check(b)) lvl = Math.max(lvl, L.id);
  return lvl;
}

/* -------------------------------------------------------------- Perks */
const PERKS = {
  reroll: { id: "reroll", name: "Second look", price: 200, desc: "One extra reroll of card choices each run." },
  kindled: { id: "kindled", name: "Kindled start", price: 300, desc: "Begin every run with one random common card." },
};
const KINDLED_POOL = ["momentum", "kindling", "longwick", "oil", "fleet", "reach", "wake", "splinter"];

/* ------------------------------------------------------- Achievements */
/* prog(stats) -> [current, goal] for lifetime achievements shown as bars. */
const ACHIEVEMENTS = [
  { id: "firstcut", name: "First cut", desc: "Cut down an enemy.", reward: 10 },
  { id: "triple", name: "Three in a breath", desc: "Kill 3 enemies with one dash.", reward: 20 },
  { id: "quint", name: "Clean line", desc: "Kill 5 enemies with one dash.", reward: 40 },
  { id: "octo", name: "Calligraphy", desc: "Kill 8 enemies with one dash.", reward: 80 },
  { id: "combo25", name: "Kindled", desc: "Reach a 25 kill combo.", reward: 25 },
  { id: "combo60", name: "Conflagration", desc: "Reach a 60 kill combo.", reward: 60 },
  { id: "everycut", name: "Every cut counts", desc: "Clear a wave of 10 or more kills without a single wasted dash.", reward: 40 },
  { id: "flawless3", name: "Untouchable", desc: "Clear 3 waves in a row without being hit.", reward: 30 },
  { id: "demolition", name: "Demolition", desc: "Kill 4 enemies with one explosion.", reward: 30 },
  { id: "mire", name: "Out of the mud", desc: "Defeat the Mire.", reward: 30 },
  { id: "loom", name: "Cut the thread", desc: "Defeat the Loom.", reward: 50 },
  { id: "clear", name: "First light", desc: "Defeat the Eclipse and clear all 15 waves.", reward: 100 },
  { id: "flawlessboss", name: "Not a scratch", desc: "Defeat any boss without being hit.", reward: 60 },
  { id: "endless20", name: "Past the edge", desc: "Reach wave 20.", reward: 60 },
  { id: "endless30", name: "No dawn", desc: "Reach wave 30.", reward: 100 },
  { id: "dusk3", name: "Deepening", desc: "Clear the campaign on Dusk 3 or higher.", reward: 100 },
  { id: "dusk5", name: "Midnight", desc: "Clear the campaign on Dusk 5.", reward: 200 },
  { id: "backstab", name: "Mind the back", desc: "Cut down 40 Bulwarks.", reward: 30, prog: (s) => [s.bulwarkKills, 40] },
  { id: "reflect", name: "Return to sender", desc: "Send back 25 bolts.", reward: 30, prog: (s) => [s.reflects, 25] },
  { id: "kills1k", name: "Lamplighter", desc: "Cut down 1,000 enemies.", reward: 50, prog: (s) => [s.kills, 1000] },
  { id: "collector", name: "Full shelf", desc: "Own every lantern.", reward: 80 },
  { id: "perfect1", name: "Through the needle", desc: "Land a perfect dash.", reward: 20 },
  { id: "perfect10", name: "Steady hand", desc: "Land 10 perfect dashes.", reward: 40, prog: (s) => [s.perfectDashes, 10] },
  { id: "perfect50", name: "Untouched by your own fire", desc: "Land 50 perfect dashes.", reward: 90, prog: (s) => [s.perfectDashes, 50] },
  { id: "masterful", name: "Masterful", desc: "Kill 4 or more with a single dash.", reward: 25 },
  { id: "speedclear", name: "No time to lose", desc: "Clear the campaign in under 12 minutes.", reward: 70 },
  { id: "minimalist", name: "Bare wick", desc: "Clear the campaign having taken 3 or fewer cards.", reward: 70 },
];
const ACH = {};
for (const a of ACHIEVEMENTS) ACH[a.id] = a;

/* --------------------------------------------------------- Dusk tiers */
/* Each tier keeps every rule of the tiers below it. */
const DUSK_TIERS = [
  { name: "Twilight", rule: "The standard descent." },
  { name: "Dusk 1", rule: "Enemies move 12% faster." },
  { name: "Dusk 2", rule: "Hardened elites join every wave." },
  { name: "Dusk 3", rule: "Flame regenerates 35% slower." },
  { name: "Dusk 4", rule: "Bosses have 35% more health and attack faster." },
  { name: "Dusk 5", rule: "Start with one less heart. Waves are larger." },
];
function duskMods(tier) {
  return {
    tier,
    speedMult: tier >= 1 ? 1.12 : 1,
    eliteChance: tier >= 2 ? 0.14 : 0,
    regenMult: tier >= 3 ? 0.65 : 1,
    bossHp: tier >= 4 ? 1.35 : 1,
    bossSpeed: tier >= 4 ? 1.2 : 1,
    heartPenalty: tier >= 5 ? 1 : 0,
    budgetMult: tier >= 5 ? 1.15 : 1,
    cinderMult: 1 + 0.2 * tier,
  };
}

/* ------------------------------------------------------------ Enemies */
/* cost = wave budget, score = base points, r/hp/speed = body stats.   */
const ENEMY_INFO = {
  blot: { name: "Blot", cost: 1, score: 10, r: 13, hp: 1, speed: 86,
    tip: "Slow and simple. Let them line up, then cut the whole row." },
  dart: { name: "Dart", cost: 2, score: 20, r: 11, hp: 1, speed: 110,
    tip: "It shows its lunge before it leaps. Step aside, or cut it while it winds up." },
  bulwark: { name: "Bulwark", cost: 3, score: 30, r: 16, hp: 1, speed: 66,
    tip: "Its shield turns your blade. Get behind it. It turns slowly." },
  blister: { name: "Blister", cost: 2, score: 20, r: 15, hp: 1, speed: 66,
    tip: "It bursts when it dies. Pop it inside a crowd and keep moving." },
  seer: { name: "Seer", cost: 3, score: 30, r: 12, hp: 1, speed: 78,
    tip: "It fires along its sightline. A dash passes straight through the bolt." },
  clot: { name: "Clot", cost: 3, score: 25, r: 20, hp: 1, speed: 58,
    tip: "It splits into three quick clotlings. Keep Flame in hand for them." },
  clotling: { name: "Clotling", cost: 1, score: 8, r: 8, hp: 1, speed: 172,
    tip: "Fast and frail. They bunch together — one dash can take all three." },
  husk: { name: "Husk", cost: 4, score: 45, r: 25, hp: 3, speed: 52,
    tip: "It takes three cuts, and slams the ground when you linger. Dash out through the ring." },
  twin: { name: "Twin", cost: 5, score: 25, r: 12, hp: 1, speed: 102,
    tip: "The thread between them burns. Dash along it to cut both at once." },
  hunter: { name: "Hunter", cost: 3, score: 35, r: 14, hp: 2, speed: 95,
    tip: "It flanks patiently and strikes when you recover. Turn into its flank." },
  coordinator: { name: "Coordinator", cost: 4, score: 40, r: 16, hp: 2, speed: 72,
    tip: "It guides ally angles from behind cover. Cut it down to break the enemy formation." },
  moon: { name: "Moon", cost: 0, score: 15, r: 13, hp: 1, speed: 0,
    tip: "The Eclipse cannot be cut while its moons circle. Clear them first." },
  mire: { name: "The Mire", boss: true, score: 500, r: 54, hp: 11,
    tip: "Dash through its shockwave, and punish it while it rests after a lunge." },
  loom: { name: "The Loom", boss: true, score: 1000, r: 44, hp: 14,
    tip: "Wait for a gap in its turning shields, then cut straight through." },
  eclipse: { name: "The Eclipse", boss: true, score: 2000, r: 46, hp: 18,
    tip: "Cut its moons to expose the core, then strike while it is stunned." },
  // sources of damage that are not enemy bodies
  bolt: { name: "a bolt", tip: "Bolts fly straight. Sidestep, or dash through them." },
  blast: { name: "an explosion", tip: "Blisters burst a moment after they die. Do not stop inside the ring." },
  ring: { name: "a shockwave", tip: "A dash carries you straight through a shockwave." },
  beam: { name: "the sweeping beam", tip: "Run ahead of the beam, or dash across it." },
  thread: { name: "the Twins' thread", tip: "The thread only burns between two living Twins. Cut either one." },
};
const BESTIARY_ORDER = ["blot", "dart", "bulwark", "blister", "seer", "clot", "husk", "twin", "mire", "loom", "eclipse"];

/* --------------------------------------------------------- Elite mods */
/* An elite is never just bigger numbers: it picks one of these and plays
   differently because of it. rgb/glyph drive the readout in render.js so
   the modifier never relies on color alone.                             */
const ELITE_MODS = {
  frenzied: { name: "Frenzied", tip: "Everything about it happens faster.", rgb: "255,154,61", glyph: "bolt" },
  volatile: { name: "Volatile", tip: "It bursts when it dies, like a Blister, no matter what it is.", rgb: "255,217,138", glyph: "burst" },
  armored: { name: "Armored", tip: "It shrugs off the first killing blow. Cut it again.", rgb: "233,224,204", glyph: "shield" },
  splitting: { name: "Splitting", tip: "Dying sets two quick motes loose.", rgb: "134,182,255", glyph: "split" },
  regenerating: { name: "Regenerating", tip: "Left alone a moment, its wounds close.", rgb: "120,220,150", glyph: "plus" },
  hunting: { name: "Hunting", tip: "The farther you run, the faster it closes.", rgb: "230,120,255", glyph: "arrow" },
  vampiric: { name: "Vampiric", tip: "It mends itself on every hit it lands on you.", rgb: "220,40,60", glyph: "drop" },
};
const ELITE_MOD_ORDER = Object.keys(ELITE_MODS);

/* -------------------------------------------------------------- Waves */
/* pool = relative weights of which enemy leads each spawn group.
   intro = enemy type shown alone first, with its tip on the banner.   */
/* Waves with more than one `pool` give the same budget and maxAlive (the
   difficulty envelope) to each variant, and only the composition — which
   enemies lead, and which named pairs show up — changes between runs.    */
const WAVE_DEFS = {
  1: { budget: 16, pool: { blot: 1 }, maxAlive: 8 },
  2: { budget: 22, pool: { blot: 6, dart: 2 }, maxAlive: 8, intro: "dart", introCount: 1 },
  3: {
    intro: "bulwark", variants: [
      { budget: 34, pool: { blot: 5, dart: 2, bulwark: 3 }, maxAlive: 12 },
      { budget: 34, pool: { blot: 3, dart: 2, bulwark: 4 }, maxAlive: 12 }, // a wall of shields
    ],
  },
  4: {
    intro: "blister", variants: [
      { budget: 42, pool: { blot: 5, dart: 2, bulwark: 2, blister: 3 }, maxAlive: 14 },
      { budget: 42, pool: { blot: 3, dart: 1, bulwark: 3, blister: 3 }, maxAlive: 14 }, // Bulwark + Blister
    ],
  },
  5: { boss: "mire" },
  6: {
    intro: "seer", variants: [
      { budget: 52, pool: { blot: 4, dart: 2, bulwark: 2, blister: 2, seer: 3 }, maxAlive: 15 },
      { budget: 52, pool: { blot: 3, dart: 1, bulwark: 3, blister: 1, seer: 3 }, maxAlive: 15 }, // Bulwark + Seer
    ],
  },
  7: {
    intro: "clot", variants: [
      { budget: 60, pool: { blot: 4, dart: 2, bulwark: 2, blister: 2, seer: 2, clot: 3 }, maxAlive: 16 },
      { budget: 60, pool: { blot: 3, dart: 1, bulwark: 1, blister: 1, seer: 3, clot: 3 }, maxAlive: 16 }, // Clot + Seer
    ],
  },
  8: {
    intro: "husk", variants: [
      { budget: 68, pool: { blot: 4, dart: 2, bulwark: 2, blister: 2, seer: 2, clot: 2, husk: 3 }, maxAlive: 17 },
      { budget: 68, pool: { blot: 3, dart: 1, bulwark: 1, blister: 3, seer: 1, clot: 1, husk: 3 }, maxAlive: 17 }, // Husk + Blister
    ],
  },
  9: {
    intro: "twin", variants: [
      { budget: 76, pool: { blot: 4, dart: 2, bulwark: 2, blister: 2, seer: 2, clot: 2, husk: 2, twin: 2.5 }, maxAlive: 18 },
      { budget: 76, pool: { blot: 3, dart: 2, hunter: 2, bulwark: 1, blister: 1, seer: 1, clot: 1, twin: 2.5 }, maxAlive: 18 }, // Hunter + Twin
    ],
  },
  10: { boss: "loom" },
  11: {
    mod: true, variants: [
      { budget: 88, pool: { blot: 4, dart: 2, hunter: 2, seer: 2, clot: 2 }, maxAlive: 16 }, // The Skirmish: fast lunges & sightlines
      { budget: 88, pool: { blot: 5, dart: 2, seer: 2, blister: 2 }, maxAlive: 16 }, // Swarm with sniper support
    ],
  },
  12: {
    mod: true, variants: [
      { budget: 96, pool: { blot: 3.5, bulwark: 2.5, husk: 2, blister: 2, coordinator: 1.5 }, maxAlive: 17 }, // The Phalanx with coordinator
      { budget: 96, pool: { blot: 4, bulwark: 3.5, dart: 2.5, clot: 2 }, maxAlive: 17 }, // Shield wall with dart rush
    ],
  },
  13: {
    mod: true, variants: [
      { budget: 104, pool: { blot: 3.5, twin: 2.5, seer: 2, dart: 2 }, maxAlive: 18 }, // The Threads: weaving threads and snipers
      { budget: 104, pool: { blot: 3.5, husk: 2, bulwark: 2, seer: 2, clot: 2 }, maxAlive: 18 }, // The Bastion: heavy ground control
    ],
  },
  14: {
    budget: 114, pool: { blot: 3, dart: 1.5, hunter: 1.5, coordinator: 1.5, bulwark: 1.5, seer: 1.5, clot: 1.5, husk: 1.5, twin: 1.5 },
    maxAlive: 19, mod: true,
  },
  15: { boss: "eclipse" },
};
const BOSS_CYCLE = ["mire", "loom", "eclipse"];

/** Resolves a wave number to one concrete def. A `variants` entry picks one
    variant at random and carries over the shared `intro` field so the
    first-sight tip banner still fires regardless of which variant plays.  */
function waveDef(n) {
  const raw = WAVE_DEFS[n];
  if (raw) {
    if (!raw.variants) return raw;
    const v = pick(raw.variants);
    return raw.intro ? Object.assign({ intro: raw.intro, introCount: raw.introCount }, v) : v;
  }
  if (n % 5 === 0) return { boss: BOSS_CYCLE[(n / 5 - 1) % 3] };
  const k = n - CAMPAIGN_WAVES;
  return {
    budget: 124 + k * 10,
    pool: { blot: 3.5, dart: 1.5, hunter: 1.5, coordinator: 1.2, bulwark: 1.5, blister: 1.5, seer: 1.5, clot: 1.5, husk: 1.5, twin: 1.5 },
    maxAlive: Math.min(34, 22 + Math.floor(k * 0.7)),
    mod: true,
  };
}

/* Wave modifiers: a named twist on a late wave. pool multiplies weights.
   A `mutation: true` entry changes a rule, not just a number — these are
   rarer and shown with their own banner styling (see Waves.begin). */
const MODIFIERS = [
  { id: "swarm", name: "Swarm", desc: "A flood of Blots.", budget: 1.15, pool: { blot: 4 }, alive: 4 },
  { id: "gloom", name: "Gloom", desc: "Your light reaches less far.", gloom: true },
  { id: "volley", name: "Volley", desc: "Seers and Darts lead the wave.", pool: { seer: 2.6, dart: 2.4 } },
  { id: "powder", name: "Powder", desc: "Blisters everywhere. Chain the bursts.", pool: { blister: 4.5 } },
  { id: "hardened", name: "Hardened", desc: "One in four enemies is an elite.", elite: 0.25, budget: 0.9 },
  { id: "frenzy", name: "Frenzy", desc: "Everything moves faster.", speed: 1.18, budget: 0.88 },
  { id: "rain", name: "Black Rain", mutation: true,
    desc: "Bolts fall from above all wave. Watch the marks, not just the ground.", rain: true },
  { id: "hunger", name: "Hungry Flame", mutation: true,
    desc: "Flame does not return on its own. Only killing feeds it — and killing feeds it well.",
    regenZero: true, refundMult: 1.8 },
  { id: "thin", name: "Thin World", mutation: true,
    desc: "The arena closes in as the wave goes on. Leave yourself room.", thin: true },
  { id: "bloodmoon", name: "Blood Moon", mutation: true,
    desc: "Kills return half the Flame, but every third kill is a free dash.", refundMult: 0.5, freeDashEvery: 3 },
  { id: "echochamber", name: "Echo Chamber", mutation: true,
    desc: "Every dash repeats itself once, whether you built for it or not.", forceEcho: true },
  { id: "lastlight", name: "Last Light", mutation: true,
    desc: "Your light reaches less far, it will not aim for you, and you cannot count your dashes. Trust your own eyes.",
    gloom: true, noAutoAim: true, hideFlameTicks: true },
];
const MUTATION_IDS = MODIFIERS.filter((m) => m.mutation).map((m) => m.id);

/* -------------------------------------------------------------- Icons */
/* 24x24 stroke icons, one per build, drawn with currentColor.         */
const ICON_PATHS = {
  chain: "M3 12l4.5-4.5L12 12l-4.5 4.5z M12 12l4.5-4.5L21 12l-4.5 4.5z",
  trail: "M3 17h18 M5 13c2-5 4 1 6-4s4 2 8-5",
  echo: "M9 12a4 4 0 1 0 0.01 0 M13 12a4 4 0 1 0 0.01 0 M17 12a4 4 0 1 0 0.01 0",
  shard: "M12 3l2.5 7h-5z M5 14l5 1-3 5z M19 14l-2 6-3-5z",
  guard: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z",
  util: "M9 4h6 M12 4V2 M8 7h8l1.5 11h-11z M10 21h4 M12 11v4",
  relic: "M12 2v5 M12 17v5 M2 12h5 M17 12h5 M5 5l3.5 3.5 M15.5 15.5L19 19 M19 5l-3.5 3.5 M8.5 15.5L5 19 M12 9a3 3 0 1 0 0.01 0",
  heart: "M12 21c-4-3-7-6-7-10 0-3 2.5-4.5 4.5-3 1 .8 1.8 2 2.5 3.5.7-1.5 1.5-2.7 2.5-3.5 2-1.5 4.5 0 4.5 3 0 4-3 7-7 10z",
  cinder: "M12 3l6 9-6 9-6-9z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3 M6 11h12v9H6z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  pause: "M8 5v14 M16 5v14",
};
function icon(name, size = 20) {
  const d = ICON_PATHS[name] || ICON_PATHS.util;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
