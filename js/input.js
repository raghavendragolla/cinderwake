"use strict";
/* Cinderwake — input. Keyboard, mouse and touch all feed the same small
   state: a move vector, an aim, and press / release edges for the dash. */

const DASH_KEYS = { Space: 1, KeyJ: 1, KeyK: 1, Enter: 0 };
const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

const Input = {
  capture: false, // true while a run is being played
  keys: Object.create(null),
  cx: 0, cy: 0, // last mouse position, client pixels
  mouseT: -99, // G.realT of the last mouse activity
  now: 0,
  press: false, // keyboard dash edge (keydown only; keyup never dashes)
  release: false, // pointer dash edge (mouse or touch pointerup only)
  touchPress: false, // touch aim-thumb down edge: may begin a charge, never a dash
  held: false,
  touch: false, // most recent input came from a touch screen
  tap: false, // the last touch release was a tap, not a drag
  stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  aimS: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  aimVec: { x: 0, y: 0, len: 0 },

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (!this.capture) return;
      if (e.code in MOVE_KEYS || e.code === "Space") e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (DASH_KEYS[e.code]) {
        this.press = true;
        this.held = true;
        this.keyDash = true;
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      if (DASH_KEYS[e.code] && this.keyDash) {
        this.keyDash = false;
        // keyup only ends the gesture; it never dashes. A charge lantern
        // notices `held` drop and fires from that, not from a release edge.
        this.held = false;
      }
    });
    window.addEventListener("blur", () => this.reset());

    const onDown = (e) => {
      if (!this.capture) return;
      if (e.target && e.target.closest && e.target.closest("button")) return;
      if (e.pointerType === "mouse") {
        this.touch = false;
        this.cx = e.clientX;
        this.cy = e.clientY;
        this.mouseT = this.now;
        if (e.button === 0) {
          this.held = true;
          this.mouseDash = true;
          this.mouseDragging = true;
        } else if (e.button === 2 && this.mouseDash) {
          this.held = false;
          this.mouseDash = false;
          this.mouseDragging = false;
        }
        return;
      }
      if (e.target !== canvas) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this.touch = true;
      const left = e.clientX < window.innerWidth * 0.45;
      if (left && this.stick.id === null) {
        const s = this.stick;
        s.id = e.pointerId;
        s.ox = s.x = e.clientX;
        s.oy = s.y = e.clientY;
      } else if (this.aimS.id === null) {
        const a = this.aimS;
        a.id = e.pointerId;
        a.ox = a.x = e.clientX;
        a.oy = a.y = e.clientY;
        // touch-down begins a gesture: aim, or draw a charge lantern's bow.
        // It must never dash by itself — the dash waits for the release.
        this.touchPress = true;
        this.tap = false;
        this.held = true;
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerdown", onDown);
    const onMove = (e) => {
      if (e.pointerType === "mouse") {
        this.cx = e.clientX;
        this.cy = e.clientY;
        this.mouseT = this.now;
        this.touch = false;
        return;
      }
      if (e.pointerId === this.stick.id) {
        this.stick.x = e.clientX;
        this.stick.y = e.clientY;
        const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
        const len = Math.hypot(dx, dy);
        const maxR = 52;
        if (len > maxR) {
          this.stick.ox = this.stick.x - (dx / len) * maxR;
          this.stick.oy = this.stick.y - (dy / len) * maxR;
        }
      } else if (e.pointerId === this.aimS.id) {
        this.aimS.x = e.clientX;
        this.aimS.y = e.clientY;
      }
    };
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointermove", onMove);
    const up = (e) => {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      if (e.pointerType === "mouse") {
        if (e.button === 0 && this.mouseDash) {
          this.mouseDash = false;
          this.mouseDragging = false;
          this.held = false;
          if (this.capture) this.release = true;
        }
        return;
      }
      if (e.pointerId === this.stick.id) this.stick.id = null;
      else if (e.pointerId === this.aimS.id) {
        const a = this.aimS;
        const dx = a.x - a.ox, dy = a.y - a.oy, len = Math.hypot(dx, dy);
        this.tap = len < 14;
        this.aimVec.x = dx;
        this.aimVec.y = dy;
        this.aimVec.len = len;
        a.id = null;
        this.held = false;
        if (this.capture) this.release = true;
      }
    };
    canvas.addEventListener("pointerup", up);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // Stop the page from scrolling or zooming under a thumb mid-run.
    canvas.addEventListener("touchstart", (e) => { if (this.capture) e.preventDefault(); }, { passive: false });
    canvas.addEventListener("touchmove", (e) => { if (this.capture) e.preventDefault(); }, { passive: false });
  },

  reset() {
    this.keys = Object.create(null);
    this.press = this.release = this.touchPress = this.held = false;
    this.keyDash = this.mouseDash = this.mouseDragging = false;
    this.stick.id = null;
    this.aimS.id = null;
  },

  endFrame() {
    this.press = false;
    this.release = false;
    this.touchPress = false;
  },

  /** Unit-or-shorter move vector written into `out`. */
  moveVec(out) {
    let x = 0, y = 0;
    for (const code in MOVE_KEYS) {
      if (this.keys[code]) {
        x += MOVE_KEYS[code][0];
        y += MOVE_KEYS[code][1];
      }
    }
    x = clamp(x, -1, 1);
    y = clamp(y, -1, 1);
    if (this.stick.id !== null) {
      const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > 6) {
        const m = Math.min(1, len / 46);
        x = (dx / len) * m;
        y = (dy / len) * m;
      }
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    out.x = x;
    out.y = y;
    return out;
  },

  /** Current drag of the aim thumb, in client pixels (len 0 when idle). */
  aimDrag(out) {
    const a = this.aimS;
    if (a.id === null) {
      out.x = out.y = out.len = 0;
      return out;
    }
    out.x = a.x - a.ox;
    out.y = a.y - a.oy;
    out.len = Math.hypot(out.x, out.y);
    return out;
  },

  mouseActive() {
    return !this.touch && (this.mouseDash || this.now - this.mouseT < 4);
  },

  /** Mouse position in arena units. */
  mouseArena(out) {
    out.x = (this.cx - View.ox) / View.scale;
    out.y = (this.cy - View.oy) / View.scale;
    return out;
  },
};
