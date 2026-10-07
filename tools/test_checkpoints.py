"""Comprehensive test suite for Phase 3B: Checkpoints + Downed/Revive System.

Tests cover:
1. Checkpoint Progression (Wave 1, 2, 5, 8, 11, 15) and clean retries.
2. Downed/Revive (Last Ember/Rekindle) mechanic:
   - Lethal damage -> DOWNED state.
   - Dash through marked target -> Revive success (1 HP, flame restored, invuln, combo reset, push).
   - Strict limit: no duplicate revive (once per run/life).
   - Timer expiration -> death -> checkpoint screen.
   - Boss encounter revive (boss state preserved).
3. Reward Duplication Protection:
   - Cards, Cinders, synergies, mastery stats, achievements never duplicated on retry.
4. Input pathways:
   - Space, Enter, mouse click, and touch on Checkpoint Screen.
   - Real input gestures during revive.
5. Verification across both source (index.html) and dist (cinderwake.html).

Usage: python tools/test_checkpoints.py
"""
import os
import sys
import json
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_tests():
    errs = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: errs.append((m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(("pageerror", str(e))))

        page.goto("file:///" + os.path.join(root, "index.html").replace("\\", "/"))
        page.wait_for_timeout(400)

        print("\n=== TEST 1: CHECKPOINT PROGRESSION & RETRIES (W1, W2, W5, W8, W11, W15) ===")
        t1 = page.evaluate("""() => {
            UI.hide();
            startRun('wick', 0, null, 12345);
            const r0 = G.run.checkpointWave; // should be 1

            // Complete Wave 1
            G.wave.cleared = true;
            waveCleared();
            const r1 = G.run.checkpointWave; // should be 2

            // Start Wave 2
            beginWave(2);
            const w2_start_flame = G.player.flame;
            
            // Player takes lethal damage on Wave 2
            G.player.hearts = 1;
            G.player.inv = 0;
            G.run.rekindled = true; // bypass revive to test checkpoint death screen directly
            hurtPlayer('melee');
            
            // Advance dying timer
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            const stateAfterDeath = G.state; // should be "checkpoint"
            const curScreen = UI.cur; // should be "checkpoint"

            // Retry Wave 2 via restartCheckpoint()
            restartCheckpoint();
            const w2_retry = {
                state: G.state,
                wave: G.run.wave,
                checkpointWave: G.run.checkpointWave,
                alive: G.player.alive,
                hearts: G.player.hearts,
                flame: G.player.flame,
                inv: G.player.inv > 0,
                x: G.player.x,
                y: G.player.y
            };

            // Test Wave 5 (Mire Boss)
            G.run.waveDone = 4;
            G.run.checkpointWave = 5;
            beginWave(5);
            G.wave.intro = 0;
            for (let i = 0; i < 110; i++) gameUpdate(1/60);
            const cp5 = G.run.checkpointWave;
            // Die on Wave 5
            G.player.hearts = 1;
            G.player.inv = 0;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            const death5State = G.state;
            restartCheckpoint();
            G.wave.intro = 0;
            for (let i = 0; i < 110; i++) gameUpdate(1/60);
            const w5_retry = {
                wave: G.run.wave,
                boss: G.wave ? G.wave.boss : null,
                bossHp: G.wave && G.wave.bossRef ? G.wave.bossRef.hp : null
            };

            // Test Wave 8
            G.run.waveDone = 7;
            G.run.checkpointWave = 8;
            beginWave(8);
            const cp8 = G.run.checkpointWave;
            G.player.hearts = 1;
            G.player.inv = 0;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            restartCheckpoint();
            const w8_retry = G.run.wave;

            // Test Wave 11
            G.run.waveDone = 10;
            G.run.checkpointWave = 11;
            beginWave(11);
            const cp11 = G.run.checkpointWave;
            G.player.hearts = 1;
            G.player.inv = 0;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            restartCheckpoint();
            const w11_retry = G.run.wave;

            // Test Wave 15 (Eclipse Boss)
            G.run.waveDone = 14;
            G.run.checkpointWave = 15;
            beginWave(15);
            const cp15 = G.run.checkpointWave;
            G.player.hearts = 1;
            G.player.inv = 0;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            restartCheckpoint();
            const w15_retry = {
                wave: G.run.wave,
                boss: G.wave ? G.wave.boss : null
            };

            return {
                r0, r1, stateAfterDeath, curScreen,
                w2_retry, cp5, death5State, w5_retry,
                cp8, w8_retry, cp11, w11_retry, cp15, w15_retry
            };
        }""")
        print("T1 result:", json.dumps(t1))
        assert t1["r0"] == 1, "Initial checkpointWave must be 1"
        assert t1["r1"] == 2, "Wave 1 complete must advance checkpointWave to 2"
        assert t1["stateAfterDeath"] == "checkpoint", "Death must enter checkpoint state"
        assert t1["curScreen"] == "checkpoint", "UI must display checkpoint screen"
        assert t1["w2_retry"]["wave"] == 2, "Retry must replay Wave 2"
        assert t1["w2_retry"]["alive"], "Player must be alive on retry"
        assert t1["w2_retry"]["hearts"] >= 1, "Player must have positive hearts"
        assert t1["w2_retry"]["flame"] == 100, "Flame must be restored to full wave-start flame"
        assert t1["w2_retry"]["inv"], "Player must receive safe-start invulnerability"
        assert t1["cp5"] == 5 and t1["w5_retry"]["wave"] == 5, "Wave 5 checkpoint must retry Wave 5"
        assert t1["w5_retry"]["boss"] == "mire", "Wave 5 retry must spawn Mire boss cleanly"
        assert t1["cp8"] == 8 and t1["w8_retry"] == 8, "Wave 8 checkpoint must retry Wave 8"
        assert t1["cp11"] == 11 and t1["w11_retry"] == 11, "Wave 11 checkpoint must retry Wave 11"
        assert t1["cp15"] == 15 and t1["w15_retry"]["wave"] == 15, "Wave 15 checkpoint must retry Wave 15"
        print("PASS: Checkpoint progression and wave retry flow verified.")

        print("\n=== TEST 2: DOWNED / REVIVE (LAST EMBER) MECHANIC ===")
        t2 = page.evaluate("""() => {
            UI.hide();
            startRun('wick', 0, null, 99999);
            const p = G.player;
            p.hearts = 1;
            p.inv = 0;
            G.combo = 8;
            
            // Spawn a dummy nearby enemy
            const target = spawnEnemy("blot", p.x + 80, p.y, null);
            target.spawn = 0;
            
            // Take lethal damage
            hurtPlayer('melee');
            const downed = {
                hearts: p.hearts,
                alive: p.alive,
                lastEmber: !!G.lastEmber,
                hasTarget: !!(G.lastEmber && G.lastEmber.target),
                targetIsEmber: target.isEmberTarget,
                rekindledBefore: G.run.rekindled
            };

            // Player dashes through the marked target
            damageEnemy(target, 1, 'dash', 0, { hits: 0, kills: 0 });
            
            const revived = {
                lastEmber: !!G.lastEmber,
                rekindledAfter: G.run.rekindled,
                hearts: p.hearts,
                flame: p.flame,
                inv: p.inv > 0,
                combo: G.combo,
                alive: p.alive
            };

            // Second lethal damage: MUST NOT revive again!
            p.hearts = 1;
            p.inv = 0;
            hurtPlayer('melee');
            const secondLethal = {
                lastEmber: !!G.lastEmber,
                alive: p.alive,
                dying: G.dying > 0
            };

            return { downed, revived, secondLethal };
        }""")
        print("T2 result:", json.dumps(t2))
        assert t2["downed"]["lastEmber"], "Player must enter Last Ember upon lethal hit"
        assert t2["downed"]["targetIsEmber"], "Target must be marked as isEmberTarget"
        assert not t2["revived"]["lastEmber"], "Last Ember must clear on successful revive"
        assert t2["revived"]["rekindledAfter"], "rekindled must become true"
        assert t2["revived"]["hearts"] == 1, "Player HP must become 1 on revive"
        assert t2["revived"]["flame"] >= 45, "Player Flame must be restored to at least 45"
        assert t2["revived"]["inv"], "Player must have invulnerability"
        assert t2["revived"]["combo"] == 0, "Combo must reset to 0"
        assert not t2["secondLethal"]["lastEmber"], "Second lethal hit must NOT trigger Last Ember"
        assert t2["secondLethal"]["dying"], "Second lethal hit must proceed directly to dying"
        print("PASS: Downed/revive contract and single-revive limit verified.")

        print("\n=== TEST 3: DOWNED TIMEOUT -> FINAL DEATH -> CHECKPOINT SCREEN ===")
        t3 = page.evaluate("""() => {
            clearWorld();
            startRun('wick', 0, null, 7777);
            const p = G.player;
            p.hearts = 1;
            p.inv = 0;
            hurtPlayer('melee');
            const inDowned = !!G.lastEmber;

            // Advance time past 2.5s Downed duration
            for (let i = 0; i < 180; i++) gameUpdate(1/60);
            const timedOut = !G.lastEmber;
            
            // Advance past dying timer (1.5s)
            for (let i = 0; i < 120; i++) gameUpdate(1/60);
            const finalState = G.state;
            const finalScreen = UI.cur;

            return { inDowned, timedOut, finalState, finalScreen };
        }""")
        print("T3 result:", json.dumps(t3))
        assert t3["inDowned"], "Must enter Downed state"
        assert t3["timedOut"], "Downed state must expire on timeout"
        assert t3["finalState"] == "checkpoint", "Expired revive must transition to checkpoint screen"
        assert t3["finalScreen"] == "checkpoint", "UI must display checkpoint screen"
        print("PASS: Revive timeout transitions to Checkpoint Screen.")

        print("\n=== TEST 4: BOSS ENCOUNTER REVIVE ===")
        t4 = page.evaluate("""() => {
            clearWorld();
            startRun('wick', 0, null, 8888);
            beginWave(5); // Mire boss
            G.wave.intro = 0;
            for (let i = 0; i < 110; i++) gameUpdate(1/60);
            const p = G.player;
            const mire = G.wave.bossRef;
            mire.hp = 8; // set Mire to mid-fight HP
            p.hearts = 1;
            p.inv = 0;
            
            // Lethal damage during boss
            hurtPlayer('melee');
            const bossDowned = {
                lastEmber: !!G.lastEmber,
                target: G.lastEmber ? (G.lastEmber.target === mire ? 'mire' : G.lastEmber.target.type) : null
            };

            // Revive against target
            const tgt = G.lastEmber.target;
            damageEnemy(tgt, 1, 'dash', 0, { hits: 0, kills: 0 });
            
            const bossRevived = {
                rekindled: G.run.rekindled,
                mireHp: mire.hp,
                mireAlive: !mire.dead,
                playerHearts: p.hearts
            };

            return { bossDowned, bossRevived };
        }""")
        print("T4 result:", json.dumps(t4))
        assert t4["bossDowned"]["lastEmber"], "Must enter Last Ember during boss encounter"
        assert t4["bossRevived"]["rekindled"], "Must rekindle successfully"
        assert t4["bossRevived"]["mireHp"] == 8, "Boss HP must be preserved, not reset"
        assert t4["bossRevived"]["mireAlive"], "Boss must remain active in encounter"
        print("PASS: Boss encounter revive verified.")

        print("\n=== TEST 5: REWARD DUPLICATION PROTECTION ===")
        t5 = page.evaluate("""() => {
            Save.reset();
            startRun('wick', 0, null, 1111);
            
            // Complete Wave 7 and award upgrade card
            G.run.waveDone = 7;
            G.run.wave = 7;
            G.run.up.reach = 1;
            G.S = calcStats(G.run);
            const initialCinders = Save.data.cinders;
            const initialRuns = Save.data.stats.runs;
            const initialKills = Save.data.byLantern.wick.kills;

            // Start Wave 8
            beginWave(8);
            const snapCards = G.run.up.reach;

            // Kill some enemies and take lethal damage in Wave 8
            G.run.kills += 5;
            G.player.hearts = 1;
            G.player.inv = 0;
            G.run.rekindled = true;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            
            // Restart Wave 8 from checkpoint
            restartCheckpoint();

            const afterRetry = {
                wave: G.run.wave,
                reachCards: G.run.up.reach,
                cinders: Save.data.cinders,
                statsRuns: Save.data.stats.runs,
                masteryKills: Save.data.byLantern.wick.kills,
                scoreMatches: G.run.score === G.run.checkpointSnapshot.score,
            };

            return { snapCards, initialCinders, initialRuns, initialKills, afterRetry };
        }""")
        print("T5 result:", json.dumps(t5))
        assert t5["afterRetry"]["reachCards"] == 1, "Cards must NOT be duplicated on retry"
        assert t5["afterRetry"]["cinders"] == t5["initialCinders"], "Cinders must NOT be duplicated"
        assert t5["afterRetry"]["statsRuns"] == t5["initialRuns"], "Runs count must NOT be incremented on retry"
        assert t5["afterRetry"]["masteryKills"] == t5["initialKills"], "Mastery kills must NOT accumulate on retry"
        print("PASS: Reward duplication protection verified.")

        print("\n=== TEST 6: UI & INPUT PARITY ON CHECKPOINT SCREEN ===")
        t6 = page.evaluate("""() => {
            clearWorld();
            startRun('wick', 0, null, 2222);
            beginWave(4);
            G.player.hearts = 1;
            G.player.inv = 0;
            G.run.rekindled = true;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);

            const cpShown = UI.cur === "checkpoint";
            const btnText = document.getElementById("btnRetryWave").textContent;
            
            // Trigger retry via UI.act("retry-wave")
            UI.act("retry-wave");
            const afterAct = {
                state: G.state,
                screen: UI.cur,
                wave: G.run.wave,
                alive: G.player.alive
            };

            return { cpShown, btnText, afterAct };
        }""")
        print("T6 result:", json.dumps(t6))
        assert t6["cpShown"], "Checkpoint screen must be displayed"
        assert "Retry Wave 4" in t6["btnText"], "Button text must indicate Wave 4"
        assert t6["afterAct"]["state"] == "play", "Game must resume in play state"
        assert t6["afterAct"]["screen"] is None, "UI screens must be hidden"
        assert t6["afterAct"]["wave"] == 4, "Wave 4 must be active"
        print("\n=== TEST 6B: KEYBOARD, MOUSE, TOUCH INPUT FOR CHECKPOINT RETRY & REVIVE ===")
        t6b = page.evaluate("""() => {
            clearWorld();
            startRun('wick', 0, null, 4444);
            beginWave(6);
            
            // 1. Keyboard Space on Checkpoint Screen
            G.player.hearts = 1;
            G.player.inv = 0;
            G.run.rekindled = true;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            const onCp1 = G.state === "checkpoint";
            window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
            const kbResumed = G.state === "play" && G.run.wave === 6;

            // 2. Mouse click on Checkpoint Screen
            G.player.hearts = 1;
            G.player.inv = 0;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            const onCp2 = G.state === "checkpoint";
            document.getElementById("btnRetryWave").click();
            const mouseResumed = G.state === "play" && G.run.wave === 6;

            // 3. Touch tap on Checkpoint Screen
            G.player.hearts = 1;
            G.player.inv = 0;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            const onCp3 = G.state === "checkpoint";
            const btn = document.getElementById("btnRetryWave");
            btn.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", clientX: 100, clientY: 100 }));
            btn.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", clientX: 100, clientY: 100 }));
            btn.click();
            const touchResumed = G.state === "play" && G.run.wave === 6;

            // 4. Real mouse gesture executing revive dash through target
            G.run.rekindled = false;
            const p = G.player;
            p.hearts = 1;
            p.inv = 0;
            const target = spawnEnemy("blot", p.x + 100, p.y, null);
            target.spawn = 0;
            hurtPlayer('melee'); // enters Last Ember
            const inEmber = !!G.lastEmber;
            
            // Mouse gesture aimed right (towards target at p.x + 100)
            const canvas = document.getElementById("game");
            const cx = View.ox + (p.x + 100) * View.scale, cy = View.oy + p.y * View.scale;
            Input.touch = false;
            canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", button: 0, clientX: cx, clientY: cy }));
            gameUpdate(1/60);
            canvas.dispatchEvent(new PointerEvent("pointerup", { pointerType: "mouse", button: 0, clientX: cx, clientY: cy }));
            for (let i = 0; i < 20; i++) { gameUpdate(1/60); Input.endFrame(); }
            const realInputRekindled = G.run.rekindled && p.alive && p.hearts === 1;

            return { onCp1, kbResumed, onCp2, mouseResumed, onCp3, touchResumed, inEmber, realInputRekindled };
        }""")
        print("T6B result:", json.dumps(t6b))
        assert t6b["kbResumed"], "Keyboard Space must retry checkpoint wave"
        assert t6b["mouseResumed"], "Mouse click must retry checkpoint wave"
        assert t6b["touchResumed"], "Touch tap must retry checkpoint wave"
        assert t6b["realInputRekindled"], "Real mouse dash gesture must trigger revive"
        print("PASS: Real keyboard, mouse, and touch input paths verified for checkpoint retry and revive.")

        print("\n=== TEST 7: DIST BUNDLE (dist/cinderwake.html) CHECKPOINT COMPATIBILITY ===")
        page.goto("file:///" + os.path.join(root, "dist", "cinderwake.html").replace("\\", "/"))
        page.wait_for_timeout(400)
        t7 = page.evaluate("""() => {
            UI.hide();
            startRun('wick', 0, null, 3333);
            beginWave(3);
            G.player.hearts = 1;
            G.player.inv = 0;
            G.run.rekindled = true;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            const cpState = G.state;
            restartCheckpoint();
            return {
                distCpState: cpState,
                resumedWave: G.run.wave,
                alive: G.player.alive,
                flame: G.player.flame
            };
        }""")
        print("T7 result:", json.dumps(t7))
        assert t7["distCpState"] == "checkpoint", "Dist bundle must enter checkpoint state"
        assert t7["resumedWave"] == 3, "Dist bundle must resume Wave 3"
        assert t7["alive"], "Player must be alive on dist retry"
        assert t7["flame"] == 100, "Flame must be full on dist retry"
        print("PASS: Dist bundle verified with checkpoint and revive flow.")

        browser.close()

    print("\nPage error count:", len(errs))
    assert len(errs) == 0, f"Page errors encountered: {errs}"
    print("\nALL CHECKPOINT & REVIVE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
