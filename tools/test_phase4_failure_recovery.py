from playwright.sync_api import sync_playwright
import os, sys, json

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    url = "file:///" + os.path.join(root, "index.html").replace("\\", "/")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(url)
        page.wait_for_timeout(500)

        # 1. Start fresh run, earn some score and cinders
        res1 = page.evaluate("""() => {
            if (G.run) quitToMenu();
            UI.hide();
            startRun('wick', 0, null);
            G.state = 'play';
            addScore(400, 0, 0, true);
            G.run.cindersEarned = 15;
            Save.data.cinders = 15;
            Save.save();
            return {
                runScore: G.run.score,
                lifeScore: Save.data.stats.lifetimeScore,
                cinders: Save.data.cinders
            };
        }""")
        print("Initial state after score:", res1)
        assert res1["runScore"] == 400
        assert res1["lifeScore"] == 400
        assert res1["cinders"] == 15

        # 2. Advance to Wave 2, down player to trigger Rekindle
        res_rekindle = page.evaluate("""() => {
            G.run.checkpointWave = 2;
            beginWave(2);
            G.player.hearts = 1;
            G.player.ward = false;
            hurtPlayer('blot');
            return {
                lastEmber: !!G.lastEmber,
                rekindledBefore: G.run.rekindled,
                hasTarget: !!(G.lastEmber && G.lastEmber.target)
            };
        }""")
        print("Downed state (Rekindle available):", res_rekindle)
        assert res_rekindle["lastEmber"] is True
        assert res_rekindle["rekindledBefore"] is False

        # 3. Rekindle: Dash through the ember beacon
        res_revived = page.evaluate("""() => {
            const le = G.lastEmber;
            const tgt = le.target;
            G.player.x = tgt.x - 30;
            G.player.y = tgt.y;
            G.player.aim = 0;
            tryDash(G.player, 1);
            for (let i = 0; i < 10; i++) gameUpdate(1/60);
            return {
                lastEmber: !!G.lastEmber,
                rekindledAfter: G.run.rekindled,
                alive: G.player.alive,
                hearts: G.player.hearts
            };
        }""")
        print("Revived state:", res_revived)
        assert res_revived["rekindledAfter"] is True
        assert res_revived["alive"] is True
        assert res_revived["hearts"] == 1

        # 4. Fail wave completely (second lethal damage)
        res_death = page.evaluate("""() => {
            G.player.dash = null;
            G.player.hearts = 1;
            G.player.inv = 0;
            hurtPlayer('blot');
            for (let i = 0; i < 120; i++) gameUpdate(1/60);
            return {
                alive: G.player.alive,
                state: G.state,
                screen: UI.cur
            };
        }""")
        print("After second lethal damage:", res_death)
        assert res_death["alive"] is False
        assert res_death["state"] == "checkpoint"
        assert res_death["screen"] == "checkpoint"

        # 5. Retry checkpoint
        res_retry = page.evaluate("""() => {
            restartCheckpoint();
            return {
                state: G.state,
                wave: G.run.wave,
                alive: G.player.alive,
                hearts: G.player.hearts,
                lifeScore: Save.data.stats.lifetimeScore,
                cinders: Save.data.cinders
            };
        }""")
        print("After checkpoint retry:", res_retry)
        assert res_retry["state"] == "play"
        assert res_retry["wave"] == 2
        assert res_retry["alive"] is True
        assert res_retry["lifeScore"] == 400
        assert res_retry["cinders"] == 15

        # 6. End run / Fail completely -> return to menu
        res_menu = page.evaluate("""() => {
            quitToMenu();
            return {
                state: G.state,
                lifeScore: Save.data.stats.lifetimeScore,
                cinders: Save.data.cinders
            };
        }""")
        print("After quitToMenu:", res_menu)
        assert res_menu["lifeScore"] == 400
        assert res_menu["cinders"] == 15

        # 7. Start again
        res_new_run = page.evaluate("""() => {
            startRun('wick', 0, null);
            G.state = 'play';
            addScore(250, 0, 0, true);
            return {
                runScore: G.run.score,
                lifeScore: Save.data.stats.lifetimeScore,
                cinders: Save.data.cinders
            };
        }""")
        print("New run score accumulation:", res_new_run)
        assert res_new_run["runScore"] == 250
        assert res_new_run["lifeScore"] == 650
        assert res_new_run["cinders"] >= 15

        browser.close()
        print("\n>>> PART 9 FAILURE / RECOVERY TEST PASSED 100% <<<")

if __name__ == "__main__":
    main()
