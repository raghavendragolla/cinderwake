import os, sys
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = "file://" + os.path.join(root, "index.html").replace("\\", "/")

def test_screen_overflow():
    with sync_playwright() as p:
        # Typical laptop browser viewport (accounting for browser UI)
        viewports = [
            {"width": 1280, "height": 720, "name": "720p"},
            {"width": 1366, "height": 650, "name": "laptop_compact"},
            {"width": 1024, "height": 600, "name": "small_screen"},
        ]
        
        for vp in viewports:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]})
            page.goto(url)
            page.wait_for_timeout(300)
            
            # 1. Test Loadout screen
            loadout_info = page.evaluate("""() => {
                UI.show("loadout");
                const panel = document.querySelector("#scr-loadout .panel");
                return {
                    scrollHeight: panel.scrollHeight,
                    clientHeight: panel.clientHeight,
                    overflows: panel.scrollHeight > panel.clientHeight
                };
            }""")
            print(f"Viewport {vp['name']} ({vp['width']}x{vp['height']}) -> Loadout: scrollHeight={loadout_info['scrollHeight']}, clientHeight={loadout_info['clientHeight']}, overflows={loadout_info['overflows']}")
            
            # 2. Test Game Over screen with sample run summary
            over_info = page.evaluate("""() => {
                const sampleSummary = {
                    score: 263,
                    prevBest: 2795,
                    newBest: false,
                    wave: 1,
                    kills: 8,
                    time: 15.2,
                    cinders: 13,
                    hearts: 0,
                    hits: 3,
                    combo: 8,
                    multi: 3,
                    flameSpent: 120,
                    flameRefund: 70,
                    perfectDashes: 0,
                    masterfulDashes: 0,
                    newAch: [],
                    newDisc: [],
                    quality: { clean: 3, sharp: 1, brutal: 1, masterful: 0 },
                    killedBy: "dart",
                    causeTip: "Caught at your last heart.",
                    afford: ["pyre", "flare", "wake"]
                };
                UI.showOver(sampleSummary);
                const panel = document.querySelector("#scr-over .panel");
                return {
                    scrollHeight: panel.scrollHeight,
                    clientHeight: panel.clientHeight,
                    overflows: panel.scrollHeight > panel.clientHeight
                };
            }""")
            print(f"Viewport {vp['name']} ({vp['width']}x{vp['height']}) -> Over: scrollHeight={over_info['scrollHeight']}, clientHeight={over_info['clientHeight']}, overflows={over_info['overflows']}")
            browser.close()

if __name__ == "__main__":
    test_screen_overflow()
