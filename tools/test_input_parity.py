"""Input-parity regression suite for Cinderwake.

The audit that found the double-dash bug also found WHY no test caught it:
tools/bot.js drives dashes by poking Input.press directly and never models
a real gesture. This suite is the countermeasure. It loads the real page,
fires real DOM events (KeyboardEvent / PointerEvent) through the game's own
listeners, and steps the fixed timestep by hand for determinism, asserting
the input contract:

  keyboard: one keydown = ONE dash; keyup = nothing; hold = one dash
  touch:    touchstart = ZERO dashes; drag aims; touchend = ONE dash
  mouse:    one click gesture = ONE dash (on release)
  distance: a dash never exceeds the lantern's intended dashDist, whatever
            the cursor does; lantern identities (incl. Glint's blink and
            Pyre's charge) and Reach behave consistently across inputs
  AI:       the fairness check labels walls in the correct directions
            (canvas y-down: sector 2 = down, sector 6 = up)

It runs the same core battery against dist/cinderwake.html so the bundle is
proven to carry the fixed logic, not just the source tree.

Usage: python tools/test_input_parity.py
"""
import os
import sys
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TARGETS = [
    ("source", os.path.join(root, "index.html")),
    ("dist", os.path.join(root, "dist", "cinderwake.html")),
]

# ---- shared JS helpers, injected before every probe -----------------------
HELPERS = r"""
window.__h = {
  fresh(lantern) {
    if (G.run) quitToMenu();
    UI.hide();
    startRun(lantern, 0, null);
    G.state = "pause";            // silence the live rAF loop; we step by hand
    Input.capture = true;
    Input.reset();
    Input.touch = false;
    const p = G.player;
    p.x = G.W / 2; p.y = G.H / 2; p.vx = p.vy = 0;
    p.flame = G.S.maxFlame; p.hearts = G.S.maxHearts; p.inv = 0;
    G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
    G.hazards.length = 0; G.bolts.length = 0; G.shards.length = 0;
    return p;
  },
  frames(n) {
    for (let i = 0; i < n; i++) { gameUpdate(1 / 60); Input.endFrame(); }
  },
  keyDown(code) { window.dispatchEvent(new KeyboardEvent("keydown", { code: code || "Space" })); },
  keyUp(code) { window.dispatchEvent(new KeyboardEvent("keyup", { code: code || "Space" })); },
  keyRepeat(code) { window.dispatchEvent(new KeyboardEvent("keydown", { code: code || "Space", repeat: true })); },
  pointer(type, kind, dx, dy, id) {
    const canvas = document.getElementById("game");
    const ev = new PointerEvent(kind, {
      pointerType: type, pointerId: id || 5, button: 0, buttons: kind === "pointerup" ? 0 : 1,
      clientX: dx, clientY: dy, bubbles: true,
    });
    canvas.dispatchEvent(ev);
  },
  aimSide() { return { x: window.innerWidth * 0.75, y: window.innerHeight * 0.5 }; },
  /** Point the (mouse) aim at an arena-space offset from the player. */
  aimOffset(ax, ay) {
    const p = G.player;
    const cx = View.ox + (p.x + ax) * View.scale, cy = View.oy + (p.y + ay) * View.scale;
    Input.touch = false; Input.cx = cx; Input.cy = cy;
    Input.mouseT = Input.now = G.realT;
    return { cx, cy };
  },
  openSectors(res) {
    return res.safeAngles.map((a) => Math.round(a / (Math.PI / 4)));
  },
};
"""

