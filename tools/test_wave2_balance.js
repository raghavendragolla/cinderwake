const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = ['js/utils.js', 'js/data.js', 'js/save.js', 'js/enemies.js', 'js/waves.js'];
for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInThisContext(code);
}

global.G = {
  mods: duskMods(0),
  W: 1100,
  H: 650,
  player: { x: 550, y: 325, aim: 0 },
  spawns: [],
  enemies: [],
  run: { lastMod: null }
};
Save.data = defaultSave();

console.log('--- TESTING PROPOSED WAVE 2 BALANCE ---');

// Proposed definition
const proposedDef = {
  budget: 22,
  pool: { blot: 6, dart: 2 },
  maxAlive: 8,
  intro: 'dart',
  introCount: 1
};

let dartCounts = [];
let blotCounts = [];
let totalUnits = [];

for (let i = 0; i < 50; i++) {
  const w2 = { n: 2, speed: 1 + 0.023, maxAlive: proposedDef.maxAlive };
  // Modify Waves.plan temporarily to test dart group size
  const origPick = Waves.plan;
  const q = Waves.plan(proposedDef, w2);
  let d = 0, b = 0;
  q.forEach(g => g.list.forEach(t => {
    if (t === 'dart') d++;
    if (t === 'blot') b++;
  }));
  dartCounts.push(d);
  blotCounts.push(b);
  totalUnits.push(d + b);
}

const avg = arr => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);

console.log(`Proposed Wave 2 (50 samples):`);
console.log(`  Avg Darts: ${avg(dartCounts)} (min ${Math.min(...dartCounts)}, max ${Math.max(...dartCounts)})`);
console.log(`  Avg Blots: ${avg(blotCounts)} (min ${Math.min(...blotCounts)}, max ${Math.max(...blotCounts)})`);
console.log(`  Avg Total Units: ${avg(totalUnits)} (min ${Math.min(...totalUnits)}, max ${Math.max(...totalUnits)})`);
