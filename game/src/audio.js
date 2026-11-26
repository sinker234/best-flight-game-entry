// Sound, synthesized live with WebAudio — no audio files, no network. An engine drone
// that follows the throttle, wind that follows the speed, a chime when a ring clears,
// a thud on a crash and a little fanfare on landing. Starts on the first user gesture.

export function createAudio() {
  let context = null;
  let engine = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      context = new AC();
      // Engine: two detuned sawtooths through a low-pass filter.
      engine = context.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 62;
      const engine2 = context.createOscillator();
      engine2.type = 'sawtooth';
      engine2.frequency.value = 93;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0.0;
      engine.connect(filter);
      engine2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engine.start();
      engine2.start();
      // Wind: looped noise buffer through a band-pass filter.
      const length = context.sampleRate * 2;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0.0;
      noise.connect(band);
      band.connect(windGain);
      windGain.connect(context.destination);
      noise.start();
      // Keep the two oscillators' frequencies in step with the throttle.
      engine._sibling = engine2;
    } catch {
      context = null;
    }
  }

  function tone(freq, dur, type, gain, when = 0) {
    if (!context || muted) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = context.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume().catch(() => {});
    },
    /** Continuous engine + wind, from the plane's throttle and speed. */
    update(throttle, speed, flying) {
      if (!context || muted) return;
      const target = flying ? 0.05 + (throttle / 100) * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
      if (engine) {
        engine.frequency.setTargetAtTime(58 + throttle * 0.9, context.currentTime, 0.1);
        engine._sibling.frequency.setTargetAtTime(87 + throttle * 1.35, context.currentTime, 0.1);
      }
      windGain.gain.setTargetAtTime(flying ? Math.min(0.09, speed / 2400) : 0, context.currentTime, 0.15);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.4, 'sine', 0.12, 0.07);
    },
    crash() {
      tone(90, 0.5, 'sawtooth', 0.2);
      tone(55, 0.7, 'triangle', 0.2, 0.05);
    },
    land() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.14, i * 0.11));
    },
    toggleMute() {
      muted = !muted;
      if (context) {
        if (muted) {
          engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
          windGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
        }
      }
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
