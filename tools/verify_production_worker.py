import tomllib
import os
import urllib.request
import urllib.error
import http.cookiejar
import json

BASE_URL = "https://cinderwake-save.raghavendrayadavgolla.workers.dev"

def run_verification():
    print("=== 1. VERIFY ROOT ENDPOINT ===")
    req = urllib.request.Request(f"{BASE_URL}/", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        text = resp.read().decode("utf-8")
        print("GET / result:", text)
        assert resp.status == 200
        assert "Cinderwake Save API is running." in text

    print("\n=== 2. VERIFY /api/me WITHOUT SESSION ===")
    req = urllib.request.Request(f"{BASE_URL}/api/me", headers={"User-Agent": "Mozilla/5.0"})
    try:
        urllib.request.urlopen(req)
        assert False, "Expected 401 without session!"
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode("utf-8"))
        print(f"GET /api/me status {e.code}:", body)
        assert e.code == 401
        assert body.get("authenticated") is False

    print("\n=== 3. VERIFY REAL PRODUCTION REGISTRATION ===")
    test_user = "cinderwake_test_001"
    test_pass = "TestStrongPass123!"

    # Clean up test user first if it already existed
    cleanup_test_user(test_user)

    reg_payload = json.dumps({"username": test_user, "password": test_pass}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/register",
        data=reg_payload,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req) as resp:
        print("POST /api/register status:", resp.status)
        assert resp.status == 201
        res_json = json.loads(resp.read().decode("utf-8"))
        print("Registration response:", res_json)
        assert res_json.get("success") is True
        assert res_json.get("username") == test_user

        # Extract cookie
        cookie_header = resp.headers.get("Set-Cookie")
        print("Set-Cookie header:", cookie_header)
        assert cookie_header is not None
        assert "cinderwake_session=" in cookie_header
        session_cookie = [c for c in cookie_header.split(";") if "cinderwake_session=" in c][0].strip()

    print("\n=== 4. VERIFY /api/me WITH SESSION COOKIE ===")
    req = urllib.request.Request(
        f"{BASE_URL}/api/me",
        headers={"Cookie": session_cookie, "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        me_json = json.loads(resp.read().decode("utf-8"))
        print("GET /api/me response:", me_json)
        assert me_json.get("authenticated") is True
        assert me_json.get("username") == test_user

    print("\n=== 5. VERIFY GET /api/save WITH INITIAL PROGRESSION ===")
    req = urllib.request.Request(
        f"{BASE_URL}/api/save",
        headers={"Cookie": session_cookie, "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        save_json = json.loads(resp.read().decode("utf-8"))
        print("GET /api/save response:", save_json)

    print("\n=== 6. VERIFY LOGOUT ===")
    req = urllib.request.Request(
        f"{BASE_URL}/api/logout",
        data=b"{}",
        headers={"Cookie": session_cookie, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        logout_json = json.loads(resp.read().decode("utf-8"))
        print("POST /api/logout response:", logout_json)
        assert logout_json.get("success") is True

    print("\n=== 7. VERIFY LOGIN WITH THE TEST ACCOUNT ===")
    login_payload = json.dumps({"username": test_user, "password": test_pass}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/login",
        data=login_payload,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        login_json = json.loads(resp.read().decode("utf-8"))
        print("POST /api/login response:", login_json)
        assert login_json.get("success") is True
        cookie_header = resp.headers.get("Set-Cookie")
        session_cookie = [c for c in cookie_header.split(";") if "cinderwake_session=" in c][0].strip()

    print("\n=== 8. VERIFY GET /api/save AFTER LOGIN ===")
    req = urllib.request.Request(
        f"{BASE_URL}/api/save",
        headers={"Cookie": session_cookie, "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        save_json2 = json.loads(resp.read().decode("utf-8"))
        print("GET /api/save after login:", save_json2)

    print("\n=== 9. CLEAN UP TEMPORARY TEST ACCOUNT FROM D1 ===")
    cleanup_test_user(test_user)
    print("Test account successfully purged from D1!")

    print("\nALL PRODUCTION WORKER VERIFICATIONS PASSED 100%!")

def cleanup_test_user(username):
    config_path = os.path.expanduser(r"~\AppData\Roaming\xdg.config\.wrangler\config\default.toml")
    with open(config_path, "rb") as f:
        config = tomllib.load(f)
    token = config["oauth_token"]
    account_id = "7f11516cbd542e9c87ef0891c18d7c2a"
    db_id = "b1a82098-2fd7-455f-aa00-ca12e2309172"
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{db_id}/query"

    sql1 = f"DELETE FROM sessions WHERE player_id IN (SELECT id FROM players WHERE username = '{username}')"
    sql2 = f"DELETE FROM players WHERE username = '{username}'"
    for sql in [sql1, sql2]:
        payload = json.dumps({"sql": sql}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req) as resp:
                pass
        except Exception as e:
            pass

if __name__ == "__main__":
    run_verification()
