"""Phase 2A/2B/2I balance baseline: full bot campaigns with the corrected
gesture model (Phase 1), across lanterns, input profiles and build intents.

Usage:
  python tools/balance_baseline.py lanterns [runs_per_lantern]
  python tools/balance_baseline.py profiles [runs_per_config]
  python tools/balance_baseline.py builds  [runs_per_build]

Writes raw JSON to %TEMP%/cw_baseline_<name>.json and prints per-wave and
per-config aggregates. NOTE: these numbers describe the BOT at the given
skill levels, not humans; they are for finding structural imbalance, not
for setting final tuning.
"""
import json
import os
import statistics
import sys
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = "file:///" + os.path.join(root, "index.html").replace("\\", "/")
SKILLS = [0.5, 0.6, 0.7, 0.8, 0.9]
LANTERNS = ["wick", "flicker", "pyre", "glint", "ashen"]
BUILD_PREFERS = {
    "chain": ["momentum", "kindling", "chain", "fever"],
    "trail": ["wake", "trail", "backdraft", "wildfire"],
    "echo": ["echo", "crosscut", "resonance", "echo"],
    "guard": ["ward", "flare", "deflect", "riposte", "guard"],
    "shard": ["splinter", "ricochet", "starburst", "shard"],
}


def run_batch(pg, configs, label):
    rows = []
    for cfg in configs:
        for i in range(cfg["runs"]):
            opts = dict(cfg["opts"])
            opts["skill"] = SKILLS[i % len(SKILLS)]
            r = pg.evaluate("(o) => CWBot.playRun(o)", opts)
            r["_cfg"] = cfg["name"]
            rows.append(r)
        print(f"  [{label}] {cfg['name']}: {cfg['runs']} runs done", flush=True)
    return rows


def aggregate(rows):
    waves = [r["wave"] for r in rows]
    cleared = [r for r in rows if r["cleared"]]
    out = {
        "runs": len(rows),
        "avg_wave": round(statistics.mean(waves), 2),
        "median_wave": statistics.median(waves),
        "clear_rate": round(len(cleared) / len(rows), 3),
        "avg_time": round(statistics.mean([r["time"] for r in rows]), 1),
        "avg_hits": round(statistics.mean([r["hits"] for r in rows if r["hits"] >= 0]), 2),
        "avg_kills_per_dash": round(statistics.mean([r["kills"] / max(1, r["dashes"]) for r in rows]), 3),
        "avg_perfects": round(statistics.mean([r["perfects"] for r in rows]), 1),
        "rekindle_rate": round(sum(1 for r in rows if r["rekindled"]) / len(rows), 3),
        "flame_eff": round(statistics.mean([r["flameGained"] / max(1, r["flameSpent"]) for r in rows]), 3),
        "avg_combo": round(statistics.mean([r["combo"] for r in rows]), 1),
        "bad_runs": sum(1 for r in rows if r["bad"]),
        "death_waves": {},
        "death_causes": {},
        "qual": {},
        "mods_seen": {},
    }
    for r in rows:
        if not r["cleared"]:
            out["death_waves"][r["wave"]] = out["death_waves"].get(r["wave"], 0) + 1
            c = r["deathCause"][:38]
            out["death_causes"][c] = out["death_causes"].get(c, 0) + 1
        for k, v in (r.get("quality") or {}).items():
            out["qual"][k] = out["qual"].get(k, 0) + v
        for w in r.get("waveLog", []):
            if w["mod"]:
                out["mods_seen"][w["mod"]] = out["mods_seen"].get(w["mod"], 0) + 1
    # per-wave aggregates (only waves actually reached by most runs)
    per_wave = {}
    for r in rows:
        for w in r.get("waveLog", []):
            d = per_wave.setdefault(w["n"], {"reached": 0, "hit": 0, "time": [], "hits": [], "dashes": [], "kills": [], "flameEnd": [], "mods": {}})
            d["reached"] += 1
            d["hit"] += 1 if w["hit"] else 0
            for k in ("time", "hits", "dashes", "kills", "flameEnd"):
                d[k].append(w[k])
            if w["mod"]:
                d["mods"][w["mod"]] = d["mods"].get(w["mod"], 0) + 1
    out["per_wave"] = {
        n: {
            "reached": d["reached"],
            "hit_pct": round(d["hit"] / d["reached"], 2),
            "avg_time": round(statistics.mean(d["time"]), 1),
            "avg_hits": round(statistics.mean(d["hits"]), 2),
            "avg_dashes": round(statistics.mean(d["dashes"]), 1),
            "avg_kills": round(statistics.mean(d["kills"]), 1),
            "avg_flame_end": round(statistics.mean(d["flameEnd"]), 0),
            "mods": d["mods"],
        }
        for n, d in sorted(per_wave.items())
    }
    return out


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "lanterns"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    if name == "lanterns":
        configs = [{"name": f"{l}-key", "runs": n, "opts": {"lantern": l, "profile": "key", "allCards": True, "dusk": 0}} for l in LANTERNS]
    elif name == "profiles":
        configs = [{"name": f"{l}-{p}", "runs": n, "opts": {"lantern": l, "profile": p, "allCards": True, "dusk": 0}}
                   for l in ("wick", "flicker") for p in ("key", "mouse", "touch")]
    elif name == "builds":
        configs = [{"name": f"wick-{b}", "runs": n, "opts": {"lantern": "wick", "profile": "key", "allCards": True, "dusk": 0, "prefer": pref}}
                   for b, pref in BUILD_PREFERS.items()]
    else:
        raise SystemExit("config: lanterns | profiles | builds")

    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url)
        pg.wait_for_timeout(300)
        with open(os.path.join(root, "tools", "bot.js"), encoding="utf-8") as f:
            pg.add_script_tag(content=f.read())
        rows = run_batch(pg, configs, name)
        b.close()

    result = {cfg["name"]: aggregate([r for r in rows if r["_cfg"] == cfg["name"]]) for cfg in configs}
    out_path = os.path.join(os.environ.get("TEMP", "/tmp"), f"cw_baseline_{name}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "aggregate": result}, f)
    print(json.dumps(result, indent=1))
    print("page errors:", len(errs), errs[:5])
    print("saved:", out_path)


if __name__ == "__main__":
    main()
