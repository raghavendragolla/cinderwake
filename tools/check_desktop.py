"""Desktop/laptop viewport QA — the upper half of the matrix check_mobile.py
doesn't cover. Same checks: no overflow, HUD in-bounds, real play stays
numerically clean.
"""
import os, json
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = "file://" + os.path.join(root, "index.html").replace("\\", "/")

VIEWPORTS = [
    {"name": "1024x768", "width": 1024, "height": 768},
    {"name": "1280x800", "width": 1280, "height": 800},
    {"name": "1366x768", "width": 1366, "height": 768},
    {"name": "1440x900", "width": 1440, "height": 900},
    {"name": "1600x900", "width": 1600, "height": 900},
    {"name": "1920x1080", "width": 1920, "height": 1080},
    {"name": "2560x1440", "width": 2560, "height": 1440},
]


def run():
    results = []
    with sync_playwright() as p:
        for vp in VIEWPORTS:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.wait_for_timeout(300)
            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            with open(os.path.join(root, "tools", "bot.js"), encoding="utf-8") as f:
                page.add_script_tag(content=f.read())
            info = page.evaluate(
                """() => {
                UI.hide();
                startRun("wick", 0, null);
                for (let i = 0; i < 240; i++) {
                    if (G.state === "play") { CWBot.step(); gameUpdate(1/60); Input.endFrame(); }
                    else if (G.state === "upgrade") { UI.pickCard(0); }
                }
                Render.draw(1/60);
                const hud = document.getElementById("hud");
                const r = hud.getBoundingClientRect();
                return {
                    state: G.state, wave: G.wave ? G.wave.n : null,
                    playerFinite: G.player ? (isFinite(G.player.x) && isFinite(G.player.y) && isFinite(G.player.flame)) : null,
                    hudWithinViewport: r.right <= window.innerWidth + 1 && r.left >= -1,
                    canvasVisible: !!document.getElementById("game").offsetWidth,
                };
            }"""
            )
            # headless check without saving images to repo
            browser.close()
            results.append({"viewport": vp["name"], "overflowPx": overflow, "errors": errors, **info})
    for r in results:
        print(json.dumps(r))
    bad = [r for r in results if r["overflowPx"] > 0 or r["errors"] or not r["playerFinite"] or not r["hudWithinViewport"] or not r["canvasVisible"]]
    print("FAILURES:" if bad else "ALL PASS", len(bad))


if __name__ == "__main__":
    run()
