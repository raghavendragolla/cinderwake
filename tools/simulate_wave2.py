"""Simulate Wave 1, Wave 2, and Wave 3 specifically to gather detailed statistics:
- Hit counts per wave
- Death counts and causes
- Player Flame levels
- Enemy counts and Dart counts
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

    print("=== TESTING WAVE 2 MORTALITY & DAMAGE ACROSS SKILLS ===")
    
    # We test skills: 0.3 (beginner/casual), 0.5 (average human), 0.7 (skilled human)
    skills = [0.3, 0.5, 0.7]
    for sk in skills:
        w2_clears = 0
        w2_deaths = 0
        w1_deaths = 0
        total_runs = 20
        hits_in_w2 = []
        
        for r in range(total_runs):
            res = page.evaluate("""(sk) => {
                Save.reset();
                startRun("wick", 0, null);
                CWBot.bot.skill = sk;
                
                // Track hits in wave 1 and wave 2
                let w1Hits = 0, w2Hits = 0;
                let deathWave = 0;
                let killer = "";
                
                let steps = 0;
                let curWave = G.wave ? G.wave.n : 1;
                let lastHits = 0;
                
                while (steps < 3600 * 5) {
                    steps++;
                    if (G.state === "play") {
                        CWBot.step();
                        gameUpdate(1 / 60);
                        Input.endFrame();
                        
                        const w = G.wave ? G.wave.n : 1;
                        if (w !== curWave) {
                            curWave = w;
                            lastHits = G.run.hits;
                        }
                        if (curWave === 2) {
                            w2Hits = G.run.hits - lastHits;
                        }
                        if (!G.player.alive || G.state === "over") {
                            deathWave = curWave;
                            killer = G.summary ? G.summary.killedBy : "unknown";
                            break;
                        }
                        if (curWave >= 3) {
                            // Successfully cleared wave 2
                            break;
                        }
                    } else if (G.state === "upgrade") {
                        UI.pickCard(0);
                    } else {
                        break;
                    }
                }
                const clearedW2 = curWave >= 3 && G.player.alive;
                quitToMenu();
                return { clearedW2, deathWave, killer, w2Hits };
            }""", sk)
            
            if res["clearedW2"]:
                w2_clears += 1
                hits_in_w2.append(res["w2Hits"])
            else:
                if res["deathWave"] == 1:
                    w1_deaths += 1
                elif res["deathWave"] == 2:
                    w2_deaths += 1
                    hits_in_w2.append(res["w2Hits"])
                    
        avg_hits = sum(hits_in_w2) / len(hits_in_w2) if hits_in_w2 else 0
        print(f"Skill {sk}: W2 Clears = {w2_clears}/{total_runs} ({(w2_clears/total_runs*100):.0f}%), W2 Deaths = {w2_deaths}, W1 Deaths = {w1_deaths}, Avg W2 Hits = {avg_hits:.2f}")

    browser.close()
