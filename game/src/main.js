// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, crashed and landed.
//
// ?seed=N fixes the coast and the rally. ?shot=start|play|ring|land (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_CRASH, EVENT_LANDED, EVENT_OVER, EVENT_RING, PHASE_LANDED } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createHud, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const hud = createHud(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    try {
      renderer.drawScene(world.state, world);
      if (scene.screen === SCREEN_TITLE) hud.drawTitle(world.state, scene.best);
      else {
        hud.drawHud(world.state, scene.best);
        if (scene.screen === SCREEN_OVER) hud.drawOver(world.state, scene.best);
        else if (scene.screen === SCREEN_LANDED) hud.drawLanded(world.state, scene.best);
      }
    } catch (err) {
      document.documentElement.setAttribute('data-shot-error', String((err && err.stack) || err));
      return;
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.documentElement.setAttribute('data-shot-ready', 'true');
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Flying. Twelve rings, then land on Runway 27.');
  }

  function endGame(landed) {
    screen = landed ? SCREEN_LANDED : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(landed
      ? `Landed on Runway 27. Score ${world.state.score}. Best ${best}.`
      : `${world.state.crashReason}. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step({ roll: 0.1, pitch: 0, throttle: 0 }, true);
      return;
    }
    const events = world.step(input.control(), false);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_LANDED) audio.land();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_OVER) endGame(world.state.phase === PHASE_LANDED);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update(world.state.throttle, world.state.speed, screen === SCREEN_PLAY);
    renderer.drawScene(world.state, world);
    if (screen === SCREEN_TITLE) hud.drawTitle(world.state, best);
    else {
      hud.drawHud(world.state, best);
      if (screen === SCREEN_PAUSED) hud.drawPaused();
      else if (screen === SCREEN_OVER) hud.drawOver(world.state, best);
      else if (screen === SCREEN_LANDED) hud.drawLanded(world.state, best);
    }
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Tailwind, Seaside Air Rally. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) {
  try {
    runShot(shot);
  } catch (err) {
    document.documentElement.setAttribute('data-shot-error', String((err && err.stack) || err));
  }
} else runGame();
