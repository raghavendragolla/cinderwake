"""Rekindle / Last Ember target-selection tests for Cinderwake.

The Last Ember marks ONE target that must be cut within 2.5 s. Selection
used to be pure nearest-enemy, which could mark a Bulwark facing you (dash
bounces), a boss, or a cloaked Lurker when a clean target stood nearby.
Selection now ranks by distance plus reachability penalties. These tests
pin the ranking and the end-to-end rekindle flow.

Usage: python tools/test_rekindle_targets.py
"""
import os
import sys
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = "file:///" + os.path.join(root, "index.html").replace("\\", "/")

PROBES = {
    "R1_nearer_bulwark_facing_you_loses_to_blot": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const bw = spawnEnemy('bulwark', p.x + 100, p.y, null); bw.spawn = 0;
      bw.facing = Math.atan2(p.y - bw.y, p.x - bw.x);          // shield faces you
      const bl = spawnEnemy('blot', p.x + 220, p.y + 30, null); bl.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t.type === 'blot', picked: t ? t.type : null };
    }""",
    "R2_nearer_bulwark_facing_away_still_wins": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const bw = spawnEnemy('bulwark', p.x + 100, p.y, null); bw.spawn = 0;
      bw.facing = Math.atan2(p.y - bw.y, p.x - bw.x) + Math.PI; // shield faces away
      const bl = spawnEnemy('blot', p.x + 220, p.y + 30, null); bl.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t.type === 'bulwark', picked: t ? t.type : null };
    }""",
    "R3_boss_loses_to_any_add": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const boss = makeBoss('mire', p.x + 150, p.y - 150, 0); G.enemies.push(boss);
      const bl = spawnEnemy('blot', p.x + 180, p.y, null); bl.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t.type === 'blot', picked: t ? t.type : null };
    }""",
    "R4_boss_alone_is_valid_target": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const boss = makeBoss('mire', p.x + 150, p.y - 150, 0); boss.spawn = 0; G.enemies.push(boss);
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      // and the ritual completes through the boss hook
      const before = G.run.rekindled;
      damageEnemy(t, 1, 'dash', 0, { hits: 0, kills: 0 });
      return { ok: !!t && t.type === 'mire' && G.run.rekindled && !before,
               picked: t ? t.type : null, rekindled: G.run.rekindled, hearts: G.player.hearts };
    }""",
    "R5_no_candidates_spawns_slow_blot": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.inv = 0; p.dash = null; p.hearts = 1;
      hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t.type === 'blot' && t.isEmberTarget === true && t.speed <= 30,
               picked: t ? t.type : null };
    }""",
    "R6_cloaked_lurker_loses_to_farther_dart": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const lu = spawnEnemy('lurker', p.x + 120, p.y, null); lu.spawn = 0; lu.cloak = 1;
      const da = spawnEnemy('dart', p.x + 200, p.y + 40, null); da.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t.type === 'dart', picked: t ? t.type : null };
    }""",
    "R7_awake_lurker_is_a_fair_target": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const lu = spawnEnemy('lurker', p.x + 120, p.y, null); lu.spawn = 0; lu.cloak = 0;
      const da = spawnEnemy('dart', p.x + 200, p.y + 40, null); da.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t.type === 'lurker', picked: t ? t.type : null };
    }""",
    "R8_cornered_still_marks_nearest_clean_target": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = 30; p.y = 30; p.inv = 0; p.dash = null;
      const bl = spawnEnemy('blot', G.W / 2, G.H / 2, null); bl.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t.type === 'blot' && t === bl, picked: t ? t.type : null };
    }""",
    "R9_nearest_of_equals_still_wins": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const a = spawnEnemy('blot', p.x + 150, p.y, null); a.spawn = 0;
      const c = spawnEnemy('blot', p.x + 300, p.y, null); c.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const t = G.lastEmber && G.lastEmber.target;
      return { ok: !!t && t === a, picked: t ? t.type : null };
    }""",
    "R10_end_to_end_dash_the_marked_target_rekindles": r"""
    () => {
      UI.hide(); startRun('wick', 0, null);
      G.enemies.length = 0; G.spawns.length = 0; G.wave.queue = [];
      const p = G.player; p.x = G.W / 2; p.y = G.H / 2; p.inv = 0; p.dash = null;
      const bl = spawnEnemy('blot', p.x + 200, p.y, null); bl.spawn = 0;
      p.hearts = 1; hurtPlayer('bolt');
      const marked = G.lastEmber.target;
      damageEnemy(marked, 1, 'dash', 0, { hits: 0, kills: 0 });
      return { ok: G.run.rekindled && G.player.hearts === 1 && G.player.flame >= 45 && !G.lastEmber,
               rekindled: G.run.rekindled, hearts: G.player.hearts, flame: Math.round(G.player.flame) };
    }""",
}


def main():
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(url)
        page.wait_for_timeout(300)
        for name, js in PROBES.items():
            try:
                res = page.evaluate("(" + js + ")()")
            except Exception as ex:  # noqa: BLE001
                res = {"ok": False, "error": str(ex)}
            ok = res.get("ok") is True
            print(f"{'PASS' if ok else 'FAIL'}  {name}  {res}")
            if not ok:
                failures.append((name, res))
        for e in errs:
            print("  ! pageerror:", e)
            failures.append(("pageerror", e))
        browser.close()
    print("\n" + ("ALL REKINDLE TARGET TESTS PASS" if not failures else f"FAILURES: {len(failures)}"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
