"""Targeted QA test for Wave 2:
Runs 50 runs across skill levels (0.3, 0.5, 0.7, 0.9) specifically measuring Wave 2 metrics.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto("file://" + os.path.join(root, "index.html").replace("\\", "/"))
    page.wait_for_timeout(300)

    with open(os.path.join(root, "tools", "bot.js"), "r", encoding="utf-8") as f:
        bot_js = f.read()
    page.evaluate(bot_js)

    print("=== EXTENSIVE WAVE 2 QA SIMULATION (50 RUNS) ===")
    
    total_runs = 50
    clears = 0
    deaths = 0
    death_causes = {}
    hits_list = []
    times_list = []

    for i in range(total_runs):
        sk = 0.4 + (i % 5) * 0.12 # Test across skill gradient 0.4 to 0.88
        res = page.evaluate("""(sk) => {
            Save.reset();
            startRun("wick", 0, null);
            CWBot.bot.skill = sk;
            let hitsW2 = 0;
            let curWave = 1;
            let lastHits = 0;
            let steps = 0;
            let w2Start = 0, w2End = 0;

            while (steps < 3600 * 5) {
                steps++;
                if (G.state === "play") {
                    CWBot.step();
                    gameUpdate(1 / 60);
                    Input.endFrame();

                    const w = G.wave ? G.wave.n : 1;
                    if (w !== curWave) {
                        if (w === 2) w2Start = steps;
                        if (curWave === 2) w2End = steps;
                        curWave = w;
                        lastHits = G.run.hits;
                    }
                    if (curWave === 2) {
                        hitsW2 = G.run.hits - lastHits;
                    }
                    if (!G.player.alive || G.state === "over") break;
                    if (curWave >= 3) break;
                } else if (G.state === "upgrade") {
                    UI.pickCard(0);
                } else break;
            }
            const cleared = curWave >= 3 && G.player.alive;
            const killedBy = G.summary ? G.summary.killedBy : (G.killedBy || "");
            const w2Time = w2End > w2Start ? Math.round((w2End - w2Start) / 60) : 0;
            quitToMenu();
            return { cleared, deathWave: curWave, killedBy, hitsW2, w2Time };
        }""", sk)

        if res["cleared"]:
            clears += 1
            hits_list.append(res["hitsW2"])
            times_list.append(res["w2Time"])
        else:
            deaths += 1
            cause = res["killedBy"] or "unknown"
            death_causes[cause] = death_causes.get(cause, 0) + 1
            hits_list.append(res["hitsW2"])

    avg_hits = sum(hits_list) / len(hits_list) if hits_list else 0
    avg_time = sum(times_list) / len(times_list) if times_list else 0
    print(f"Results: {clears}/{total_runs} Cleared ({clears/total_runs*100:.1f}%), {deaths} Deaths")
    print(f"Average hits taken in Wave 2: {avg_hits:.2f}")
    print(f"Average Wave 2 duration: {avg_time:.1f}s")
    print(f"Death causes: {death_causes}")

    browser.close()
