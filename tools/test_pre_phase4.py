"""Pre-Phase-4 Fix Regression Test Suite
Tests:
1. Fresh save -> lifetime score = 0
2. Earn score -> lifetime score increases
3. Die -> lifetime score remains
4. Restart run -> lifetime score remains
5. Earn more score -> lifetime score continues increasing
6. Checkpoint retry does not duplicate previous score
7. Browser reload preserves lifetime score if persistence is supported
8. Locked lantern cannot be selected
9. Unlocked lantern can be selected
10. Selected lantern is actually used when Begin is pressed
"""
import os
import sys
import json
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_all():
    errs = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: errs.append((m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(("pageerror", str(e))))

        page.goto("file:///" + os.path.join(root, "index.html").replace("\\", "/"))
        page.wait_for_timeout(400)

        print("\n=== TEST 1: Fresh Save -> lifetime score = 0 ===")
        t1 = page.evaluate("""() => {
            localStorage.clear();
            Save.load();
            return {
                lifetimeScore: Save.data.stats.lifetimeScore,
                hudScoreInit: $("#hudScore") ? $("#hudScore").textContent.trim() : null
            };
        }""")
        print("T1 result:", json.dumps(t1))
        assert t1["lifetimeScore"] == 0, f"Expected 0, got {t1['lifetimeScore']}"
        print("PASS: Fresh save lifetime score is 0.")

        print("\n=== TEST 2: Earn Score -> lifetime score increases ===")
        t2 = page.evaluate("""() => {
            UI.hide();
            startRun("wick", 0, null, 12345);
            const initialLife = Save.data.stats.lifetimeScore;
            const initialRun = G.run.score;
            
            // Add score
            addScore(500, 100, 100, true);
            UI.frame(0.016);
            
            return {
                initialLife,
                initialRun,
                newRunScore: G.run.score,
                newLifeScore: Save.data.stats.lifetimeScore,
                hudScore: $("#hudScore").textContent.trim()
            };
        }""")
        print("T2 result:", json.dumps(t2))
        assert t2["newLifeScore"] == 500, f"Expected 500, got {t2['newLifeScore']}"
        assert t2["newRunScore"] == 500, f"Expected 500, got {t2['newRunScore']}"
        assert t2["hudScore"] == "500", f"Expected HUD '500', got {t2['hudScore']}"
        print("PASS: Earning score increases lifetime score and updates HUD.")

        print("\n=== TEST 3: Die -> lifetime score remains ===")
        t3 = page.evaluate("""() => {
            // Player takes lethal damage
            G.player.hearts = 1;
            G.player.inv = 0;
            G.run.rekindled = true;
            hurtPlayer('melee');
            for (let i = 0; i < 100; i++) gameUpdate(1/60);
            return {
                state: G.state,
                lifeScoreAfterDeath: Save.data.stats.lifetimeScore,
                savedLifeScore: JSON.parse(localStorage.getItem("cinderwake.save.v1")).stats.lifetimeScore
            };
        }""")
        print("T3 result:", json.dumps(t3))
        assert t3["lifeScoreAfterDeath"] == 500, f"Expected 500, got {t3['lifeScoreAfterDeath']}"
        assert t3["savedLifeScore"] == 500, f"Expected 500 in localStorage, got {t3['savedLifeScore']}"
        print("PASS: Death preserves lifetime score in memory and storage.")

        print("\n=== TEST 4: Restart Run -> lifetime score remains ===")
        t4 = page.evaluate("""() => {
            UI.hide();
            startRun("wick", 0, null, 54321);
            UI.frame(0.016);
            return {
                runScoreOnRestart: G.run.score,
                lifeScoreOnRestart: Save.data.stats.lifetimeScore,
                hudScoreOnRestart: $("#hudScore").textContent.trim()
            };
        }""")
        print("T4 result:", json.dumps(t4))
        assert t4["runScoreOnRestart"] == 0, f"Expected run score 0, got {t4['runScoreOnRestart']}"
        assert t4["lifeScoreOnRestart"] == 500, f"Expected lifetime score 500, got {t4['lifeScoreOnRestart']}"
        assert t4["hudScoreOnRestart"] == "500", f"Expected HUD 500, got {t4['hudScoreOnRestart']}"
        print("PASS: Run restart keeps previous lifetime score while resetting current run score.")

        print("\n=== TEST 5: Earn More Score -> lifetime score continues increasing ===")
        t5 = page.evaluate("""() => {
            addScore(300, 100, 100, true);
            UI.frame(0.016);
            return {
                runScore: G.run.score,
                lifetimeScore: Save.data.stats.lifetimeScore,
                hudScore: $("#hudScore").textContent.trim()
            };
        }""")
        print("T5 result:", json.dumps(t5))
        assert t5["runScore"] == 300, f"Expected run score 300, got {t5['runScore']}"
        assert t5["lifetimeScore"] == 800, f"Expected lifetime score 800 (500+300), got {t5['lifetimeScore']}"
        assert t5["hudScore"] == "800", f"Expected HUD '800', got {t5['hudScore']}"
        print("PASS: Lifetime score continues accumulating across runs.")

        print("\n=== TEST 6: Checkpoint retry does not duplicate previous score ===")
        t6 = page.evaluate("""() => {
            // Player is in a run, score = 300, lifetime = 800.
            // Wave 1 cleared, advance to Wave 2 to create a checkpoint
            G.wave.cleared = true;
            waveCleared();
            const afterWave1Life = Save.data.stats.lifetimeScore;
            const afterWave1Run = G.run.score;
            
            // Advance to Wave 2
            beginWave(2);
            const cpSnap = G.run.checkpointSnapshot;
            const cpSnapLife = cpSnap.lifetimeScore;
            const cpSnapRun = cpSnap.score;
            
            // In Wave 2, earn 400 pts
            addScore(400, 100, 100, true);
            const midWaveLife = Save.data.stats.lifetimeScore;
            const midWaveRun = G.run.score;
            
            // Now player dies and retries checkpoint
            restartCheckpoint();
            UI.frame(0.016);
            
            const afterRetryLife = Save.data.stats.lifetimeScore;
            const afterRetryRun = G.run.score;
            const afterRetryHud = $("#hudScore").textContent.trim();
            
            // Now re-earn the 400 pts on the retried wave
            addScore(400, 100, 100, true);
            UI.frame(0.016);
            const afterReplayLife = Save.data.stats.lifetimeScore;
            
            return {
                afterWave1Life,
                afterWave1Run,
                cpSnapLife,
                cpSnapRun,
                midWaveLife,
                afterRetryLife,
                afterRetryRun,
                afterRetryHud,
                afterReplayLife
            };
        }""")
        print("T6 result:", json.dumps(t6))
        assert t6["afterRetryLife"] == t6["cpSnapLife"], "Checkpoint retry must roll back failed attempt's score"
        assert t6["afterRetryRun"] == t6["cpSnapRun"], "Checkpoint retry must restore snapshot run score"
        assert t6["afterReplayLife"] == t6["midWaveLife"], "Replaying the wave should reach the same score without duplication"
        print("PASS: Checkpoint retry duplication protection verified.")

        print("\n=== TEST 7: Browser reload preserves lifetime score ===")
        t7_before = page.evaluate("""() => {
            Save.persist();
            return Save.data.stats.lifetimeScore;
        }""")
        page.reload()
        page.wait_for_timeout(400)
        t7_after = page.evaluate("""() => {
            return {
                loadedLife: Save.data.stats.lifetimeScore,
                topLevelAlias: Save.data.lifetimeScore
            };
        }""")
        print("T7 result:", t7_before, "->", json.dumps(t7_after))
        assert t7_after["loadedLife"] == t7_before, f"Reload mismatch: {t7_after['loadedLife']} vs {t7_before}"
        print("PASS: Browser reload preserves persistent lifetime score.")

        print("\n=== TEST 8: Locked lantern cannot be selected ===")
        t8 = page.evaluate("""() => {
            // Clean save with only 'wick' unlocked
            localStorage.clear();
            Save.load();
            UI.show("loadout");
            UI.buildLoadout();
            
            const beforeSel = UI.selLantern;
            
            // Attempt to click Flicker (index 1, locked)
            const buttons = $$("#lanternList .lantern");
            const flickerBtn = buttons[1];
            const flickerLocked = flickerBtn.classList.contains("locked");
            const flickerCheckedBefore = flickerBtn.getAttribute("aria-checked");
            
            flickerBtn.click();
            
            const afterSel = UI.selLantern;
            const flickerCheckedAfter = buttons[1].getAttribute("aria-checked");
            const note = $("#loadoutNote").textContent;
            
            // Also attempt selection via keydown / selectLantern
            UI.selectLantern("pyre");
            const afterPyreSel = UI.selLantern;
            
            return {
                beforeSel,
                flickerLocked,
                flickerCheckedBefore,
                afterSel,
                flickerCheckedAfter,
                afterPyreSel,
                note
            };
        }""")
        print("T8 result:", json.dumps(t8))
        assert t8["flickerLocked"] is True, "Flicker should have locked class"
        assert t8["flickerCheckedBefore"] == "false", "Flicker should not be checked"
        assert t8["afterSel"] == "wick", f"Selection should remain wick, got {t8['afterSel']}"
        assert t8["flickerCheckedAfter"] == "false", "Flicker must still not be checked"
        assert t8["afterPyreSel"] == "wick", "Pyre selection should fail and remain wick"
        assert "locked" in t8["note"].lower(), "Note should mention locked"
        print("PASS: Locked lanterns cannot be selected.")

        print("\n=== TEST 9: Unlocked lantern can be selected ===")
        t9 = page.evaluate("""() => {
            // Unlock Flicker legitimately in save
            Save.data.lanterns.push("flicker");
            UI.buildLoadout();
            
            const buttons = $$("#lanternList .lantern");
            const wickBtn = buttons[0];
            const flickerBtn = buttons[1];
            
            const flickerLocked = flickerBtn.classList.contains("locked");
            
            // Click flicker
            flickerBtn.click();
            const newBtns = $$("#lanternList .lantern");
            
            return {
                flickerLocked,
                selLantern: UI.selLantern,
                savedLantern: Save.data.lantern,
                wickChecked: newBtns[0].getAttribute("aria-checked"),
                flickerChecked: newBtns[1].getAttribute("aria-checked")
            };
        }""")
        print("T9 result:", json.dumps(t9))
        assert t9["flickerLocked"] is False, "Flicker should not be locked once unlocked"
        assert t9["selLantern"] == "flicker", "Selected lantern should be flicker"
        assert t9["savedLantern"] == "flicker", "Save data lantern should be flicker"
        assert t9["wickChecked"] == "false", "Wick should be unchecked"
        assert t9["flickerChecked"] == "true", "Flicker should be checked"
        print("PASS: Unlocked lantern can be selected with mouse/keyboard.")

        print("\n=== TEST 10: Selected lantern is used when Begin is pressed ===")
        t10 = page.evaluate("""() => {
            // Click Begin
            $("#btnBegin").click();
            return {
                runState: G.state,
                activeLantern: G.run.lantern,
                playerDashDist: G.S.dashDist
            };
        }""")
        print("T10 result:", json.dumps(t10))
        assert t10["runState"] == "play", "Run should be in play state"
        assert t10["activeLantern"] == "flicker", f"Expected run lantern 'flicker', got {t10['activeLantern']}"
        print("PASS: Selected lantern is used when Begin starts the run.")

        print("\n=== TEST 11: DIST BUNDLE (dist/cinderwake.html) PARITY ===")
        page.goto("file:///" + os.path.join(root, "dist", "cinderwake.html").replace("\\", "/"))
        page.wait_for_timeout(400)
        t11 = page.evaluate("""() => {
            localStorage.clear();
            Save.load();
            UI.show("loadout");
            UI.buildLoadout();
            
            // Try locked lantern
            const btns = $$("#lanternList .lantern");
            btns[1].click();
            const lockedBlockOk = (UI.selLantern === "wick");
            
            // Unlock pyre
            Save.data.lanterns.push("pyre");
            UI.buildLoadout();
            btns[2].click();
            const unlockedSelectOk = (UI.selLantern === "pyre");
            
            // Begin run with pyre
            $("#btnBegin").click();
            const runOk = (G.run.lantern === "pyre");
            
            // Earn score and verify lifetime
            addScore(1000, 100, 100, true);
            const lifeScoreOk = (Save.data.stats.lifetimeScore === 1000);
            
            return { lockedBlockOk, unlockedSelectOk, runOk, lifeScoreOk };
        }""")
        print("T11 dist result:", json.dumps(t11))
        assert t11["lockedBlockOk"] is True, "Dist locked lantern blocked"
        assert t11["unlockedSelectOk"] is True, "Dist unlocked lantern selected"
        assert t11["runOk"] is True, "Dist run uses selected lantern"
        assert t11["lifeScoreOk"] is True, "Dist lifetime score accumulates"
        print("PASS: Dist bundle passes all lantern selection and lifetime score tests.")

        assert len(errs) == 0, f"Errors encountered: {errs}"
        print(f"\nPage error count: {len(errs)}")
        print("\nALL PRE-PHASE-4 TESTS PASSED CLEANLY!")
        browser.close()

if __name__ == "__main__":
    test_all()
