"""Headless play-test for Cinderwake: loads the real page in Chromium,
injects tools/bot.js and plays full runs at high speed.
Usage: python3 tools/playtest.py [runs-per-setting]"""
import sys, json, os
from playwright.sync_api import sync_playwright
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
sets = json.loads(sys.argv[2]) if len(sys.argv) > 2 else [{"skill": s} for s in (0.3, 0.6, 0.9)]
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.on("console", lambda m: errs.append((m.type, m.text)) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append(("pageerror", str(e))))
    pg.goto("file://" + root + "/index.html")
    pg.wait_for_timeout(300)
    pg.add_script_tag(path=root + "/tools/bot.js")
    for st in sets:
        for i in range(N):
            r = pg.evaluate("(o) => CWBot.playRun(o)", st)
            print(json.dumps(r))
    b.close()
print("page errors:", len(errs))
for e in errs[:10]: print(e)
