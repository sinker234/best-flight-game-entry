// The screenshot scenes behind ?shot=start|play|ring|land (with &seed=N). Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (bank toward the next ring, pitch to meet its altitude, throttle back
// on final), so the frame is what real play looks like and the same seed always gives
// the same frame.
import { RUNWAY, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Steer the plane toward the next ring, or toward the runway threshold on final. */
function autopilot(world) {
  const state = world.state;
  const course = world.course;
  const ring = course[state.nextRing];
  let targetX;
  let targetAlt;
  let throttle = 0;
  if (state.phase === 'final' || !ring) {
    targetX = RUNWAY.x;
    // Ride a 3-degree glide slope to the threshold, keeping flying speed until short
    // final: cutting the throttle early sinks the plane into the approach corridor.
    const dist = RUNWAY.zStart - state.z;
    targetAlt = Math.max(0, dist * 0.052);
    throttle = state.speed < 132 ? 0.6 : dist < 1500 ? -0.6 : 0;
  } else {
    targetX = ring.x;
    targetAlt = ring.altitude;
    throttle = state.speed < 150 ? 0.6 : 0;
  }
  // Desired heading: point at the target, then bank toward it.
  const dz = (ring ? ring.z : RUNWAY.zStart) - state.z;
  const dx = targetX - state.x;
  const desiredHeading = Math.atan2(dx, Math.max(200, dz)) / DEG;
  let headingError = desiredHeading - state.heading;
  if (headingError > 180) headingError -= 360;
  if (headingError < -180) headingError += 360;
  const roll = clamp(headingError / 14, -1, 1);
  // Desired pitch: climb or dive to meet the target altitude (gentle gain, so the
  // plane eases onto the slope instead of porpoising after it).
  const altError = targetAlt - state.altitude;
  const pitch = clamp(altError / 350, -1, 1);
  return { roll, pitch, throttle };
}

/** Run the world forward `seconds` with the autopilot, stopping on game over. */
function flyFor(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.step(autopilot(world), false) & EVENT_OVER) break;
  }
}

/** Run until the plane is close to the next ring (a big hoop fills the frame). */
function flyToRing(world, maxSeconds) {
  const steps = Math.round(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const ring = world.course[world.state.nextRing];
    if (ring && world.state.z > ring.z - 700) break;
    if (world.step(autopilot(world), false) & EVENT_OVER) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. start: title over a live coast cruise. play: mid-rally. ring: a hoop
 * dead ahead. land: on final for Runway 27, gear down, threshold in sight.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    flyFor(world, 26);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'ring') {
    flyToRing(world, 60);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'land') {
    // Skip the rally: place the plane on the glide slope, right of the centreline so
    // the runway shows beside the plane instead of behind it, and fly the approach in.
    world.state.z = 21500;
    world.state.x = 200;
    world.state.altitude = 320;
    world.state.speed = 140;
    world.state.throttle = 45;
    world.state.ringsCleared = 12;
    world.state.nextRing = 12;
    world.state.phase = 'final';
    world.state.score = 12 * 250;
    for (const ring of world.course) ring.cleared = true;
    world.state.message = 'FINAL APPROACH — RUNWAY 27 AHEAD';
    world.state.messageUntil = 9999;
    flyFor(world, 14);
    const over = world.state.phase === 'landed' || world.state.phase === 'crashed';
    return { screen: over ? (world.state.phase === 'landed' ? SCREEN_LANDED : SCREEN_OVER) : SCREEN_PLAY, best: world.state.score };
  }
  // start (default): cruise the coast for the title backdrop, well short of ring 1
  // so the title stays clear of the first hoop.
  world.state.z = -1500;
  for (let i = 0; i < 5 / STEP; i += 1) world.step({ roll: 0.12, pitch: 0, throttle: 0 }, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