# ---- deterministic probes: each returns an assertions-friendly object -----
PROBES = {
    # ----- keyboard -------------------------------------------------------
    "K1_keyboard_tap_is_one_dash": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      h.keyDown(); h.frames(1);
      const started = { dashes: G.run.dashes, dashing: !!p.dash };
      h.frames(14);                     // let the dash finish (~0.134 s)
      h.keyUp(); h.frames(30);          // keyup + ample time for any ghost dash
      return { started, dashes: G.run.dashes, flame: p.flame,
               ok: started.dashes === 1 && G.run.dashes === 1 && p.flame > 55 };
    }""",
    "K2_keyboard_hold_is_one_dash": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      h.keyDown(); h.frames(1); h.frames(44); h.keyRepeat(); h.frames(20); // 1s hold + OS-style repeat
      const heldDashes = G.run.dashes;
      h.keyUp(); h.frames(30);
      return { heldDashes, dashes: G.run.dashes,
               ok: heldDashes === 1 && G.run.dashes === 1 };
    }""",
    "K3_two_keyboard_taps_two_dashes": r"""
    () => {
      const h = window.__h; h.fresh("wick");
      h.keyDown(); h.frames(1); h.frames(14); h.keyUp(); h.frames(20);
      const afterFirst = G.run.dashes;
      h.keyDown(); h.frames(1); h.frames(14); h.keyUp(); h.frames(20);
      return { afterFirst, dashes: G.run.dashes, ok: afterFirst === 1 && G.run.dashes === 2 };
    }""",
    "K4_press_mid_dash_buffers_not_duplicates": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      h.keyDown(); h.frames(1);
      const duringDash = G.run.dashes;      // 1
      h.keyDown(); h.frames(2);             // second press mid-dash: buffered
      const still = G.run.dashes;           // must still be 1 until it ends
      h.frames(30);
      return { duringDash, still, dashes: G.run.dashes,
               ok: duringDash === 1 && still === 1 && G.run.dashes === 2 };
    }""",

    # ----- touch ----------------------------------------------------------
    "T1_touchdown_zero_dashes": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      const s = h.aimSide();
      h.pointer("touch", "pointerdown", s.x, s.y); h.frames(15);
      const down = { dashes: G.run.dashes, held: Input.held };
      h.pointer("touch", "pointerup", s.x, s.y); h.frames(10); // tap release = 1 dash
      return { down, dashes: G.run.dashes,
               ok: down.dashes === 0 && down.held === true && G.run.dashes === 1 };
    }""",
    "T2_touch_drag_aims_release_one_dash": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      const s = h.aimSide();
      h.pointer("touch", "pointerdown", s.x, s.y); h.frames(2);
      h.pointer("touch", "pointermove", s.x + 90, s.y); h.frames(3);
      const aimedRight = Math.abs(p.aim) < 0.05;   // drag points +x
      h.pointer("touch", "pointerup", s.x + 90, s.y); h.frames(1);
      // capture on the release frame itself: after later frames updateAim
      // legitimately falls back to auto-aim and flips aimAuto back on
      const at = { aimAuto: p.aimAuto, dashAng: p.dash ? p.dash.ang : null,
                   total: p.dash ? p.dash.total : null, dashes: G.run.dashes };
      h.frames(20);
      return { aimedRight, at, dashes: G.run.dashes,
               ok: aimedRight && at.dashes === 1 && at.aimAuto === false
                   && at.dashAng !== null && Math.abs(at.dashAng) < 0.05
                   && at.total !== null && Math.abs(at.total - G.S.dashDist) < 0.5 };
    }""",
    "T3_touch_tap_dashes_at_nearest": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      const e = spawnEnemy("blot", p.x + 200, p.y, null); e.spawn = 0;
      const s = h.aimSide();
      h.pointer("touch", "pointerdown", s.x, s.y); h.frames(2);
      const down = G.run.dashes;
      h.pointer("touch", "pointerup", s.x, s.y); h.frames(1);
      const ang = p.dash ? p.dash.ang : null;
      h.frames(20);
      return { down, ang, dashes: G.run.dashes,
               ok: down === 0 && G.run.dashes === 1 && ang !== null && Math.abs(ang) < 0.05 };
    }""",
    "T4_touch_pyre_charge_starts_on_touchdown": r"""
    () => {
      const h = window.__h; const p = h.fresh("pyre");
      const s = h.aimSide();
      h.pointer("touch", "pointerdown", s.x, s.y); h.frames(2);
      const charging = p.charging, downDashes = G.run.dashes;
      h.pointer("touch", "pointerup", s.x, s.y); h.frames(2);
      return { charging, downDashes, dashes: G.run.dashes,
               ok: charging === true && downDashes === 0 && G.run.dashes === 1 && !p.charging };
    }""",
    "T5_two_touch_gestures_two_dashes": r"""
    () => {
      const h = window.__h; h.fresh("wick");
      const s = h.aimSide();
      for (let i = 0; i < 2; i++) {
        h.pointer("touch", "pointerdown", s.x, s.y); h.frames(2);
        h.pointer("touch", "pointermove", s.x + 40, s.y - 60); h.frames(2);
        h.pointer("touch", "pointerup", s.x + 40, s.y - 60); h.frames(16);
      }
      return { dashes: G.run.dashes, ok: G.run.dashes === 2 };
    }""",

    # ----- mouse ----------------------------------------------------------
    "M1_mouse_click_is_one_dash_on_release": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      const s = h.aimSide();
      h.pointer("mouse", "pointerdown", s.x, s.y); h.frames(15);
      const down = G.run.dashes;
      h.pointer("mouse", "pointerup", s.x, s.y); h.frames(2);
      const afterUp = G.run.dashes;
      h.frames(20);
      return { down, afterUp, dashes: G.run.dashes, ok: down === 0 && afterUp === 1 && G.run.dashes === 1 };
    }""",

    # ----- dash distance contract (through real event paths) --------------
    "D1_mouse_far_cursor_respects_lantern_wick": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      const c = h.aimOffset(600, 0);
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const total = p.dash ? p.dash.total : null;
      h.frames(20);
      return { intended: G.S.dashDist, total, dashes: G.run.dashes,
               ok: total !== null && Math.abs(total - G.S.dashDist) < 0.5 && G.run.dashes === 1 };
    }""",
    "D2_keyboard_distance_is_lantern": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      Input.mouseT = -99; Input.now = 0;   // no mouse: aim falls back to keys
      h.keyDown(); h.frames(1);
      const total = p.dash ? p.dash.total : null;
      h.frames(20);
      return { intended: G.S.dashDist, total, ok: total !== null && Math.abs(total - G.S.dashDist) < 0.5 };
    }""",
    "D3_mouse_near_cursor_honoured_exactly": r"""
    () => {
      const h = window.__h; const p = h.fresh("wick");
      const c = h.aimOffset(120, 0);           // shorter than lantern reach (235)
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const total = p.dash ? p.dash.total : null;
      h.frames(20);
      return { requested: 120, total, ok: total !== null && Math.abs(total - 120) < 1 };
    }""",
    "L1_lantern_wick": r"""
    () => { const h = window.__h; const p = h.fresh("wick");
      const c = h.aimOffset(600, 0);
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const t = p.dash ? p.dash.total : null; h.frames(20);
      return { name: "wick", intended: G.S.dashDist, total: t, ok: t !== null && Math.abs(t - G.S.dashDist) < 0.5 }; }""",
    "L2_lantern_flicker_short_dash_restored": r"""
    () => { const h = window.__h; const p = h.fresh("flicker");
      const c = h.aimOffset(600, 0);
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const t = p.dash ? p.dash.total : null; h.frames(20);
      return { name: "flicker", intended: G.S.dashDist, total: t, ok: t !== null && Math.abs(t - G.S.dashDist) < 0.5 }; }""",
    "L3_lantern_ashen": r"""
    () => { const h = window.__h; const p = h.fresh("ashen");
      const c = h.aimOffset(600, 0);
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const t = p.dash ? p.dash.total : null; h.frames(20);
      return { name: "ashen", intended: G.S.dashDist, total: t, ok: t !== null && Math.abs(t - G.S.dashDist) < 0.5 }; }""",
    "L4_lantern_glint_blink_capped": r"""
    () => { const h = window.__h; const p = h.fresh("glint");
      const c = h.aimOffset(600, 0);
      const x0 = p.x;
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const moved = Math.hypot(p.x - x0, p.y - (G.H / 2));
      return { name: "glint", intended: G.S.dashDist, moved, dashes: G.run.dashes,
               ok: Math.abs(moved - G.S.dashDist) < 1 && G.run.dashes === 1 }; }""",
    "L5_lantern_glint_blink_near_aim_honoured": r"""
    () => { const h = window.__h; const p = h.fresh("glint");
      const c = h.aimOffset(120, 0);
      const x0 = p.x;
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const moved = Math.hypot(p.x - x0, p.y - (G.H / 2));
      return { name: "glint-near", requested: 120, moved, ok: Math.abs(moved - 120) < 1 }; }""",
    "L6_lantern_pyre_full_charge": r"""
    () => { const h = window.__h; const p = h.fresh("pyre");
      const c = h.aimOffset(600, 0);
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(42);   // 0.7 s >= 0.6 s charge
      const charged = p.charge >= 1;
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const t = p.dash ? p.dash.total : null; h.frames(24);
      return { name: "pyre-full", intended: G.S.dashDist, charged, total: t,
               ok: charged && t !== null && Math.abs(t - G.S.dashDist) < 0.5 }; }""",
    "L7_lantern_pyre_quick_tap_min_range": r"""
    () => { const h = window.__h; const p = h.fresh("pyre");
      const c = h.aimOffset(600, 0);
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(2);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const t = p.dash ? p.dash.total : null; h.frames(24);
      return { name: "pyre-tap", distMin: G.L.distMin, total: t,
               ok: t !== null && t >= G.L.distMin - 0.5 && t < G.L.distMin + 60 }; }""",
    "L8_reach_card_extends_mouse_dash": r"""
    () => { const h = window.__h; const p = h.fresh("wick");
      G.run.up.reach = 1; G.S = calcStats(G.run);   // +14 % dash distance
      const c = h.aimOffset(600, 0);
      h.pointer("mouse", "pointerdown", c.cx, c.cy); h.frames(1);
      h.pointer("mouse", "pointerup", c.cx, c.cy); h.frames(1);
      const t = p.dash ? p.dash.total : null; h.frames(20);
      const expected = LANTERNS.wick.dist * 1.14;
      return { name: "reach", expected, total: t, ok: t !== null && Math.abs(t - expected) < 0.6 }; }""",

    # ----- AI fairness wall sectors ---------------------------------------
    "A1_center_all_sectors_open": r"""
    () => { const r = AI.checkFairness({ x: G.W / 2, y: G.H / 2 }, [], []);
      return { open: r.openSectors, ok: r.openSectors === 8 }; }""",
    "A2_top_wall_chokes_upward_sectors": r"""
    () => { const r = AI.checkFairness({ x: G.W / 2, y: 20 }, [], []);
      const open = window.__h.openSectors(r);
      return { open, set: open.join(","), ok: r.openSectors === 5 && open.join(",") === "0,1,2,3,4" }; }""",
    "A3_bottom_wall_chokes_downward_sectors": r"""
    () => { const r = AI.checkFairness({ x: G.W / 2, y: G.H - 20 }, [], []);
      const open = window.__h.openSectors(r);
      return { open, set: open.join(","), ok: r.openSectors === 5 && open.join(",") === "0,4,5,6,7" }; }""",
    "A4_left_wall_chokes_leftward_sectors": r"""
    () => { const r = AI.checkFairness({ x: 20, y: G.H / 2 }, [], []);
      const open = window.__h.openSectors(r);
      return { open, set: open.join(","), ok: r.openSectors === 5 && open.join(",") === "0,1,2,6,7" }; }""",
    "A5_right_wall_chokes_rightward_sectors": r"""
    () => { const r = AI.checkFairness({ x: G.W - 20, y: G.H / 2 }, [], []);
      const open = window.__h.openSectors(r);
      return { open, set: open.join(","), ok: r.openSectors === 5 && open.join(",") === "2,3,4,5,6" }; }""",
    "A6_top_and_bottom_are_symmetric": r"""
    () => { const mk = (x, y) => ({ x, y, atk: true, dead: false });
      const above = AI.checkFairness({ x: G.W / 2, y: 20 }, [mk(G.W / 2, -130)], []).openSectors;
      const below = AI.checkFairness({ x: G.W / 2, y: G.H - 20 }, [mk(G.W / 2, G.H + 130)], []).openSectors;
      return { above, below, ok: above === 5 && below === 5 && above === below }; }""",
    "A7_legal_attack_not_rejected_in_open_field": r"""
    () => { const e = { x: G.W / 2 + 300, y: G.H / 2, atk: true, dead: false };
      const r = AI.checkFairness({ x: G.W / 2, y: G.H / 2 }, [e], []);
      return { isFair: r.isFair, open: r.openSectors, ok: r.isFair === true }; }""",
}

# The core battery re-run against dist/cinderwake.html:
DIST_SUBSET = [
    "K1_keyboard_tap_is_one_dash", "K2_keyboard_hold_is_one_dash",
    "T1_touchdown_zero_dashes", "T2_touch_drag_aims_release_one_dash",
    "T3_touch_tap_dashes_at_nearest", "M1_mouse_click_is_one_dash_on_release",
    "D1_mouse_far_cursor_respects_lantern_wick", "D3_mouse_near_cursor_honoured_exactly",
    "L2_lantern_flicker_short_dash_restored",
    "A2_top_wall_chokes_upward_sectors", "A3_bottom_wall_chokes_downward_sectors",
]


def run(page, url, names, errs):
    page.goto("file:///" + url.replace("\\", "/"))
    page.wait_for_timeout(300)
    results = []
    for name in names:
        js = "(function(){" + HELPERS + "\nreturn (" + PROBES[name] + ")();\n})()"
        try:
            res = page.evaluate(js)
        except Exception as ex:  # noqa: BLE001 — a probe crash is a FAIL, not a suite crash
            errs.append(f"{name}: {ex}")
            results.append((name, {"ok": False, "error": str(ex)}))
            continue
        results.append((name, res))
    return results


def main():
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for label, path in TARGETS:
            names = list(PROBES) if label == "source" else DIST_SUBSET
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            errs = []
            page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
            page.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
            print(f"\n=== {label.upper()}: {os.path.basename(path)} ===")
            for name, res in run(page, path, names, errs):
                ok = res.get("ok") is True
                detail = {k: v for k, v in res.items() if k != "ok"}
                print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")
                if not ok:
                    failures.append((label, name, detail))
            for e in errs:
                print(f"  ! {e}")
                failures.append((label, "console/pageerror", e))
            page.close()
        browser.close()

    print("\n================ SUMMARY ================")
    print(f"{'ALL PASS' if not failures else str(len(failures)) + ' FAILURE(S)'}")
    for f in failures:
        print(" -", f)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
