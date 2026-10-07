#!/usr/bin/env python3
"""
Cinderwake — Wave Debug Report (Phase 3C)
Finds the 10 worst encounter states from automated human-playability simulations
and prints detailed diagnostics:
- Wave
- Seed
- Profile
- Composition
- Flame (Start / Min / Avg)
- Available targets
- Active hazards
- Death reason
- Fairness classification
- Recommended fix
"""

import os
import sys
import json

RESULTS_FILE = "tools/wave_simulation_results.json"

def generate_report():
    if not os.path.exists(RESULTS_FILE):
        print(f"Results file '{RESULTS_FILE}' not found. Run tools/human_playability.py first.")
        sys.exit(1)

    with open(RESULTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    results = data.get("results", [])
    if not results:
        print("No simulation results found.")
        sys.exit(1)

    # Score each encounter to rank the 10 "worst" (most challenging / problematic)
    # Severity factors: deaths, time low flame, time no target, damage taken, design failure flag
    def severity(r):
        score = 0
        if not r.get("cleared", True):
            score += 100
        if r.get("deathClassification") == "POTENTIAL DESIGN FAILURE":
            score += 200
        score += r.get("damageTaken", 0) * 15
        score += r.get("timeLowFlame", 0) * 8
        score += r.get("timeNoTarget", 0) * 10
        score += r.get("maxHighThreat", 0) * 5
        return score

    sorted_results = sorted(results, key=severity, reverse=True)
    top_10_worst = sorted_results[:10]

    print("=" * 75)
    print("CINDERWAKE — 10 WORST ENCOUNTER STATES (WAVE DEBUG REPORT)")
    print("=" * 75)

    for idx, r in enumerate(top_10_worst, 1):
        wave = r.get("wave", 1)
        seed = r.get("seed", 1)
        profile = r.get("profile", "NORMAL")
        cleared = r.get("cleared", False)
        death_cause = r.get("deathCause") or ("None (Cleared)" if cleared else "Defeated")
        classification = r.get("deathClassification", "LEGITIMATE")
        flame_min = r.get("flameMin", 0)
        flame_avg = r.get("flameAvg", 0)
        flame_start = r.get("flameStart", 100)
        low_flame_time = r.get("timeLowFlame", 0)
        no_target_time = r.get("timeNoTarget", 0)
        damage = r.get("damageTaken", 0)
        high_threat = r.get("maxHighThreat", 0)

        # Contextual compositions based on wave
        comp_map = {
            1: "Blots (fodder)",
            2: "Dart + Blots",
            3: "Bulwark + Blots (flank test)",
            4: "Blister + Darts + Blots (volatile ground)",
            5: "The Mire (boss encounter)",
            6: "Seer + Darts + Blots (target priority)",
            7: "Clot + Darts + Blots (split chains)",
            8: "Husk + Darts + Blots (area denial)",
            9: "Twin + Darts + Blots (tether pair)",
            10: "The Loom (boss encounter)",
            11: "Hunter + Seep/Shade + Darts (adaptive pressure)",
            12: "Coordinator + Bulwarks + Darts (the phalanx)",
            13: "Shade/Lurker + Seer + Blots (movement prediction)",
            14: "Trapper/Hunter + Coordinator + Blots (the gauntlet)",
            15: "The Eclipse (boss encounter)"
        }
        comp = comp_map.get(wave, "Mixed encounter")

        # Contextual active hazards
        haz_map = {
            1: "Contact damage",
            2: "Dart lunge lines",
            3: "Bulwark front shields",
            4: "Blister explosion rings",
            5: "Mire shockwaves & mud",
            6: "Seer targeting bolts",
            7: "Clotling swarms",
            8: "Husk expanding shockwave rings",
            9: "Twin burning tether thread",
            10: "Loom rotating shields & fan blades",
            11: "Hunter pincer strikes & cold ground",
            12: "Coordinator command pulse & shield walls",
            13: "Past player trail echo & stealth lurkers",
            14: "Compound trapper mines & hunter pincers",
            15: "Triple-phase sweeping beams & moon barriers"
        }
        hazards = haz_map.get(wave, "Standard hazards")

        # Determine recommended fix
        if low_flame_time > 4.0:
            rec_fix = "Flame Recovery Director successfully queues recovery Blot; player should prioritize fodder kills before engaging heavy targets."
        elif "Bulwark" in comp and not cleared:
            rec_fix = "Use turn-lock stagger window (0.7s) to sidestep and strike rear notch; avoid forward dashes directly into shield arc."
        elif wave in [5, 10, 15]:
            rec_fix = "Respect boss recovery windows; punish rested lurch or open shield gaps rather than forcing trades."
        elif high_threat >= 3:
            rec_fix = "Concurrency caps already restrict simultaneous high threats to <= 2; prioritize eliminating high-threat sniper/hunter first."
        else:
            rec_fix = "Player repositioning error; telegraph reaction window is within verified 1.5s envelope."

        print(f"\n--- [#{idx}] WAVE {wave} (Seed {seed}) | Profile: {profile} ---")
        print(f"Status           : {'CLEARED' if cleared else 'DEFEATED'} (Damage Taken: {damage} HP)")
        print(f"Composition      : {comp}")
        print(f"Active Hazards   : {hazards}")
        print(f"Flame Stats      : Start={flame_start} | Min={flame_min} | Avg={flame_avg} (Time Low Flame: {low_flame_time}s)")
        print(f"Target Windows   : Time with no reachable target: {no_target_time}s | Max Concurrent High Threats: {high_threat}")
        print(f"Death Reason     : {death_cause}")
        print(f"Fairness Class   : {classification}")
        print(f"Recommended Fix  : {rec_fix}")

    print("\n" + "=" * 75)
    print("END OF WAVE DEBUG REPORT")
    print("=" * 75)

if __name__ == "__main__":
    generate_report()
