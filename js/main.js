"use strict";
/* Cinderwake — boot and main loop. */

function pauseGame() {
  if (G.state !== "play" || !G.player || !G.player.alive) return;
  G.state = "pause";
  Input.capture = false;
  Input.reset();
  Music.setMood(0.08, false);
  UI.show("pause");
}
function resumeGame() {
  if (G.state !== "pause") return;
  G.state = "play";
  UI.hide();
  Input.reset();
  Input.capture = true;
  const w = G.wave;
  if (w) Music.setMood(w.boss ? 0.9 : clamp(0.3 + w.n * 0.035, 0.3, 0.8), !!w.boss);
}

(function boot() {
  Save.load();
  FX.configure();
  const canvas = $("#game");
  Render.init(canvas);
  Input.init(canvas);
  try {
    // phones and tablets: show touch hints before the first touch arrives
    Input.touch = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
  } catch (e) { /* older browsers: assume mouse */ }
  UI.init();
  UI.show("main");
  if (Save.recovered) UI.toast("Your save could not be read, so a fresh one was started. The old data was set aside.");
  if (!Save.storageOk) UI.toast("This browser is blocking storage. Progress will last only until the tab closes.");

  // Audio may only start from a user gesture.
  const wake = () => {
    AudioSys.init();
    AudioSys.resume();
    Music.start();
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);

  window.addEventListener("resize", () => Render.resize());
  window.addEventListener("orientationchange", () => setTimeout(() => Render.resize(), 120));
  window.addEventListener("blur", () => pauseGame());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseGame();
      Save.persist();
      AudioSys.suspend();
    } else AudioSys.resume();
  });
  window.addEventListener("pagehide", () => Save.persist());

  window.addEventListener("keydown", (e) => {
    const k = e.code;
    if (G.state === "play") {
      if (k === "Escape" || k === "KeyP") {
        e.preventDefault();
        pauseGame();
      }
      return;
    }
    const typing = e.target && e.target.tagName === "INPUT";
    if (G.state === "pause" && UI.cur === "pause" && (k === "Escape" || k === "KeyP")) {
      e.preventDefault();
      resumeGame();
      return;
    }
    if (G.state === "upgrade" && UI.cur === "upgrade") {
      if (k === "Digit1" || k === "Numpad1") return UI.pickCard(0);
      if (k === "Digit2" || k === "Numpad2") return UI.pickCard(1);
      if (k === "Digit3" || k === "Numpad3") return UI.pickCard(2);
      if (k === "KeyR") return UI.reroll();
    }
    if (G.state === "over" && UI.cur === "over" && k === "KeyR") return UI.act("again");
    if (k === "Escape") {
      e.preventDefault();
      UI.back();
      return;
    }
    // arrow keys walk the focus; sliders keep left and right for themselves
    const range = typing && e.target.type === "range";
    if (k === "ArrowDown" || (k === "ArrowRight" && !range)) {
      if (UI.moveFocus(1)) e.preventDefault();
    } else if (k === "ArrowUp" || (k === "ArrowLeft" && !range)) {
      if (UI.moveFocus(-1)) e.preventDefault();
    }
  });

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05; // after a stall, slow down rather than skip
    if (G.state === "play") gameUpdate(dt);
    else if (G.player && G.state !== "pause") {
      G.realT += dt;
      FX.update(dt, dt, G.player);
    }
    Input.endFrame();
    Render.draw(dt);
    UI.frame(dt);
  }
  requestAnimationFrame(frame);
})();
