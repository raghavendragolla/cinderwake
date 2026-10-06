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

console.log('--- ENEMY STATS ---');
console.log('Blot:', ENEMY_INFO.blot);
console.log('Dart:', ENEMY_INFO.dart);

console.log('\n--- WAVE DEFINITIONS ---');
console.log('Wave 1:', WAVE_DEFS[1]);
console.log('Wave 2:', WAVE_DEFS[2]);
console.log('Wave 3:', WAVE_DEFS[3]);

console.log('\n--- WAVE 2 SAMPLES (20 runs) ---');
let dartTotals = [];
let blotTotals = [];
let unitTotals = [];
let groupTotals = [];

for (let i = 0; i < 20; i++) {
  const w2 = { n: 2, speed: 1 + 0.023 * 1, maxAlive: WAVE_DEFS[2].maxAlive };
  const q2 = Waves.plan(WAVE_DEFS[2], w2);
  let dCount = 0, bCount = 0, cost = 0;
  q2.forEach(g => g.list.forEach(t => {
    if (t === 'dart') dCount++;
    if (t === 'blot') bCount++;
    cost += ENEMY_INFO[t].cost;
  }));
  dartTotals.push(dCount);
  blotTotals.push(bCount);
  unitTotals.push(dCount + bCount);
  groupTotals.push(q2.length);
  if (i < 8) {
    console.log(`Sample ${i + 1}: Darts=${dCount}, Blots=${bCount}, Total=${dCount + bCount}, Budget=${cost}`);
    console.log('   Groups: ' + q2.map(g => `${g.form}[${g.list.join(',')}]`).join(' -> '));
  }
}

const avg = arr => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
console.log(`\nWave 2 Averages: Darts=${avg(dartTotals)} (min ${Math.min(...dartTotals)}, max ${Math.max(...dartTotals)}), Blots=${avg(blotTotals)}, Total Units=${avg(unitTotals)}, Groups=${avg(groupTotals)}`);

console.log('\n--- WAVE 1 vs 2 vs 3 COMPARISON ---');
[1, 2, 3].forEach(n => {
  const def = waveDef(n);
  const w = { n, speed: 1 + 0.023 * (n - 1), maxAlive: def.maxAlive || 10 };
  let darts = 0, blots = 0, others = 0, totalUnits = 0, totalBudget = 0;
  for (let s = 0; s < 50; s++) {
    const q = Waves.plan(def, w);
    q.forEach(g => g.list.forEach(t => {
      if (t === 'dart') darts++;
      else if (t === 'blot') blots++;
      else others++;
      totalUnits++;
      totalBudget += ENEMY_INFO[t].cost;
    }));
  }
  console.log(`Wave ${n}: BudgetDef=${def.budget}, maxAlive=${def.maxAlive}, AvgUnits=${(totalUnits / 50).toFixed(1)}, AvgDarts=${(darts / 50).toFixed(1)}, AvgBlots=${(blots / 50).toFixed(1)}, AvgOthers=${(others / 50).toFixed(1)}`);
});
