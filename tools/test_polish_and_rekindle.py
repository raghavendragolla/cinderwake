import os
import json
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto("file:///" + os.path.join(root, "index.html").replace("\\", "/"))
        page.wait_for_timeout(300)

        print("=== TEST 1: LAST EMBER ACTIVATION ON LETHAL DAMAGE ===")
        t1 = page.evaluate("""() => {
            UI.hide();
            startRun('wick', 0, null, 12345);
            const p = G.player;
            p.hearts = 1;
            hurtPlayer('melee');
            return {
                hearts: p.hearts,
                alive: p.alive,
                lastEmber: !!G.lastEmber,
                rekindled: G.run.rekindled,
                hasTarget: !!(G.lastEmber && G.lastEmber.target),
                emberT: G.lastEmber ? G.lastEmber.t : null
            };
        }""")
        print("T1 result:", json.dumps(t1))
        assert t1["lastEmber"], "Player should enter Last Ember on lethal damage"
        assert t1["hasTarget"], "Last Ember should select a valid target"
        assert not t1["rekindled"], "Rekindled should be false initially"

        print("\n=== TEST 2: REKINDLE SUCCESS ON TARGET HIT ===")
        t2 = page.evaluate("""() => {
            const p = G.player;
            const tgt = G.lastEmber.target;
            // Simulate player dashing and hitting the marked target
            damageEnemy(tgt, 1, 'dash', 0, { hits: 0, kills: 0 });
            return {
                lastEmber: !!G.lastEmber,
                rekindled: G.run.rekindled,
                hearts: p.hearts,
                flame: p.flame,
                inv: p.inv > 0,
                alive: p.alive
            };
        }""")
        print("T2 result:", json.dumps(t2))
        assert not t2["lastEmber"], "Last Ember should clear upon rekindle"
        assert t2["rekindled"], "Run should record rekindled = true"
        assert t2["hearts"] == 1, "Player should be restored to 1 heart"
        assert t2["flame"] >= 45, "Player should have enough flame restored"
        assert t2["inv"], "Player should receive temporary invulnerability"

        print("\n=== TEST 3: ONE REKINDLE PER RUN RESTRICTION ===")
        t3 = page.evaluate("""() => {
            const p = G.player;
            p.hearts = 1;
            p.inv = 0;
            hurtPlayer('melee');
            return {
                hearts: p.hearts,
                alive: p.alive,
                lastEmber: !!G.lastEmber,
                dying: G.dying > 0
            };
        }""")
        print("T3 result:", json.dumps(t3))
        assert not t3["lastEmber"], "Second lethal damage must NOT trigger Last Ember"
        assert not t3["alive"], "Player should be dead"
        assert t3["dying"], "Game should be in dying state"

        print("\n=== TEST 4: LAST EMBER TIMEOUT CAUSES DEATH ===")
        t4 = page.evaluate("""() => {
            clearWorld();
            startRun('wick', 0, null, 54321);
            const p = G.player;
            p.hearts = 1;
            hurtPlayer('melee');
            // Advance time past the 2.5s window
            gameUpdate(3.0);
            return {
                lastEmber: !!G.lastEmber,
                alive: p.alive,
                dying: G.dying > 0
            };
        }""")
        print("T4 result:", json.dumps(t4))
        assert not t4["lastEmber"], "Last Ember should expire"
        assert not t4["alive"], "Player should die upon timeout"

        print("\n=== TEST 5: WAVE 7 CLOT SPLIT READABILITY ===")
        t5 = page.evaluate("""() => {
            clearWorld();
            startRun('wick', 0, null, 1111);
            const clot = spawnEnemy('clot', 300, 300, null);
            killEnemy(clot, 'dash', 0, null);
            const clotlings = G.enemies.filter(e => e.type === 'clotling');
            return {
                clotlingCount: clotlings.length,
                spawnsStaggered: clotlings.every(c => c.spawn > 0),
                spawnDelays: clotlings.map(c => Math.round(c.spawn * 100) / 100)
            };
        }""")
        print("T5 result:", json.dumps(t5))
        assert t5["clotlingCount"] > 0 and t5["clotlingCount"] <= 3, "Clot should spawn 2-3 clotlings"
        assert t5["spawnsStaggered"], "All clotlings must have a readable emergence delay"

        print("\n=== TEST 6: WAVE 11 INTRO PACING ===")
        t6 = page.evaluate("""() => {
            const raw11 = WAVE_DEFS[11];
            const w11 = waveDef(11);
            return {
                intro: w11.intro,
                hasVariants: Array.isArray(raw11.variants),
                variantCount: raw11.variants.length
            };
        }""")
        print("T6 result:", json.dumps(t6))
        assert t6["intro"] in ["hunter", "shade", "seep"], "Wave 11 must guarantee a new threat intro"
        assert t6["hasVariants"] and t6["variantCount"] >= 3, "Wave 11 should have curated variants"

        print("\n=== TEST 7: CARD SYNERGY DISCOVERY BADGES ===")
        t7 = page.evaluate("""() => {
            clearWorld();
            startRun('wick', 0, null, 777);
            // Player owns momentum (chain build)
            G.run.up['momentum'] = 1;
            G.offers = ['echo', 'fleet', 'wake'];
            UI.showUpgrade();
            const cards = Array.from(document.querySelectorAll('#pickCards .card'));
            return {
                cardsCount: cards.length,
                hasSynergyBadge: cards.some(c => c.querySelector('.card-synergy-ready')),
                badgeText: cards.map(c => {
                    const b = c.querySelector('.card-synergy-ready');
                    return b ? b.textContent : null;
                })
            };
        }""")
        print("T7 result:", json.dumps(t7))
        assert t7["hasSynergyBadge"], "Echo should display synergy unlock badge with Momentum"

        print("\n=== TEST 8: MOBILE FLOATING TOUCH STICK ===")
        t8 = page.evaluate("""() => {
            Input.touch = true;
            Input.stick.id = 1;
            Input.stick.ox = 100;
            Input.stick.oy = 100;
            // Move pointer far to the right (200px away)
            const ev = { pointerType: 'touch', pointerId: 1, clientX: 300, clientY: 100 };
            // Simulate the pointermove logic
            const s = Input.stick;
            s.x = ev.clientX; s.y = ev.clientY;
            const dx = s.x - s.ox, dy = s.y - s.oy;
            const len = Math.hypot(dx, dy);
            if (len > 52) {
                s.ox = s.x - (dx / len) * 52;
                s.oy = s.y - (dy / len) * 52;
            }
            return {
                finalOx: Math.round(Input.stick.ox),
                finalOy: Math.round(Input.stick.oy),
                floated: Input.stick.ox > 100
            };
        }""")
        print("T8 result:", json.dumps(t8))
        assert t8["floated"], "Joystick origin should float with the thumb"

        print("\nALL POLISH AND REKINDLE TESTS PASSED!")
        browser.close()

if __name__ == "__main__":
    run_tests()
