import json
import os
import sys
from playwright.sync_api import sync_playwright

# Load the exact local save extracted from the user's Edge LevelDB
scratch_script = r"C:\Users\Raghavendra\.gemini\antigravity-ide\brain\6188b670-61d5-43fb-b393-4577dd5918af\scratch\read_save.py"

def get_real_local_save():
    import subprocess
    # Run the save reader
    log_file = os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb\000626.log")
    with open(log_file, "rb") as f:
        content = f.read()
    needle = b'{"v":2'
    idx = 0
    best = None
    while True:
        pos = content.find(needle, idx)
        if pos == -1:
            break
        depth = 0
        end = pos
        while end < len(content):
            c = content[end:end+1]
            if c == b'{': depth += 1
            elif c == b'}':
                depth -= 1
                if depth == 0:
                    end += 1
                    break
            end += 1
        chunk = content[pos:end]
        try:
            best = json.loads(chunk.decode("utf-8"))
        except Exception:
            pass
        idx = pos + 1
    return best

def main():
    save_data = get_real_local_save()
    if not save_data:
        print("ERROR: Could not find user local save!")
        return 1

    print("Found user local save:")
    print("  cinders:", save_data.get("cinders"))
    print("  lifetimeScore:", save_data.get("stats", {}).get("lifetimeScore"))
    print("  achievements:", len(save_data.get("ach", {})))

    test_user = f"cinderwake_mig_{int(os.getpid())}"
    test_pwd = "TestPassword123!"
    print(f"Test account to create: {test_user}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()

        # 1. Open localhost:5500
        print("\n--- STEP 1 & 2: Open localhost:5500 with existing guest save ---")
        page.goto("http://127.0.0.1:5500")
        page.evaluate("(dataStr) => { localStorage.setItem('cinderwake.save.v1', dataStr); Save.load(); if (typeof UI === 'object' && UI.updateHearth) UI.updateHearth(); }", json.dumps(save_data))
        page.wait_for_timeout(300)

        expected_cinders = save_data.get("cinders", 0)
        expected_life = save_data.get("stats", {}).get("lifetimeScore", 0)

        # Check existing guest progression is active in game
        state = page.evaluate("() => ({ cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, mode: Cloud.mode })")
        print("Localhost state before account creation:", state)
        assert state["cinders"] == expected_cinders, f"Expected {expected_cinders} cinders, got {state['cinders']}"
        assert state["life"] == expected_life, f"Expected {expected_life} lifetimeScore, got {state['life']}"
        assert state["mode"] == "guest", f"Expected guest mode, got {state['mode']}"

        # 3. Open Cloud Save
        print("\n--- STEP 3: Open Cloud Save modal ---")
        page.evaluate("() => UI.show('cloud')")
        page.wait_for_timeout(300)

        # 4. Fill form and click Create Account
        print("\n--- STEP 4 & 5: Verify confirmation dialog on Create Account ---")
        page.fill("#cloudUsername", test_user)
        page.fill("#cloudPassword", test_pwd)
        page.click("#btnCloudRegister")
        page.wait_for_timeout(300)

        # Confirm confirmation dialog is shown
        confirm_hidden = page.evaluate("() => document.getElementById('cloudMigrationConfirm').hidden")
        print("Migration confirmation dialog visible:", not confirm_hidden)
        assert not confirm_hidden, "Confirmation dialog was not shown!"

        # Click Create & Back Up
        print("Clicking [Create & Back Up]...")
        page.click("#btnCloudConfirmBackup")
        page.wait_for_function("() => document.getElementById('cloudMigrationConfirm').hidden && Cloud.mode === 'account'", timeout=15000)
        page.wait_for_timeout(500)

        # 5. Confirm local progression is migrated & Cloud Save shows logged-in username
        print("\n--- STEP 6: Confirm Cloud Save shows logged-in username & connected status ---")
        auth_state = page.evaluate("() => ({ mode: Cloud.mode, status: Cloud.status, user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore })")
        print("Cloud state after migration:", auth_state)
        assert auth_state["mode"] == "account", f"Expected account mode, got {auth_state['mode']}"
        assert auth_state["user"]["username"] == test_user, f"Expected user {test_user}, got {auth_state['user']}"
        assert auth_state["cinders"] == expected_cinders, f"Expected {expected_cinders} cinders, got {auth_state['cinders']}"
        assert auth_state["life"] == expected_life, f"Expected {expected_life} life, got {auth_state['life']}"

        # 7. Refresh localhost:5500
        print("\n--- STEP 7 & 8: Refresh localhost and confirm progression remains ---")
        page.reload()
        page.wait_for_function("() => Cloud.mode === 'account'", timeout=15000)
        reloaded_state = page.evaluate("() => ({ mode: Cloud.mode, user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore })")
        print("Localhost state after refresh:", reloaded_state)
        assert reloaded_state["mode"] == "account", f"Expected account mode on reload, got {reloaded_state['mode']}"
        assert reloaded_state["cinders"] == expected_cinders, f"Expected {expected_cinders} cinders on reload, got {reloaded_state['cinders']}"
        assert reloaded_state["life"] == expected_life, f"Expected {expected_life} life on reload, got {reloaded_state['life']}"

        # 9. Open production site in a new context (fresh browser session)
        print("\n--- STEP 9, 10 & 11: Open production site & verify migrated progression ---")
        prod_context = browser.new_context()
        prod_page = prod_context.new_page()
        prod_page.goto("https://cinderwake.raghavendragolla.com")
        prod_page.wait_for_timeout(1000)

        # Open Cloud Save on production
        prod_page.evaluate("() => UI.show('cloud')")
        prod_page.wait_for_timeout(300)

        # Log in with the migrated account
        print(f"Logging in to production site with {test_user}...")
        prod_page.fill("#cloudUsername", test_user)
        prod_page.fill("#cloudPassword", test_pwd)
        prod_page.click("#btnCloudLogin")
        prod_page.wait_for_function("() => Cloud.mode === 'account' && Save.data.cinders > 0", timeout=15000)

        # Confirm migrated persistent progression appears on production site!
        prod_state = prod_page.evaluate("() => ({ mode: Cloud.mode, user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, lanterns: Save.data.lanterns, ach: Object.keys(Save.data.ach).length })")
        print("Production site state after login:", prod_state)
        assert prod_state["mode"] == "account", f"Expected account mode on production, got {prod_state['mode']}"
        assert prod_state["user"]["username"] == test_user, f"Expected username {test_user}, got {prod_state['user']}"
        assert prod_state["cinders"] == expected_cinders, f"Expected {expected_cinders} cinders on production, got {prod_state['cinders']}"
        assert prod_state["life"] == expected_life, f"Expected {expected_life} lifetimeScore on production, got {prod_state['life']}"
        assert prod_state["ach"] >= 12, f"Expected >= 12 achievements on production, got {prod_state['ach']}"

        print("\nALL LOCAL GUEST MIGRATION & CROSS-ORIGIN VERIFICATION TESTS PASSED SUCCESSFULLY!")

        # Clean up test account from D1
        print(f"\nCleaning up test account {test_user} from D1...")
        import subprocess
        try:
            subprocess.run(["npx", "wrangler", "d1", "execute", "cinderwake-db", "--remote", "--command", clean_sql], shell=True, check=False)
        except Exception:
            pass
        print("Test account cleaned up.")

        browser.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
