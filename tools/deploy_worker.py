import tomllib
import os
import urllib.request
import urllib.error
import json

def deploy():
    config_path = os.path.expanduser(r"~\AppData\Roaming\xdg.config\.wrangler\config\default.toml")
    with open(config_path, "rb") as f:
        config = tomllib.load(f)
    token = config["oauth_token"]
    account_id = "7f11516cbd542e9c87ef0891c18d7c2a"
    script_name = "cinderwake-save"
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}"

    with open("worker.js", "r", encoding="utf-8") as f:
        code = f.read()

    boundary = "----CloudflareWorkerBoundaryDeploy"
    metadata = {
        "main_module": "worker.js",
        "bindings": [
            {
                "name": "DB",
                "type": "d1",
                "id": "b1a82098-2fd7-455f-aa00-ca12e2309172"
            }
        ],
        "compatibility_date": "2026-10-07"
    }

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(b'Content-Disposition: form-data; name="metadata"\r\n')
    body.extend(b"Content-Type: application/json\r\n\r\n")
    body.extend(json.dumps(metadata).encode("utf-8"))
    body.extend(b"\r\n")

    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(b'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n')
    body.extend(b"Content-Type: application/javascript+module\r\n\r\n")
    body.extend(code.encode("utf-8"))
    body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="PUT"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print("Deploy successful!")
            print(json.dumps(data, indent=2))
            return True
    except urllib.error.HTTPError as e:
        print(f"Deploy HTTP Error {e.code}:")
        print(e.read().decode("utf-8"))
        return False

if __name__ == "__main__":
    deploy()
