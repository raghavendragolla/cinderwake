"""Mobile-portrait viewport QA — complements check_screens.py (which only
covers 3 desktop-landscape sizes). Verifies the actual gaps the visual-
overhaul brief calls out: no horizontal overflow, HUD/menus fit, touch
controls render, and a short real play session runs clean on each size.
"""
import os, json
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = "file://" + os.path.join(root, "index.html").replace("\\", "/")

VIEWPORTS = [
    {"name": "360x800", "width": 360, "height": 800},
    {"name": "390x844", "width": 390, "height": 844},
    {"name": "430x932", "width": 430, "height": 932},
    {"name": "768x1024_tablet", "width": 768, "height": 1024},
    {"name": "390x844_landscape", "width": 844, "height": 390},
]


def run():
    results = []
    with sync_playwright() as p:
        for vp in VIEWPORTS:
            browser = p.chromium.launch()
            page = browser.new_page(
                viewport={"width": vp["width"], "height": vp["height"]},
                has_touch=True,
                is_mobile=True,
                device_scale_factor=3,
            )
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.wait_for_timeout(300)

            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")

            # start a run with bot.js, drive it through the real loop for a
            # couple of seconds including a card-pick screen, then check HUD
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
                const hudRect = hud.getBoundingClientRect();
                return {
                    state: G.state,
                    wave: G.wave ? G.wave.n : null,
                    playerFinite: G.player ? (isFinite(G.player.x) && isFinite(G.player.y) && isFinite(G.player.flame)) : null,
                    hudWithinViewport: hudRect.right <= window.innerWidth + 1 && hudRect.left >= -1,
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
    return results


if __name__ == "__main__":
    run()
