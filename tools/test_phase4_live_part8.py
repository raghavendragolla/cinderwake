from playwright.sync_api import sync_playwright
import time
import sys

def main():
    test_user = f"phase4_v_{int(time.time())}"
    test_pwd = "Phase4Password123!"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context1 = browser.new_context()
        page1 = context1.new_page()
        page1.goto("https://cinderwake.raghavendragolla.com")
        page1.wait_for_timeout(1000)

        # Step 1 & 2: Start as guest & set initial guest progression
        page1.evaluate("""() => {
            Save.data.cinders = 250;
            Save.data.stats.lifetimeScore = 4500;
            Save.data.lanterns = ['wick', 'flicker'];
            Save.data.ach = { first: 1, multi: 1 };
            Save.save();
        }""")
        guest_prog = page1.evaluate("() => ({ cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, mode: Cloud.mode })")
        print("Step 1 & 2 Guest prog:", guest_prog)

        # Step 3, 4, 5, 6: Open Cloud Save, create account, verify migration
        page1.evaluate("() => UI.show('cloud')")
        page1.fill("#cloudUsername", test_user)
        page1.fill("#cloudPassword", test_pwd)
        page1.click("#btnCloudRegister")
        page1.wait_for_timeout(400)
        
        # If confirmation prompt appears, confirm
        has_confirm = not page1.evaluate("() => document.getElementById('cloudMigrationConfirm').hidden")
        if has_confirm:
            print("Confirmation prompt displayed -> Clicking Create & Back Up")
            page1.click("#btnCloudConfirmBackup")

        page1.wait_for_function("() => Cloud.mode === 'account' && Cloud.status === 'connected'", timeout=15000)
        auth_state = page1.evaluate("() => ({ user: Cloud.user, mode: Cloud.mode, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore })")
        print("Step 5 & 6 Migrated account state:", auth_state)
        assert auth_state["user"]["username"] == test_user
        assert auth_state["cinders"] == 250
        assert auth_state["life"] == 4500

        # Step 7: Make new progression & push
        page1.evaluate("""async () => {
            Save.data.cinders += 50;
            Save.data.stats.lifetimeScore += 1000;
            Save.save();
            await Cloud.pushCloudSave(Cloud.toCloudPayload(Save.data));
        }""")

        # Step 8 & 9: Refresh & verify progression remains
        page1.reload()
        page1.wait_for_function("() => Cloud.mode === 'account' && Save.data.cinders === 300", timeout=15000)
        refreshed_prog = page1.evaluate("() => ({ user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore })")
        print("Step 8 & 9 After refresh:", refreshed_prog)
        assert refreshed_prog["cinders"] == 300
        assert refreshed_prog["life"] == 5500

        # Step 10: Logout
        page1.evaluate("async () => { await Cloud.logout(); }")
        logged_out_state = page1.evaluate("() => ({ mode: Cloud.mode, user: Cloud.user })")
        print("Step 10 Logged out:", logged_out_state)
        assert logged_out_state["mode"] == "guest"

        # Step 11 & 12: Login again & verify cloud progression returns
        page1.evaluate(f"async () => {{ await Cloud.login('{test_user}', '{test_pwd}'); }}")
        page1.wait_for_function("() => Save.data.cinders === 300", timeout=15000)
        relogin_prog = page1.evaluate("() => ({ user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore })")
        print("Step 11 & 12 Relogin prog:", relogin_prog)
        assert relogin_prog["cinders"] == 300
        assert relogin_prog["life"] == 5500

        # Step 13, 14, 15: Clean/incognito browser (Context 2)
        context2 = browser.new_context()
        page2 = context2.new_page()
        page2.goto("https://cinderwake.raghavendragolla.com")
        page2.wait_for_timeout(1000)
        page2.evaluate(f"""async () => {{
            UI.show('cloud');
            await Cloud.login('{test_user}', '{test_pwd}');
        }}""")
        page2.wait_for_function("() => Save.data.cinders === 300", timeout=15000)
        incognito_prog = page2.evaluate("() => ({ user: Cloud.user, cinders: Save.data.cinders, life: Save.data.stats.lifetimeScore, lanterns: Save.data.lanterns })")
        print("Step 13, 14, 15 Clean browser prog:", incognito_prog)
        assert incognito_prog["user"]["username"] == test_user
        assert incognito_prog["cinders"] == 300
        assert incognito_prog["life"] == 5500
        print("\n>>> ALL 15 STEPS OF PART 8 PASSED FLAWLESSLY ON PRODUCTION SITE! <<<")

if __name__ == "__main__":
    main()
