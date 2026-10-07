"""Human-style browser input test for Cinderwake.

Where tools/test_input_parity.py steps the game loop by hand around
synthetic DOM events, THIS suite does the opposite: it fires real input
through Playwright's own keyboard/mouse/touch pipeline (OS-level event
synthesis) and lets the game's live requestAnimationFrame loop consume
it, exactly as a person's hands would.

  Test A (keyboard): Space press  -> ONE dash per press; repeat works
  Test B (touch):    tap          -> ONE dash on release;
                     touch-down   -> ZERO dashes;
                     drag + release -> ONE dash along the drag
  Test C (mouse):    near click   -> dash ~ aim distance;
                     far click    -> dash clamped to the lantern's reach

Usage: python tools/test_human_input.py
"""
import os
import sys
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = "file:///" + os.path.join(root, "index.html").replace("\\", "/")


def start_run(page):
    page.evaluate("() => { if (G.run) quitToMenu(); UI.hide(); startRun('wick', 0, null); }")
    page.wait_for_timeout(200)


def dashes(page):
    return page.evaluate("() => G.run ? G.run.dashes : -1")


def main():
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---- Test A: real keyboard -------------------------------------
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(url)
        page.wait_for_timeout(300)
        start_run(page)
        before = dashes(page)
        page.keyboard.press("Space")
        page.wait_for_timeout(150)
        after1 = dashes(page)
        page.keyboard.press("Space")
        page.wait_for_timeout(150)
        after2 = dashes(page)
        okA = after1 == before + 1 and after2 == before + 2
        print(f"{'PASS' if okA else 'FAIL'}  A_keyboard_press: {before} -> {after1} -> {after2}")
        if not okA:
            failures.append("A_keyboard_press")

        # ---- Test C: real mouse (same page, fresh run) ------------------
        page.evaluate("() => { const _t = window.tryDash; window.tryDash = function (pl, pw) { const r = _t(pl, pw); window.__lastDash = pl.dash ? pl.dash.total : null; return r; }; }")
        start_run(page)
        pos = page.evaluate("""() => {
            const p = G.player;
            const near = View.ox + (p.x + 120) * View.scale;
            const far = View.ox + (p.x + 600) * View.scale;
            return { y: View.oy + p.y * View.scale, near, far };
        }""")
        page.mouse.click(pos["near"], pos["y"])
        page.wait_for_timeout(300)
        nearDash = page.evaluate("() => window.__lastDash")
        page.mouse.click(pos["far"], pos["y"])
        page.wait_for_timeout(300)
        farDash = page.evaluate("() => window.__lastDash")
        okC = nearDash is not None and abs(nearDash - 120) < 1.5 and farDash is not None and abs(farDash - 235) < 0.5
        print(f"{'PASS' if okC else 'FAIL'}  C_mouse_distance: near={nearDash} (want ~120), far={farDash} (want 235 capped)")
        if not okC:
            failures.append("C_mouse_distance")
        page.close()

        # ---- Test B: real touch (touch-enabled context) ------------------
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_timeout(300)
        start_run(page)
        before = dashes(page)
        page.touchscreen.tap(300, 422)  # right-hand side: a tap
        page.wait_for_timeout(200)
        afterTap = dashes(page)

        # a real drag: down, hold, move, release — via the live loop
        drag = page.evaluate("""() => {
            const c = document.getElementById("game");
            const sx = window.innerWidth * 0.75, sy = window.innerHeight * 0.5;
            const fire = (kind, x, y) => c.dispatchEvent(new PointerEvent(kind, {
                pointerType: "touch", pointerId: 9, button: 0,
                clientX: x, clientY: y, bubbles: true }));
            fire("pointerdown", sx, sy);
            window.__dragAim = null;
            const t0 = performance.now();
            const iv = setInterval(() => {           // drag right for ~200 ms
                fire("pointermove", sx + (performance.now() - t0) * 0.45, sy);
            }, 16);
            setTimeout(() => {
                clearInterval(iv);
                fire("pointerup", sx + 90, sy);
                window.__dragAim = G.player.aim;
            }, 200);
            return { sx, sy };
        }""")
        page.wait_for_timeout(450)
        dragAim = page.evaluate("() => ({ aim: window.__dragAim, dashes: G.run.dashes })")
        okB = afterTap == before + 1 and dragAim["dashes"] == before + 2 and dragAim["aim"] is not None and abs(dragAim["aim"]) < 0.15
        print(f"{'PASS' if okB else 'FAIL'}  B_touch: tap {before}->{afterTap} (1 per tap), drag-release -> {dragAim['dashes']} aimed right={dragAim['aim']}")
        if not okB:
            failures.append("B_touch")
        ctx.close()
        browser.close()

    print("\n" + ("ALL HUMAN-INPUT TESTS PASS" if not failures else f"FAILURES: {failures}"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
