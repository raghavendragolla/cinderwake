"""Test all 15 waves and execute the 5 varied runs with distinct lanterns and builds."""
import sys, json, os
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_tests():
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.on("console", lambda m: errs.append((m.type, m.text)) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(("pageerror", str(e))))
        pg.goto("file://" + root + "/index.html")
        pg.wait_for_timeout(400)
        pg.add_script_tag(path=root + "/tools/bot.js")

        print("=== 1. AUDIT OF ALL 15 WAVES ===")
        wave_info = pg.evaluate("""() => {
            const out = [];
            for (let w = 1; w <= 15; w++) {
                const def = waveDef(w);
                const pool = def.pool ? Object.keys(def.pool) : [];
                out.push({
                    wave: w,
                    intro: def.intro || "",
                    boss: !!def.boss,
                    bossName: def.boss || "",
                    maxAlive: def.maxAlive || 8,
                    budget: def.budget || 0,
                    pool: pool,
                });
            }
            return out;
        }""")
        for winfo in wave_info:
            bname = f" ({winfo['bossName']})" if winfo['boss'] else ""
            print(f"Wave {winfo['wave']:2d} | Boss: {str(winfo['boss']):<5}{bname:<11} | MaxAlive: {winfo['maxAlive']:2d} | Budget: {winfo['budget']:3d} | Pool: {','.join(winfo['pool']):<40} | Intro: {winfo['intro']}")

        print("\n=== 2. THE FIVE-RUN TEST (5 DISTINCT LANTERNS & BUILDS) ===")
        runs_to_test = [
            {"lantern": "wick", "skill": 0.82, "prefer": ["chain", "momentum", "echo"], "label": "Run 1: Wick (Chain/Echo)"},
            {"lantern": "flicker", "skill": 0.85, "prefer": ["shard", "flare", "ward"], "label": "Run 2: Flicker (Shard/Flare)"},
            {"lantern": "pyre", "skill": 0.85, "prefer": ["cleave", "heavy", "overheat"], "label": "Run 3: Pyre (Heavy Cleave)"},
            {"lantern": "glint", "skill": 0.82, "prefer": ["guard", "echo", "kindling"], "label": "Run 4: Glint (Guard/Echo)"},
            {"lantern": "ashen", "skill": 0.80, "prefer": ["trail", "oil", "scorch"], "label": "Run 5: Ashen (Trail/Scorch)"}
        ]

        results = []
        for rconfig in runs_to_test:
            print(f"\nLaunching {rconfig['label']}...")
            res = pg.evaluate("(o) => CWBot.playRun(o)", rconfig)
            res["label"] = rconfig["label"]
            results.append(res)
            print(f" -> Cleared: {res['cleared']} | Final Wave: {res['wave']} | Kills: {res['kills']} | Time: {res['time']}s | Hits: {res['hits']} | Combo: {res['combo']} | Multi: {res['multi']}")
            print(f"    Build: {res['up']}")
            print(f"    Wave times (s): {res['waves']}")
            if res.get('bad'):
                print(f"    BAD NUMBERS: {res['bad']}")
            if res.get('stuck'):
                print(f"    STUCK: {res['stuck']}")

        b.close()
    
    print("\nTotal Page Errors:", len(errs))
    if errs:
        for e in errs:
            print("ERR:", e)

    return results

if __name__ == "__main__":
    run_tests()
