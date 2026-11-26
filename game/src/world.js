// The simulation: one little prop plane, its speed, heading, pitch and roll, the ring
// course, the runway, and the score. Fixed 1/60 s steps; the same inputs always give
// the same flight, which is what makes the screenshot autopilot repeatable.
import { PLANE, RINGS, RUNWAY, SCORING, STEP } from './config.js';
import { buildCity, buildClouds, buildCourse, buildLandmarks, terrainHeight } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASH = 4;
export const EVENT_OVER = 8;

export const PHASE_TAKEOFF = 'takeoff';
export const PHASE_RINGS = 'rings';
export const PHASE_FINAL = 'final';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function approach(v, target, rate, dt) {
  if (v < target) return Math.min(target, v + rate * dt);
  return Math.max(target, v - rate * dt);
}

/** Fresh world for a seed: course, city, landmarks and clouds are built once. */
export function createWorld(seed) {
  const course = buildCourse(seed);
  const city = buildCity(seed);
  const landmarks = buildLandmarks(seed);
  const clouds = buildClouds(seed);
  const state = {
    seed,
    time: 0,
    score: 0,
    ringsCleared: 0,
    nextRing: 0,
    phase: PHASE_TAKEOFF,
    message: '',
    messageUntil: 0,
    best: 0,
    // Plane.
    x: PLANE.startX,
    z: PLANE.startZ,
    altitude: PLANE.startAltitude,
    heading: 0, // degrees, 0 = due north up the course
    pitch: 0, // degrees, + = nose up
    roll: 0, // degrees, + = bank right
    speed: PLANE.startSpeed, // knots
    throttle: 72, // percent
    verticalSpeed: 0, // feet per minute
    // Landing bookkeeping.
    landing: { smooth: false, timeBonus: 0, ringPoints: 0 },
    crashReason: '',
  };

  function reset() {
    state.time = 0;
    state.score = 0;
    state.ringsCleared = 0;
    state.nextRing = 0;
    state.phase = PHASE_TAKEOFF;
    state.message = 'FLY THROUGH RING 1 — FOLLOW THE GOLD RINGS';
    state.messageUntil = 6;
    state.x = PLANE.startX;
    state.z = PLANE.startZ;
    state.altitude = PLANE.startAltitude;
    state.heading = 0;
    state.pitch = 0;
    state.roll = 0;
    state.speed = PLANE.startSpeed;
    state.throttle = 72;
    state.verticalSpeed = 0;
    state.crashReason = '';
    state.landing = { smooth: false, timeBonus: 0, ringPoints: 0 };
    for (const ring of course) ring.cleared = false;
  }

  function say(text, seconds) {
    state.message = text;
    state.messageUntil = state.time + seconds;
  }

  /**
   * One step. `ctl` is { roll: -1..1, pitch: -1..1, throttle: -1..1 } from keyboard or
   * mouse. `attract` runs the title-screen demo: gentle cruise, no scoring.
   */
  function step(ctl, attract) {
    state.time += STEP;
    if (state.time > state.messageUntil) state.message = '';

    // --- Controls: bank, pitch and throttle ease toward their targets. ---
    const targetRoll = clamp(ctl.roll, -1, 1) * PLANE.maxRoll;
    state.roll = approach(state.roll, targetRoll, PLANE.rollRate * 2.4, STEP);
    const targetPitch = clamp(ctl.pitch, -1, 1) * (ctl.pitch >= 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown);
    state.pitch = approach(state.pitch, targetPitch, PLANE.pitchRate * 2.2, STEP);
    state.throttle = clamp(state.throttle + ctl.throttle * 30 * STEP, 0, 100);

    // --- Speed: throttle sets the target, climbing bleeds speed, diving gains it. ---
    const targetSpeed = PLANE.minSpeed + (state.throttle / 100) * (PLANE.maxSpeed - PLANE.minSpeed);
    const climbBleed = state.pitch > 0 ? state.pitch * 1.1 : state.pitch * 0.4;
    state.speed = approach(state.speed, targetSpeed - climbBleed, 26, STEP);
    if (state.speed < 42) state.speed = 42; // a stalled wing still falls forward

    // --- Heading follows the bank; position follows the heading. ---
    state.heading += (state.roll * 0.62 * STEP);
    if (state.heading > 180) state.heading -= 360;
    if (state.heading < -180) state.heading += 360;
    const feetPerSecond = (state.speed * 1.68781);
    const hRad = state.heading * DEG;
    state.x += Math.sin(hRad) * feetPerSecond * STEP;
    state.z += Math.cos(hRad) * feetPerSecond * STEP;

    // --- Altitude: pitch and throttle lift, a slow wing sinks. ---
    const lift = Math.sin(state.pitch * DEG) * feetPerSecond + (state.throttle - 52) * 0.35;
    const stallSink = state.speed < 58 ? (58 - state.speed) * 2.2 : 0;
    const verticalFeetPerSecond = lift - stallSink;
    state.altitude += verticalFeetPerSecond * STEP;
    state.verticalSpeed = verticalFeetPerSecond * 60;
    if (state.altitude > 6000) state.altitude = 6000;

    if (attract) {
      // Title demo: keep the plane cruising over the coast, never score, never crash.
      if (state.z > 24000) reset();
      if (state.altitude < 700) state.altitude = 700;
      if (state.altitude > 1600) state.altitude = 1600;
      return 0;
    }

    let events = 0;

    // --- Rings: crossing a ring's plane inside its radius clears it. ---
    const ring = course[state.nextRing];
    if (ring && state.phase !== PHASE_LANDED) {
      const prevZ = state.z - Math.cos(hRad) * feetPerSecond * STEP;
      if (prevZ < ring.z && state.z >= ring.z) {
        const dx = state.x - ring.x;
        const dy = state.altitude - ring.altitude;
        if (dx * dx + dy * dy <= ring.radius * ring.radius) {
          ring.cleared = true;
          state.ringsCleared += 1;
          state.nextRing += 1;
          state.score += RINGS.points;
          events |= EVENT_RING;
          if (state.nextRing >= course.length) {
            state.phase = PHASE_FINAL;
            say('ALL 12 RINGS! FINAL APPROACH — LAND ON RUNWAY 27', 6);
          } else {
            say(`RING ${ring.index} CLEARED  +${RINGS.points}   •   NEXT: RING ${ring.index + 1}`, 3);
          }
        } else {
          state.nextRing += 1;
          say(`MISSED RING ${ring.index} — KEEP FLYING, THE RUNWAY AWAITS`, 3);
          if (state.nextRing >= course.length) {
            state.phase = PHASE_FINAL;
            say('COURSE DONE — FINAL APPROACH: LAND ON RUNWAY 27', 6);
          }
        }
      }
    }

    // --- Ground: terrain, sea and the runway decide crash or landing. ---
    const ground = terrainHeight(state.x, state.z, seed);
    if (state.altitude <= ground) {
      const onStrip = Math.abs(state.x - RUNWAY.x) <= RUNWAY.width / 2 && state.z >= RUNWAY.zStart && state.z <= RUNWAY.zEnd;
      const gentle = state.verticalSpeed > -1200 && state.speed < 180 && Math.abs(state.roll) < 20;
      if (onStrip && gentle && state.phase !== PHASE_CRASHED) {
        state.phase = PHASE_LANDED;
        state.altitude = ground;
        const timeBonus = state.time <= SCORING.timeBonusFull
          ? SCORING.timeBonusMax
          : Math.max(0, Math.round(SCORING.timeBonusMax * (SCORING.timeBonusZero - state.time) / (SCORING.timeBonusZero - SCORING.timeBonusFull)));
        const smooth = state.verticalSpeed > -600;
        state.landing = {
          smooth,
          timeBonus,
          ringPoints: state.ringsCleared * RINGS.points,
        };
        state.score += SCORING.landingPoints + timeBonus + (smooth ? SCORING.smoothLandingBonus : 0);
        events |= EVENT_LANDED | EVENT_OVER;
        say(smooth ? 'SMOOTH LANDING ON RUNWAY 27!' : 'LANDED ON RUNWAY 27!', 8);
      } else {
        state.phase = PHASE_CRASHED;
        state.altitude = ground;
        if (ground <= 1 && state.z > 100) state.crashReason = 'DITCHED IN THE SEA';
        else if (state.z >= RUNWAY.zStart && state.z <= RUNWAY.zEnd) state.crashReason = 'TOO HARD ON THE RUNWAY';
        else state.crashReason = 'TERRAIN IMPACT';
        events |= EVENT_CRASH | EVENT_OVER;
      }
    }

    // Flying past the runway without landing is not a crash: turn the course around.
    if (state.z > RUNWAY.zEnd + 2600 && state.phase !== PHASE_LANDED && state.phase !== PHASE_CRASHED) {
      state.z = RUNWAY.zEnd + 2600;
      state.heading = 180;
      say('OVERSHOT — TURN BACK FOR RUNWAY 27', 4);
    }
    if (state.z < -400) {
      state.z = -400;
      state.heading = 0;
    }
    return events;
  }

  return {
    state,
    course,
    city,
    landmarks,
    clouds,
    reset,
    step,
  };
}
