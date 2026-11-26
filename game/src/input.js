// Keyboard and mouse input. Held keys steer; one-shot presses (start, pause, mute)
// are queued as bit flags and taken once by the loop. The mouse steers too: move it
// left or right of centre to bank, up or down to pitch — the last device to move wins,
// so keyboard and mouse never fight.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouse = { x: 0, y: 0, active: false, at: 0 };
  let keyAt = 0;

  window.addEventListener('keydown', (event) => {
    if (ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) || PITCH_UP.has(event.code) ||
        PITCH_DOWN.has(event.code) || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)) {
      keys.add(event.code);
      keyAt = performance.now();
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse = {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
      active: true,
      at: performance.now(),
    };
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });

  function has(codeSet) {
    for (const code of codeSet) if (keys.has(code)) return true;
    return false;
  }

  return {
    /**
     * Steering for this frame: { roll, pitch, throttle }, each -1..1.
     * Keyboard wins while a key is held; otherwise a recent mouse position steers.
     */
    control() {
      const keyRoll = (has(ROLL_RIGHT) ? 1 : 0) - (has(ROLL_LEFT) ? 1 : 0);
      const keyPitch = (has(PITCH_UP) ? 1 : 0) - (has(PITCH_DOWN) ? 1 : 0);
      const throttle = (has(THROTTLE_UP) ? 1 : 0) - (has(THROTTLE_DOWN) ? 1 : 0);
      const mouseFresh = mouse.active && performance.now() - mouse.at < 2500;
      const keyFresh = performance.now() - keyAt < 400;
      let roll = keyRoll;
      let pitch = keyPitch;
      if (roll === 0 && pitch === 0 && mouseFresh && !keyFresh) {
        roll = Math.max(-1, Math.min(1, mouse.x * 2.4));
        pitch = Math.max(-1, Math.min(1, -mouse.y * 2.4));
      }
      return { roll, pitch, throttle };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
