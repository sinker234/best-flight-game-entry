// The world: one seeded coastline, its hills, its mountains, the little city of
// Seabreeze beside Runway 27, and the rally course itself (12 rings, then the runway).
// Everything here is a pure function of (x, z) and the seed, so the same seed always
// builds the same coast — the screenshots can be staged exactly.
import { RINGS, RUNWAY } from './config.js';
import { createRandom, fbm2, noise2 } from './random.js';

export const SEA_LEVEL = 0;

/** The coastline: sea is east of this x (x > coastX(z)), land west of it. */
export function coastX(z) {
  return 430 + 190 * Math.sin(z * 0.00021) + 95 * Math.sin(z * 0.000073 + 1.7);
}

/** True while (x, z) is on the runway strip. */
export function onRunway(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.width / 2 + 6 && z >= RUNWAY.zStart && z <= RUNWAY.zEnd;
}

/** True while (x, z) is inside the city blocks of Seabreeze. */
export function inCity(x, z) {
  return x >= -760 && x <= -70 && z >= 24600 && z <= 30200;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, v) {
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Terrain height in feet at (x, z): rolling hills, a mountain wall far west, a beach
 * sloping into the sea, flat city ground, and a dead-flat runway.
 */
export function terrainHeight(x, z, seed) {
  if (onRunway(x, z)) return RUNWAY.elevation;
  const coast = coastX(z);
  const distToCoast = coast - x; // > 0 on land, < 0 out at sea
  if (distToCoast < -260) return -30; // open sea floor
  // Hills: fractal noise, stronger inland.
  const hills = fbm2(x * 0.0011 + 3.7, z * 0.0011 + 9.2, seed) * 230;
  // Mountain wall far west, lower and further out than the first draft.
  const mountains = smoothstep(900, 2000, -x) * (420 + fbm2(x * 0.0009, z * 0.0009, seed + 5) * 950);
  // Beach: land sinks to the waterline near the coast.
  const beach = smoothstep(-40, 260, distToCoast);
  let h = (hills + mountains) * beach - 26 * (1 - beach);
  // The approach corridor to Runway 27 is cleared and near-flat, as a real airport is.
  if (Math.abs(x) < 160 && z > 23600 && z < RUNWAY.zStart) {
    const t = smoothstep(160, 60, Math.abs(x)) * smoothstep(23600, 24400, z);
    h = h * (1 - t) + 34 * t;
  }
  if (inCity(x, z)) h = 24 + fbm2(x * 0.004, z * 0.004, seed + 9) * 6;
  return h;
}

/** What kind of ground (x, z) is: sea, sand, grass, forest, hill, rock, snow, city, runway. */
export function groundKind(x, z, seed) {
  if (onRunway(x, z)) return 'runway';
  if (inCity(x, z)) return 'city';
  const h = terrainHeight(x, z, seed);
  if (h < 2) return 'sea';
  if (h < 9) return 'sand';
  if (h > 1500) return 'snow';
  if (h > 700) return 'rock';
  if (h > 260) return 'hill';
  const forest = noise2(x * 0.004 + 11, z * 0.004 + 5, seed + 31);
  if (forest > 0.62) return 'forest';
  return 'grass';
}

/** The rally course: 12 rings weaving along the coast, then the runway threshold. */
export function buildCourse(seed) {
  const rng = createRandom(seed ^ 0x5eed);
  const rings = [];
  for (let i = 0; i < RINGS.count; i += 1) {
    const z = RINGS.firstZ + i * RINGS.spacing;
    // Weave: hug the coast, dipping over the beach and back inland.
    const weave = Math.sin(i * 0.85) * 260 + (rng() - 0.5) * 120;
    const x = clamp(coastX(z) - 330 + weave, -620, 520);
    // Ring heights stay near the 900 ft cruise so the rally flows instead of porpoising,
    // and the last rings step down toward the runway so the final approach starts low
    // enough to actually reach the pavement.
    let altitude = 750 + Math.sin(i * 0.6 + 1.2) * 260 + rng() * 160;
    const taper = 1 - 0.45 * Math.max(0, (i - 8) / 3);
    altitude *= taper;
    rings.push({ index: i + 1, x, z, altitude, radius: RINGS.radius });
  }
  return rings;
}

/** Seabreeze city: deterministic blocks of buildings beside the runway. */
export function buildCity(seed) {
  const rng = createRandom(seed ^ 0xc171);
  const buildings = [];
  for (let bx = -740; bx <= -100; bx += 64) {
    for (let bz = 24700; bz <= 30100; bz += 84) {
      if (Math.abs(bx - RUNWAY.x) < 90) continue; // keep the runway clear
      if (rng() < 0.3) continue; // streets and parks
      const w = 30 + rng() * 26;
      const d = 30 + rng() * 26;
      const h = 50 + rng() * rng() * 260;
      buildings.push({ x: bx + rng() * 14, z: bz + rng() * 14, w, d, h, shade: rng() });
    }
  }
  return buildings;
}

/** The lighthouse on the point, and three wind turbines on the western hills. */
export function buildLandmarks(seed) {
  const rng = createRandom(seed ^ 0x11fe);
  const lighthouse = { x: coastX(14200) - 40, z: 14200, h: 190 };
  const turbines = [];
  for (let i = 0; i < 3; i += 1) {
    const z = 8200 + i * 5300 + rng() * 600;
    turbines.push({ x: -980 - rng() * 260, z, h: 300, phase: rng() * Math.PI * 2 });
  }
  return { lighthouse, turbines };
}

/** Clouds: fixed puffs that drift slowly with simulation time. */
export function buildClouds(seed) {
  const rng = createRandom(seed ^ 0xc10d);
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: (rng() - 0.5) * 9000,
      z: rng() * 32000,
      y: 3400 + rng() * 1800,
      size: 260 + rng() * 420,
      puffs: 3 + Math.floor(rng() * 3),
      drift: 12 + rng() * 20,
    });
  }
  return clouds;
}

/** Distant ridge silhouette: one height per screen column, from seeded noise. */
export function ridgeHeight(column, columns, seed) {
  const t = column / columns;
  return 26 + fbm2(t * 9.1 + 4.4, 2.2, seed + 77) * 150;
}
