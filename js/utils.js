"use strict";
/* Cinderwake — shared helpers, palette and view state. */

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

/** Signed shortest difference a - b, in (-PI, PI]. */
const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
};
const turnToward = (cur, target, maxStep) => {
  const d = angDiff(target, cur);
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
};
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Weighted pick. Falls back to the first item when all weights are zero. */
function wpick(items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Squared distance from a point to a segment. SEG.t holds the closest parameter. */
const SEG = { t: 0 };
function segDist2(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  SEG.t = t;
  const cx = x1 + dx * t - px, cy = y1 + dy * t - py;
  return cx * cx + cy * cy;
}

/** Returns true if segment (x1,y1)-(x2,y2) intersects segment (x3,y3)-(x4,y4). */
function segIntersects(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-6) return false;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (v) => String(v).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** Tiny DOM builder: h("div", {class:"x", onclick: fn}, child, "text"). */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "text") e.textContent = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

/* Palette. Warm light is always yours; cold light always hurts. */
const PAL = {
  soot: "#101219",
  wash: "#191c28",
  wash2: "#252a3b",
  body: "#1b1e2b",
  paper: "#e9e0cc",
  ash: "#9a947f",
  ember: "#ff9a3d",
  emberDeep: "#e2621b",
  gold: "#ffd98a",
  cold: "#86b6ff",
  coldDeep: "#4f7fe0",
  paperRGB: "233,224,204",
  emberRGB: "255,154,61",
  goldRGB: "255,217,138",
  coldRGB: "134,182,255",
};

/* Logical arena size and screen mapping (filled in by Render.resize). */
const View = { W: 1280, H: 720, scale: 1, dpr: 1, ox: 0, oy: 0, cssW: 0, cssH: 0 };
