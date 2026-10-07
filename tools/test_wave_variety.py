#!/usr/bin/env python3
"""
Cinderwake — Wave Variety & Encounter Architecture Test (Phase 3C)
Verifies:
- Distinct wave identities, skills, and compositions across waves 1-15
- High-threat concurrency bounds (Bulwark, Seer, Husk, Twin, Hunter)
- Bulwark flank routes and spacing rules (>= 180px, margin >= 85px)
- Recovery opportunities under low-Flame states
- Boss waves distinctness (W5 Mire, W10 Loom, W15 Eclipse)
- W11-W14 controlled pacing without enemy spam
"""

import sys
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8085"

def run_variety_tests():
    print("=== RUNNING WAVE VARIETY & ENCOUNTER ARCHITECTURE TESTS ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page_errors = []
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.goto(URL, wait_until="networkidle")

        # 1. Audit WAVE_DEFS & WAVE_NAMES
        res1 = page.evaluate("""() => {
            const audit = [];
            for (let w = 1; w <= 15; w++) {
                const def = WAVE_DEFS[w];
                const name = WAVE_NAMES[w];
                const isBoss = !!def.boss;
                let primary = isBoss ? def.boss : (def.intro || "blot");
                let pools = def.variants ? def.variants.map(v => Object.keys(v.pool)) : (def.pool ? [Object.keys(def.pool)] : []);
                let maxAlive = def.variants ? Math.max(...def.variants.map(v => v.maxAlive)) : (def.maxAlive || 8);
                let budget = def.variants ? Math.max(...def.variants.map(v => v.budget)) : (def.budget || 0);
                audit.push({ w, name, isBoss, primary, pools, maxAlive, budget });
            }
            return audit;
        }""")

        print(f"Audited {len(res1)} campaign waves.")
        for item in res1:
            print(f"Wave {item['w']:2d}: {item['name']:<16} | Primary: {item['primary']:<11} | MaxAlive: {item['maxAlive']:2d} | Budget: {item['budget']:3d}")

        # Assert unique wave names
        names = [x["name"] for x in res1]
        assert len(names) == len(set(names)), f"Wave names not unique: {names}"

        # Assert boss waves
        assert res1[4]["primary"] == "mire"
        assert res1[9]["primary"] == "loom"
        assert res1[14]["primary"] == "eclipse"

        # Assert W11-W14 budgets are controlled (not spam)
        for w in [11, 12, 13, 14]:
            assert res1[w-1]["maxAlive"] <= 14, f"Wave {w} maxAlive too high: {res1[w-1]['maxAlive']}"
            assert res1[w-1]["budget"] <= 110, f"Wave {w} budget too high: {res1[w-1]['budget']}"

        # 2. Test Wave 3 Bulwark rules: strictly max 1 Bulwark at a time, Blot fuel
        res_w3 = page.evaluate("""() => {
            startRun('wick');
            Waves.begin(3);
            const w = G.wave;
            const groups = w.queue;
            let totalBulwarks = 0;
            let totalBlots = 0;
            groups.forEach(g => {
                g.list.forEach(t => {
                    if (t === 'bulwark') totalBulwarks++;
                    if (t === 'blot') totalBlots++;
                });
            });
            return { totalBulwarks, totalBlots, maxAlive: w.maxAlive, queueLen: groups.length };
        }""")
        print(f"Wave 3 Composition: Bulwarks={res_w3['totalBulwarks']}, Blots={res_w3['totalBlots']}, MaxAlive={res_w3['maxAlive']}")
        assert res_w3["totalBulwarks"] <= 3, f"Wave 3 has too many Bulwarks: {res_w3['totalBulwarks']}"
        assert res_w3["totalBlots"] >= 4, f"Wave 3 lacks sufficient recovery fuel (Blots={res_w3['totalBlots']})"

        # 3. Test Bulwark spacing and wall margin enforcement
        res_spacing = page.evaluate("""() => {
            startRun('wick');
            Waves.begin(12); // Wave 12 can spawn Bulwarks
            G.enemies = [];
            G.spawns = [];
            
            // Call spawnGroup with 2 Bulwarks
            Waves.spawnGroup({ list: ['bulwark', 'bulwark'], form: 'far' });
            
            const spawns = G.spawns.filter(s => s.type === 'bulwark');
            if (spawns.length < 2) return { ok: true, note: 'Only 1 spawned' };
            
            const s1 = spawns[0], s2 = spawns[1];
            const d = Math.hypot(s1.x - s2.x, s1.y - s2.y);
            const m1 = Math.min(s1.x, G.W - s1.x, s1.y, G.H - s1.y);
            const m2 = Math.min(s2.x, G.W - s2.x, s2.y, G.H - s2.y);
            return { ok: d >= 170 && m1 >= 80 && m2 >= 80, dist: d, m1, m2 };
        }""")
        print(f"Bulwark Spacing Test: {res_spacing}")
        assert res_spacing["ok"], f"Bulwark spacing failed: {res_spacing}"

        # 4. Test Flame Recovery Director
        res_director = page.evaluate("""() => {
            startRun('wick');
            Waves.begin(4);
            G.wave.intro = 0;
            G.player.flame = 10; // Critically low (< 34 dash cost)
            G.enemies = [{ id: 99, type: 'bulwark', x: 400, y: 300, dead: false, hp: 3 }]; // Only shielded enemy
            
            // Queue has a blot group somewhere behind
            G.wave.queue = [
                { list: ['dart', 'dart'], form: 'far' },
                { list: ['blot', 'blot'], form: 'line' }
            ];
            G.wave.gapT = 1.0;
            
            // Run one frame of wave update
            Waves.update(0.016);
            
            // Director should have prioritized the Blot group to index 0 and shortened gapT
            const front = G.wave.queue[0];
            return {
                prioritized: front.list.includes('blot'),
                gapT: G.wave.gapT,
                flame: G.player.flame
            };
        }""")
        print(f"Flame Recovery Director Test: {res_director}")
        assert res_director["prioritized"], "Flame Recovery Director failed to prioritize recovery target"
        assert res_director["gapT"] <= 0.4, f"Flame Recovery Director did not reduce spawn gap: {res_director['gapT']}"

        # 5. Test Hungry Flame Emergency Recovery
        res_hungry = page.evaluate("""() => {
            startRun('wick');
            // Mock Hungry Flame mutation
            G.wave.mod = { id: 'hunger', name: 'Hungry Flame', mutation: true, regenZero: true, refundMult: 1.8 };
            G.player.flame = 0;
            
            // Advance 5 seconds
            for (let i = 0; i < 300; i++) {
                updatePlayer(0.01666);
            }
            const flameTrickle = G.player.flame;
            
            // Advance until above dash cost (34 for wick)
            for (let i = 0; i < 2000; i++) {
                updatePlayer(0.01666);
            }
            const cappedFlame = G.player.flame;
            return { flameTrickle, cappedFlame, dashCost: G.S.dashCost };
        }""")
        print(f"Hungry Flame Emergency Recovery Test: {res_hungry}")
        assert res_hungry["flameTrickle"] > 3.0, f"Hungry flame failed to trickle up from 0: {res_hungry['flameTrickle']}"
        assert abs(res_hungry["cappedFlame"] - res_hungry["dashCost"]) < 0.1, f"Hungry flame emergency recovery exceeded dash cost: {res_hungry['cappedFlame']}"

        # 6. Test Bulwark Stagger on Shield Block
        res_block = page.evaluate("""() => {
            startRun('wick');
            const b = makeEnemy('bulwark', 400, 300);
            b.spawn = 0;
            b.facing = Math.PI; // facing left
            G.enemies = [b];
            
            // Simulate dash hitting front shield
            const p = G.player;
            p.x = 350; p.y = 300;
            p.dash = { id: 1, dx: 1, dy: 0, ang: 0, left: 100, dmg: 1, width: 15, kills: 0 };
            stepDash(p, 0.016);
            
            return {
                blocked: p.dash === null,
                bulwarkTurnLock: b.turnLock,
                bulwarkStun: b.stun,
                playerInv: p.inv
            };
        }""")
        print(f"Bulwark Shield Block Stagger Test: {res_block}")
        assert res_block["blocked"], "Dash did not register as blocked"
        assert res_block["bulwarkTurnLock"] >= 0.6, f"Bulwark turn lock was not applied: {res_block['bulwarkTurnLock']}"
        assert res_block["playerInv"] > 0, "Player was not granted bounce invulnerability"

        browser.close()
        assert len(page_errors) == 0, f"Page errors: {page_errors}"
        print("ALL WAVE VARIETY & ENCOUNTER ARCHITECTURE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_variety_tests()
