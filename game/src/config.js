// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// World units are feet: the course runs about 30,000 ft (5 nautical miles) down a coast.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Camera focal length in logical pixels; horizon sits near y=300 when level. */
export const FOCAL = 620;
export const HORIZON_Y = 300;

export const PLANE = {
  /** Knots. */
  cruiseSpeed: 150,
  minSpeed: 55,
  maxSpeed: 240,
  /** Degrees per second of bank at full roll input. */
  rollRate: 55,
  maxRoll: 52,
  /** Degrees per second of pitch at full pitch input. */
  pitchRate: 22,
  maxPitchUp: 18,
  maxPitchDown: -14,
  /** Feet per second of climb at full throttle, level flight. */
  climbPower: 26,
  /** Seconds of fuel-free fun: the rally is scored on time, not fuel. */
  startAltitude: 900,
  startSpeed: 150,
  startZ: 0,
  startX: 0,
};

export const RINGS = {
  count: 12,
  radius: 90,
  points: 250,
  /** First ring z and spacing along the course. */
  firstZ: 2200,
  spacing: 1900,
};

export const RUNWAY = {
  /** Runway 27: centreline x = 0, from zStart to zEnd, 34 ft wide. */
  x: 0,
  zStart: 26800,
  zEnd: 31200,
  width: 34,
  elevation: 0,
  heading: 270,
};

export const SCORING = {
  ringPoints: 250,
  landingPoints: 1000,
  smoothLandingBonus: 500,
  /** Time bonus: full 600 points at 150 s, zero at 300 s. */
  timeBonusMax: 600,
  timeBonusFull: 150,
  timeBonusZero: 300,
};

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'tailwind.best';

export const PALETTE = {
  backdrop: '#0b1526',
  skyTop: '#2f6fd0',
  skyMid: '#7db3e8',
  skyLow: '#cfe6f7',
  sun: '#fff3c4',
  seaDeep: '#14507e',
  sea: '#1e6fa8',
  seaLight: '#3f96c4',
  sand: '#e8d29a',
  grass: '#5d9b4a',
  grassLight: '#79b45e',
  forest: '#3c7a35',
  hill: '#7a8a5a',
  rock: '#8d8578',
  snow: '#f2f5f7',
  city: '#9aa3ad',
  cityDark: '#6e7680',
  asphalt: '#3a3f46',
  runwayMark: '#f5f5f0',
  panel: '#10151d',
  panelEdge: '#2c3646',
  hud: '#e8f2ff',
  hudDim: '#9fb4cc',
  hudAmber: '#ffb347',
  hudGreen: '#7dff9a',
  hudRed: '#ff6b5e',
  ring: '#ffd94d',
  ringGlow: '#ff9d00',
  text: '#eef1f5',
  muted: '#8b93a3',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
