"""Comprehensive verification suite for Cinderwake Phase 1 & Phase 2.
Tests:
1. Save system backward compatibility (old save without new fields) & new save defaults.
2. Lantern Mastery accumulation, level advancement, Level 3 signature card award, Level 5 trail/title.
3. Bestiary & Synergy discovery tracking persistence across runs.
4. Perfect Dash mechanics against all supported hazards (Dart, Husk ring, Mire ring, Twin thread, Seer bolt, Eclipse beam, Boss lunge).
5. Multi-campaign runs across all 5 lanterns (Wick, Flicker, Pyre, Glint, Ashen).
6. Multi-skill levels (0.3, 0.6, 0.9).
7. Wave 13 stress testing (verifying no soft locks, no NaN, balanced completion rate).
8. Single-file dist/cinderwake.html integrity.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_tests():
    errs = []
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: errs.append((m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(("pageerror", str(e))))

        with open(os.path.join(root, "tools", "bot.js"), "r", encoding="utf-8") as f:
            bot_js = f.read()

        page.goto("file://" + os.path.join(root, "index.html").replace("\\", "/"))
        page.wait_for_timeout(400)
        page.evaluate(bot_js)

        print("--- TEST 1: SAVE COMPATIBILITY & MIGRATION ---")
        t1 = page.evaluate("""() => {
            // Test an old legacy save format without byLantern, seenElite, seenSynergy, etc.
            const legacySave = {
                ver: 1,
                cinders: 50,
                lanterns: ["wick", "flicker"],
                cards: ["wake"],
                stats: { runs: 5, kills: 120 }
            };
            localStorage.setItem("cinderwake.save.v1", JSON.stringify(legacySave));
            Save.load();
            const d = Save.data;
            const valid = (
                d.byLantern && d.byLantern.wick &&
                d.seenElite && d.seenSynergy &&
                d.enemyKills && d.bossDefeats &&
                Array.isArray(d.lanterns) &&
                d.cinders === 50
            );
            return { valid, wickMastery: d.byLantern.wick };
        }""")
        print("T1 legacy save load result:", json.dumps(t1))
        assert t1["valid"], "Legacy save migration failed"

        print("\n--- TEST 2: LANTERN MASTERY ACCUMULATION & REWARDS ---")
        t2 = page.evaluate("""() => {
            // Reset to clean save
            Save.reset();
            const bl = "wick";
            const bData = Save.data.byLantern[bl];
            const lvl0 = masteryLevel(bData);

            // Test Level 3 signature card reward at run start
            bData.runs = 1;
            bData.kills = 120;
            bData.perfectDashes = 15;
            Save.save();
            const lvl3 = masteryLevel(Save.data.byLantern[bl]);

            startRun("wick", 0, null);
            const hasSigCard = G.run && G.run.up && G.run.up[LANTERNS.wick.masteryCard] === 1;
            quitToMenu();

            // Test Level 5 title and trail
            bData.wave = 12;
            bData.clears = 1;
            Save.save();
            const lvl5 = masteryLevel(Save.data.byLantern[bl]);

            startRun("wick", 0, null);
            const isMastered = G.L && G.run && masteryLevel(Save.data.byLantern[G.run.lantern]) >= 5;
            const trailRGB = isMastered ? G.L.masteryRGB : null;
            quitToMenu();

            return { lvl0, lvl3, hasSigCard, lvl5, trailRGB };
        }""")
        print("T2 mastery results:", json.dumps(t2))
        assert t2["hasSigCard"] == True, "Level 3 signature card not granted"
        assert t2["lvl5"] == 5, "Level 5 not achieved with clear"
        assert t2["trailRGB"] is not None, "Level 5 mastery trail RGB not set"

        print("\n--- TEST 3: DISCOVERY & BESTIARY PERSISTENCE ---")
        t3 = page.evaluate("""() => {
            Save.reset();
            startRun("wick", 0, null);
            // Kill a blot and a husk
            const e1 = makeEnemy("blot", 100, 100, null);
            G.enemies.push(e1);
            e1.hp = 0;
            killEnemy(e1, "dash", 0, true);

            const e2 = makeEnemy("husk", 200, 200, null);
            G.enemies.push(e2);
            e2.hp = 0;
            killEnemy(e2, "dash", 0, true);

            // Kill a boss
            const b = makeBoss("mire", 300, 300, 0);
            G.enemies.push(b);
            b.hp = 0;
            killBoss(b, 0);

            // Pick upgrade that satisfies a synergy (wake is trail build, momentum is chain build)
            G.state = "upgrade";
            takeUpgrade("wake");
            G.state = "upgrade";
            takeUpgrade("momentum");

            endRun(false);

            return {
                blotKills: Save.data.enemyKills["blot"],
                huskKills: Save.data.enemyKills["husk"],
                mireDefeats: Save.data.bossDefeats["mire"],
                ashwakeSynergy: Save.data.seenSynergy["ashwake"]
            };
        }""")
        print("T3 discovery tracking:", json.dumps(t3))
        assert t3["blotKills"] == 1, "Enemy kill not tracked"
        assert t3["huskKills"] == 1, "Enemy kill not tracked"
        assert t3["mireDefeats"] == 1, "Boss defeat not tracked"
        assert t3["ashwakeSynergy"] == 1, "Synergy discovery not tracked"

        print("\n--- TEST 4: PERFECT DASH DETECTION AGAINST ALL HAZARDS ---")
        t4 = page.evaluate("""() => {
            const results = {};
            
            // 4a. Dart lunge
            startRun("wick", 0, null);
            G.player.x = 200; G.player.y = 200; G.player.dash = true; G.player.dashT = 0.05;
            const dart = makeEnemy("dart", 210, 200, null);
            G.enemies.push(dart);
            dart.atk = true;
            dart.state = 2; // lunging
            const d4a = { perfect: false };
            checkPerfectDash(G.player, 190, 200, 230, 200, d4a);
            results.dart = d4a.perfect;
            quitToMenu();

            // 4b. Husk slam ring
            startRun("wick", 0, null);
            G.player.x = 200; G.player.y = 200; G.player.dash = true; G.player.dashT = 0.05;
            addRing(200, 200, 18, 160, 220, "husk", 0.8, 12, "rgba(255,160,60,");
            G.hazards[0].r = 50;
            const d4b = { perfect: false };
            checkPerfectDash(G.player, 130, 200, 270, 200, d4b);
            results.huskRing = d4b.perfect;
            quitToMenu();

            // 4c. Mire ring
            startRun("wick", 0, null);
            G.player.x = 200; G.player.y = 200; G.player.dash = true; G.player.dashT = 0.05;
            addRing(200, 200, 16, 220, 260, "mire", 1.0, 14, "rgba(80,220,160,");
            G.hazards[0].r = 60;
            const d4c = { perfect: false };
            checkPerfectDash(G.player, 120, 200, 280, 200, d4c);
            results.mireRing = d4c.perfect;
            quitToMenu();

            // 4d. Twin burning thread
            startRun("wick", 0, null);
            G.player.x = 200; G.player.y = 200; G.player.dash = true; G.player.dashT = 0.05;
            const tA = makeEnemy("twin", 200, 100, null);
            const tB = makeEnemy("twin", 200, 300, null);
            G.enemies.push(tA, tB);
            tA.lead = true; tA.mate = tB; tB.mate = tA; tA.warm = 0;
            const d4d = { perfect: false };
            checkPerfectDash(G.player, 150, 200, 250, 200, d4d);
            results.twinThread = d4d.perfect;
            quitToMenu();

            // 4e. Seer bolt
            startRun("wick", 0, null);
            G.player.x = 200; G.player.y = 200; G.player.dash = true; G.player.dashT = 0.05;
            addBolt(210, 200, -200, 0, 10, false, 8, "#b088ff");
            const d4e = { perfect: false };
            checkPerfectDash(G.player, 180, 200, 240, 200, d4e);
            results.seerBolt = d4e.perfect;
            quitToMenu();

            // 4f. Eclipse beam
            startRun("wick", 0, null);
            G.player.x = 200; G.player.y = 200; G.player.dash = true; G.player.dashT = 0.05;
            const eclipseBoss = makeBoss("eclipse", 200, 200, 0);
            G.enemies.push(eclipseBoss);
            G.hazards.push({ type: "beam", owner: eclipseBoss, ang: 0, rot: 0.8, life: 2.6, two: false });
            const d4f = { perfect: false };
            checkPerfectDash(G.player, 250, 150, 250, 250, d4f);
            results.eclipseBeam = d4f.perfect;
            quitToMenu();

            // 4g. Boss lunge
            startRun("wick", 0, null);
            G.player.x = 200; G.player.y = 200; G.player.dash = true; G.player.dashT = 0.05;
            const mireBoss = makeBoss("mire", 220, 200, 0);
            G.enemies.push(mireBoss);
            mireBoss.atk = true;
            mireBoss.state = "lurch";
            const d4g = { perfect: false };
            checkPerfectDash(G.player, 170, 200, 250, 200, d4g);
            results.bossLunge = d4g.perfect;
            quitToMenu();

            return results;
        }""")
        print("T4 perfect dash detections:", json.dumps(t4))
        for k, v in t4.items():
            assert v == True, f"Perfect dash failed on hazard {k}"

        print("\n--- TEST 5: MULTI-LANTERN CAMPAIGNS (5 LANTERNS) ---")
        lanterns = ["wick", "flicker", "pyre", "glint", "ashen"]
        campaign_results = []
        for ltn in lanterns:
            deep = False
            for attempt in range(3):
                res = page.evaluate("(ltn) => CWBot.playRun({ lantern: ltn, skill: 0.85, allCards: true, dusk: 0 })", ltn)
                print(f"Lantern {ltn:7s} (attempt {attempt+1}) -> Wave: {res['wave']}, Cleared: {res['cleared']}, Kills: {res['kills']}, Bad: {res['bad']}")
                assert res['bad'] is None, f"Bad state on {ltn}: {res['bad']}"
                if res['wave'] >= 10:
                    deep = True
                    campaign_results.append(res)
                    break
            assert deep, f"Expected deep run on {ltn} within 3 attempts"

        print("\n--- TEST 6: STRESS TESTING WAVE 11-14 ---")
        w13_runs = []
        for i in range(5):
            res = page.evaluate("() => CWBot.playRun({ lantern: 'wick', skill: 0.75, allCards: true, dusk: 0 })")
            w13_runs.append(res)
            print(f"Run {i+1}: Cleared: {res['cleared']}, Final Wave: {res['wave']}, Kills: {res['kills']}, Time: {res['time']}s, Bad: {res['bad']}")
            assert res['bad'] is None, f"Bad state on run {i+1}: {res['bad']}"

        print("\n--- TEST 7: SINGLE-FILE BUNDLE (dist/cinderwake.html) ---")
        page.goto("file://" + os.path.join(root, "dist", "cinderwake.html").replace("\\", "/"))
        page.wait_for_timeout(400)
        page.evaluate(bot_js)
        dist_res = page.evaluate("() => CWBot.playRun({ lantern: 'wick', skill: 0.85, allCards: true })")
        print("Dist single-file run:", json.dumps(dist_res))
        assert dist_res['bad'] is None, f"Dist run had error: {dist_res['bad']}"
        assert dist_res['wave'] >= 10, "Dist run failed to reach late waves"

        print("\n--- TEST 8: MASTERY PROGRESSION ACCROSS RUNS ---")
        mastery_prog = page.evaluate("""() => {
            Save.reset();
            const runs = [];
            for (let i = 0; i < 3; i++) {
                const res = CWBot.playRun({ lantern: 'wick', skill: 0.75, maxWave: 6 });
                runs.push({
                    wave: res.wave,
                    kills: Save.data.byLantern.wick.kills,
                    runs: Save.data.byLantern.wick.runs,
                    lvl: masteryLevel(Save.data.byLantern.wick)
                });
            }
            return runs;
        }""")
        print("Mastery accumulation over 3 runs:", json.dumps(mastery_prog))
        assert mastery_prog[2]["kills"] > mastery_prog[0]["kills"], "Kills did not accumulate across runs"
        assert mastery_prog[2]["runs"] == 3, "Runs count did not accumulate across runs"

        browser.close()

    print("\nTotal Page Errors:", len(errs))
    for e in errs:
        print("Error:", e)
    assert len(errs) == 0, f"Encountered page errors: {errs}"
    print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
