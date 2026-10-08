# CINDERWAKE — AGENTS GUIDELINES & PERMANENT RULES

## HARD RULE: FULL-SCREEN MOUSE AIM GUIDE DRAGGING

**CRITICAL REQUIREMENT — DO NOT MODIFY OR REVERT IN ANY FUTURE PROMPTS:**

1. **Aim Guide Mouse Dragging Across Entire Screen**:
   - The dotted aim guide line MUST remain freely draggable across the **entire screen / arena** using the mouse.
   - When `Input.mouseActive()` is true, the visual line length `d` in `js/render.js` must extend directly to the mouse cursor (`Math.max(20, p.aimDist)`).
   - The end ring must stay positioned directly at the mouse cursor.
   - **DO NOT** clamp the visual aim guide dotted line to `S.dashDist` (235px).
   - **DO NOT** add secondary cut marker rings or split the line.
   - The start offset must smoothly adapt (`Math.min(24, d * 0.5)`).

2. **Pointer Event Capture**:
   - Window listeners in `js/input.js` must maintain mouse pointerdown/pointermove capture across the entire viewport.

3. **Combat Balance Separation**:
   - Combat dash physics (`dashLengthFor(p)` in `js/player.js`) remains frozen and capped to `S.dashDist` (235px). Only the visual aim guide dotted line extends across the entire screen.

4. **Build Integrity**:
   - Every build (`tools/build.py`) must keep `dist/cinderwake.html` synchronized with this behavior.
