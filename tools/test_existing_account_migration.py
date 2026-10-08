"""Test for Cinderwake: Existing Local Save -> Existing Cloud Account Migration.
Validates the entire flow:
1. Localhost guest progression
2. Pre-login snapshot capture
3. Existing cloud account login
4. Comparison confirmation modal ([Import Local Progress], [Keep Cloud Progress], [Cancel])
5. Explicit Import Local Progress execution
6. Cloudflare Worker D1 storage verification
7. Cross-origin production verification on https://cinderwake.raghavendragolla.com
8. Reload & second login persistence
9. Non-duplication checks (cinders, lifetimeScore, lanterns, achievements)
"""
import sys
import time
import json
import subprocess
from playwright.sync_api import sync_playwright

def main():
    timestamp = int(time.time())
    test_user = f"test_mig_{timestamp}"
    test_pwd = "TestPass123_Migration!"

    local_guest_data = {
        "v": 1,
        "cinders": 650,
        "totalCinders": 650,
        "lantern": "ashen",
        "lanterns": ["wick", "flicker", "ashen"],
        "stats": {
            "runs": 8,
            "clears": 2,
            "kills": 340,
            "dashes": 420,
            "bestScore": 12800,
            "bestWave": 15,
            "bestCombo": 42,
            "bestMulti": 6,
            "playTime": 920,
            "bossKills": 3,
            "bulwarkKills": 5,
            "reflects": 12,
            "perfectDashes": 18,
            "lifetimeScore": 22163
        },
        "byLantern": {
            "wick": {"runs": 4, "kills": 180, "best": 8500, "wave": 12},
            "flicker": {"runs": 2, "kills": 80, "best": 6200, "wave": 9},
            "ashen": {"runs": 2, "kills": 80, "best": 7400, "wave": 15}
        },
        "ach": {
            "firstcut": 1,
            "triple": 1,
            "quint": 1,
            "mire": 1,
            "loom": 1,
            "perfect1": 1
        },
        "enemyKills": {
            "blot": 150,
            "spire": 60,
            "husk": 80,
            "weaver": 50
        },
        "bossDefeats": {
            "mire": 2,
            "twin": 1
        },
        "seen": {
            "blot": 1,
            "spire": 1,
            "husk": 1,
            "weaver": 1,
            "mire": 1,
            "twin": 1
        },
        "seenSynergy": {
            "kindle_flicker": 1,
            "ashen_flame": 1
        },
        "duskMax": 2
    }

    print(f"\n=======================================================")
    print(f"CINDERWAKE EXISTING ACCOUNT MIGRATION TEST: {test_user}")
    print(f"=======================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # --- STEP 1: Create an existing cloud account on Worker with 0 progress ---
        print("\n--- STEP 1: Pre-creating cloud account with 0 progress ---")
        page.goto("http://127.0.0.1:5500")
        page.wait_for_timeout(500)
        # Directly call Worker register API with empty/initial state
        reg_res = page.evaluate("""async ([user, pwd]) => {
            const res = await fetch("https://cinderwake-save.raghavendrayadavgolla.workers.dev/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user, password: pwd })
            });
            return { status: res.status, ok: res.ok };
        }""", [test_user, test_pwd])
        print("Pre-registration status:", reg_res)
        assert reg_res["ok"], f"Failed to pre-create test account: {reg_res}"

        # Logout from this session so we start fresh
        page.evaluate("() => fetch('https://cinderwake-save.raghavendrayadavgolla.workers.dev/api/logout', { method: 'POST' })")
        page.wait_for_timeout(300)

        # --- STEP 2: Seed local guest progression on localhost ---
        print("\n--- STEP 2: Seeding localhost guest progression ---")
        page.evaluate("(dataStr) => { localStorage.clear(); localStorage.setItem('cinderwake.save.v1', dataStr); Save.load(); if (typeof UI === 'object' && UI.updateHearth) UI.updateHearth(); }", json.dumps(local_guest_data))
        page.wait_for_timeout(300)

        guest_state = page.evaluate("() => ({ mode: Cloud.mode, user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, lanterns: Save.data.lanterns })")
        print("Localhost state before cloud login:", guest_state)
        assert guest_state["mode"] == "guest", f"Expected guest mode, got {guest_state['mode']}"
        assert guest_state["cinders"] == 650, f"Expected 650 cinders, got {guest_state['cinders']}"
        assert guest_state["life"] == 22163, f"Expected 22163 lifetimeScore, got {guest_state['life']}"
        assert len(guest_state["lanterns"]) == 3, f"Expected 3 lanterns, got {guest_state['lanterns']}"
        guest_ach_count = page.evaluate("() => Object.keys(Save.data.ach).length")
        assert guest_ach_count == 6, f"Expected 6 guest achievements, got {guest_ach_count}"

        # --- STEP 3: Open Cloud Save UI ---
        print("\n--- STEP 3: Open Cloud Save modal on localhost ---")
        page.evaluate("() => UI.show('cloud')")
        page.wait_for_timeout(300)

        # --- STEP 4: Login to the EXISTING cloud account ---
        print("\n--- STEP 4: Logging in with existing cloud account credentials ---")
        page.fill("#cloudUsername", test_user)
        page.fill("#cloudPassword", test_pwd)
        page.click("#btnCloudLogin")
        page.wait_for_timeout(1000)

        # --- STEP 5: Verify Conflict / Comparison Confirmation Modal ---
        print("\n--- STEP 5: Verifying Conflict / Comparison Confirmation Modal ---")
        conflict_visible = page.evaluate("() => !document.getElementById('scr-conflict').hidden")
        print("Comparison modal visible:", conflict_visible)
        assert conflict_visible, "Comparison modal was NOT displayed!"

        comp_text = page.evaluate("() => document.getElementById('conflictComparison').innerText")
        print("Comparison content:\n", comp_text)
        assert "22,163" in comp_text or "22163" in comp_text, "Local lifetime score missing in comparison UI"
        assert "650" in comp_text, "Local cinders missing in comparison UI"

        # Check buttons
        has_import_btn = page.evaluate("() => !!document.getElementById('btnConflictImport')")
        has_keep_btn = page.evaluate("() => !!document.getElementById('btnConflictKeepCloud')")
        has_cancel_btn = page.evaluate("() => !!document.getElementById('btnConflictCancel')")
        assert has_import_btn, "Missing btnConflictImport button"
        assert has_keep_btn, "Missing btnConflictKeepCloud button"
        assert has_cancel_btn, "Missing btnConflictCancel button"

        # --- STEP 6: Click [Import Local Progress] ---
        print("\n--- STEP 6: Clicking [Import Local Progress] ---")
        page.click("#btnConflictImport")
        page.wait_for_timeout(1500)

        # Verify modal closed and cloud is connected
        cloud_state = page.evaluate("() => ({ mode: Cloud.mode, user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, lanterns: Save.data.lanterns, ach: Object.keys(Save.data.ach).length })")
        print("Localhost state after import:", cloud_state)
        assert cloud_state["mode"] == "account", f"Expected account mode, got {cloud_state['mode']}"
        assert cloud_state["user"]["username"] == test_user, f"Expected user {test_user}"
        assert cloud_state["cinders"] == 650, f"Expected 650 cinders, got {cloud_state['cinders']}"
        assert cloud_state["life"] == 22163, f"Expected 22163 life, got {cloud_state['life']}"
        assert len(cloud_state["lanterns"]) == 3, f"Expected 3 lanterns, got {cloud_state['lanterns']}"
        assert cloud_state["ach"] == 6, f"Expected 6 achievements, got {cloud_state['ach']}"

        # --- STEP 7: Verify [Back Up This Device] button exists in authed controls ---
        print("\n--- STEP 7: Verifying [Back Up This Device] button in Cloud Save UI ---")
        page.evaluate("() => UI.show('cloud')")
        page.wait_for_timeout(300)
        has_backup_btn = page.evaluate("() => !document.getElementById('btnCloudBackupDevice').hidden")
        print("Back Up This Device button available in UI:", has_backup_btn)
        assert has_backup_btn, "Missing Back Up This Device button in Cloud Save UI"

        # --- STEP 8: Open Production Site (https://cinderwake.raghavendragolla.com) ---
        print("\n--- STEP 8: Testing cross-origin production site https://cinderwake.raghavendragolla.com ---")
        prod_context = browser.new_context(viewport={"width": 1280, "height": 800})
        prod_page = prod_context.new_page()
        prod_page.goto("https://cinderwake.raghavendragolla.com")
        prod_page.wait_for_timeout(1000)

        prod_page.evaluate("() => UI.show('cloud')")
        prod_page.wait_for_timeout(300)

        print(f"Logging in on production with {test_user}...")
        prod_page.fill("#cloudUsername", test_user)
        prod_page.fill("#cloudPassword", test_pwd)
        prod_page.click("#btnCloudLogin")
        prod_page.wait_for_function("() => Cloud.mode === 'account' && Save.data.cinders > 0", timeout=15000)

        prod_state = prod_page.evaluate("() => ({ mode: Cloud.mode, user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, lanterns: Save.data.lanterns, ach: Object.keys(Save.data.ach).length })")
        print("Production site state after login:", prod_state)
        assert prod_state["mode"] == "account", f"Expected account mode on prod, got {prod_state['mode']}"
        assert prod_state["user"]["username"] == test_user, f"Expected username {test_user}"
        assert prod_state["cinders"] == 650, f"Expected 650 cinders on prod, got {prod_state['cinders']}"
        assert prod_state["life"] == 22163, f"Expected 22163 life on prod, got {prod_state['life']}"
        assert len(prod_state["lanterns"]) == 3, f"Expected 3 lanterns on prod, got {prod_state['lanterns']}"
        assert prod_state["ach"] == 6, f"Expected 6 achievements on prod, got {prod_state['ach']}"

        # --- STEP 9: Reload Production Page ---
        print("\n--- STEP 9: Reload production page and confirm session & progression persistence ---")
        prod_page.reload()
        prod_page.wait_for_function("() => Cloud.mode === 'account'", timeout=15000)
        reloaded_prod = prod_page.evaluate("() => ({ mode: Cloud.mode, user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, lanterns: Save.data.lanterns })")
        print("Production state after reload:", reloaded_prod)
        assert reloaded_prod["cinders"] == 650, f"Expected 650 cinders after reload, got {reloaded_prod['cinders']}"
        assert reloaded_prod["life"] == 22163, f"Expected 22163 life after reload, got {reloaded_prod['life']}"

        # --- STEP 10: Second Login Test on Production ---
        print("\n--- STEP 10: Logout and login again on production ---")
        prod_page.evaluate("() => UI.show('cloud')")
        prod_page.wait_for_timeout(300)
        prod_page.click("#btnCloudLogout")
        prod_page.wait_for_timeout(500)
        assert prod_page.evaluate("() => Cloud.mode") == "guest"

        prod_page.fill("#cloudUsername", test_user)
        prod_page.fill("#cloudPassword", test_pwd)
        prod_page.click("#btnCloudLogin")
        prod_page.wait_for_function("() => Cloud.mode === 'account'", timeout=15000)

        second_login_state = prod_page.evaluate("() => ({ mode: Cloud.mode, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore })")
        print("Production state after second login:", second_login_state)
        assert second_login_state["cinders"] == 650
        assert second_login_state["life"] == 22163

        # --- STEP 11: Non-duplication test ---
        print("\n--- STEP 11: Testing non-duplication on repeated sync / import ---")
        page.evaluate("() => UI.show('cloud')")
        page.wait_for_timeout(300)
        page.click("#btnCloudSync")
        page.wait_for_timeout(1000)

        dup_check = page.evaluate("() => ({ cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, lanterns: Save.data.lanterns, ach: Object.keys(Save.data.ach).length })")
        print("Duplication check result:", dup_check)
        assert dup_check["cinders"] == 650, f"Cinders duplicated! Got {dup_check['cinders']}"
        assert dup_check["life"] == 22163, f"Lifetime score duplicated! Got {dup_check['life']}"
        assert len(dup_check["lanterns"]) == 3, f"Lanterns duplicated! Got {dup_check['lanterns']}"
        assert dup_check["ach"] == 6, f"Achievements duplicated! Got {dup_check['ach']}"

        # Clean up test user from D1 database
        print(f"\n--- Cleaning up test user {test_user} from Cloudflare D1 ---")
        clean_sql = f"DELETE FROM users WHERE username = '{test_user}';"
        try:
            subprocess.run(["npx", "wrangler", "d1", "execute", "cinderwake-db", "--remote", "--command", clean_sql], shell=True, check=False)
        except Exception as e:
            print("Cleanup exception (non-fatal):", e)
        print("Cleaned up.")

        browser.close()

    print("\nALL EXISTING ACCOUNT MIGRATION TESTS PASSED 100%!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
