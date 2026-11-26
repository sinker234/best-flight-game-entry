// Drawing only: sky, sea, coast, city and rings in a pseudo-3D chase view, then the
// little prop plane itself. The world is a projected ground plane: the ground is drawn
// as bands of quads from far to near, each quad coloured by the terrain under it, so
// the coast, the beach, the hills, the mountains and the city read as real places.
// The 1280x720 playfield is scaled to fit the window and centred.
import { FIELD, FOCAL, HORIZON_Y, PALETTE, RUNWAY } from './config.js';
import { coastX, groundKind, onRunway, ridgeHeight, terrainHeight } from './terrain.js';
import { noise2 } from './random.js';

const DEG = Math.PI / 180;
const BANDS = 40;
const COLUMNS = 48;
const VIEW_FAR = 11500;

/** [r, g, b] triplets for the ground kinds, so fog can blend them numerically. */
const GROUND_RGB = {
  sea: [30, 111, 168],
  seaLight: [63, 150, 196],
  sand: [232, 210, 154],
  grass: [93, 155, 74],
  grassLight: [121, 180, 94],
  forest: [60, 122, 53],
  hill: [122, 138, 90],
  rock: [141, 133, 120],
  snow: [242, 245, 247],
  city: [154, 163, 173],
  cityDark: [110, 118, 128],
  runway: [58, 63, 70],
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function fogged(rgb, d) {
  const t = Math.min(1, d / 9500);
  const r = Math.round(lerp(rgb[0], 207, t));
  const g = Math.round(lerp(rgb[1], 230, t));
  const b = Math.round(lerp(rgb[2], 247, t));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${'system-ui, -apple-system, "Segoe UI", sans-serif'}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Project a point already in camera space (right, up, forward) to screen space. */
  function project(right, up, forward, horizonY) {
    return {
      x: FIELD.width / 2 + (FOCAL * right) / forward,
      y: horizonY - (FOCAL * up) / forward,
    };
  }

  function drawSky(state, horizonY) {
    const grad = context.createLinearGradient(0, 0, 0, horizonY + 30);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, horizonY + 2);
    // Sun, ahead and to the right, with a soft glow.
    const sunX = FIELD.width * 0.78;
    const sunY = 92;
    const glow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,236,170,0.55)');
    glow.addColorStop(1, 'rgba(255,236,170,0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 130, sunY - 130, 260, 260);
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(sunX, sunY, 26, 0, Math.PI * 2);
    context.fill();
  }

  function drawRidge(state, horizonY) {
    context.beginPath();
    context.moveTo(0, horizonY + 2);
    for (let c = 0; c <= 64; c += 1) {
      const h = ridgeHeight(c, 64, state.seed);
      context.lineTo((c / 64) * FIELD.width, horizonY - h * 0.55);
    }
    context.lineTo(FIELD.width, horizonY + 2);
    context.closePath();
    const grad = context.createLinearGradient(0, horizonY - 90, 0, horizonY + 2);
    grad.addColorStop(0, '#7d94b8');
    grad.addColorStop(1, '#a9bdd4');
    context.fillStyle = grad;
    context.fill();
  }

  function drawClouds(state, world, horizonY) {
    const hRad = state.heading * DEG;
    const cosH = Math.cos(hRad);
    const sinH = Math.sin(hRad);
    for (const cloud of world.clouds) {
      const dx = cloud.x - state.x;
      const dz = cloud.z - state.z;
      const forward = dz * cosH + dx * sinH;
      if (forward < 120 || forward > 14000) continue;
      const right = dx * cosH - dz * sinH;
      const driftX = cloud.drift * state.time;
      const p = project(right + driftX * 0.2, cloud.y - state.altitude, forward, horizonY);
      if (p.x < -300 || p.x > FIELD.width + 300 || p.y < -80 || p.y > horizonY + 40) continue;
      const size = (FOCAL * cloud.size) / forward;
      context.fillStyle = 'rgba(255,255,255,0.88)';
      for (let i = 0; i < cloud.puffs; i += 1) {
        const px = p.x + (i - cloud.puffs / 2) * size * 0.42;
        const py = p.y - (i % 2) * size * 0.12;
        context.beginPath();
        context.ellipse(px, py, size * 0.36, size * 0.2, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /** The ground, band by band from far to near, each quad coloured by its terrain. */
  function drawGround(state, horizonY) {
    const hRad = state.heading * DEG;
    const sinH = Math.sin(hRad);
    const cosH = Math.cos(hRad);
    const seed = state.seed;
    // Geometric band edges: near bands are tall on screen, far bands are thin. The first
    // edge is close (12 ft): at low altitude the ground right below the plane fills the
    // bottom of the screen, and only a near first edge covers it.
    let dFar = 12;
    const edges = [12];
    for (let i = 0; i < BANDS; i += 1) {
      dFar = Math.min(VIEW_FAR, dFar * 1.185);
      edges.push(dFar);
      if (dFar >= VIEW_FAR) break;
    }
    for (let b = edges.length - 2; b >= 0; b -= 1) {
      const d0 = edges[b];
      const d1 = edges[b + 1];
      const dMid = (d0 + d1) / 2;
      const halfW = (dMid / FOCAL) * (FIELD.width / 2) * 1.3;
      for (let c = 0; c < COLUMNS; c += 1) {
        const f0 = c / COLUMNS - 0.5;
        const f1 = (c + 1) / COLUMNS - 0.5;
        const lat0a = f0 * 2 * ((d0 / FOCAL) * (FIELD.width / 2) * 1.3);
        const lat0b = f1 * 2 * ((d0 / FOCAL) * (FIELD.width / 2) * 1.3);
        const lat1a = f0 * 2 * ((d1 / FOCAL) * (FIELD.width / 2) * 1.3);
        const lat1b = f1 * 2 * ((d1 / FOCAL) * (FIELD.width / 2) * 1.3);
        // World position of the quad's centre, for terrain sampling.
        const wx = state.x + sinH * dMid + cosH * ((f0 + f1) * halfW);
        const wz = state.z + cosH * dMid - sinH * ((f0 + f1) * halfW);
        const kind = groundKind(wx, wz, seed);
        let rgb = GROUND_RGB[kind] || GROUND_RGB.grass;
        // Organic variation: smooth noise blends, never a checkerboard.
        if (kind === 'grass') rgb = mixRgb(GROUND_RGB.grass, GROUND_RGB.grassLight, noise2(wx * 0.003, wz * 0.003, seed + 17));
        if (kind === 'sea') rgb = mixRgb(GROUND_RGB.sea, GROUND_RGB.seaLight, noise2(wx * 0.004, wz * 0.004, seed + 41) * 0.6);
        if (kind === 'hill') rgb = mixRgb(GROUND_RGB.hill, GROUND_RGB.grass, noise2(wx * 0.002, wz * 0.002, seed + 53) * 0.5);
        if (kind === 'city') rgb = (Math.floor(wx / 64) + Math.floor(wz / 84)) % 2 === 0 ? GROUND_RGB.city : GROUND_RGB.cityDark;
        context.fillStyle = fogged(rgb, dMid);
        // Project the four corners (camera space: right = lateral, up = height - altitude).
        const h00 = terrainHeight(state.x + sinH * d0 + cosH * lat0a, state.z + cosH * d0 - sinH * lat0a, seed);
        const h01 = terrainHeight(state.x + sinH * d0 + cosH * lat0b, state.z + cosH * d0 - sinH * lat0b, seed);
        const h10 = terrainHeight(state.x + sinH * d1 + cosH * lat1a, state.z + cosH * d1 - sinH * lat1a, seed);
        const h11 = terrainHeight(state.x + sinH * d1 + cosH * lat1b, state.z + cosH * d1 - sinH * lat1b, seed);
        const p00 = project(lat0a, h00 - state.altitude, d0, horizonY);
        const p01 = project(lat0b, h01 - state.altitude, d0, horizonY);
        const p11 = project(lat1b, h11 - state.altitude, d1, horizonY);
        const p10 = project(lat1a, h10 - state.altitude, d1, horizonY);
        context.beginPath();
        context.moveTo(p00.x, p00.y);
        context.lineTo(p01.x, p01.y);
        context.lineTo(p11.x, p11.y);
        context.lineTo(p10.x, p10.y);
        context.closePath();
        context.fill();
      }
    }
  }

  /** Runway paint: edge lines, centreline dashes, threshold bars and the big 27. */
  function drawRunwayMarkings(state, horizonY) {
    const hRad = state.heading * DEG;
    const sinH = Math.sin(hRad);
    const cosH = Math.cos(hRad);
    function toScreen(wx, wz, wy) {
      const dx = wx - state.x;
      const dz = wz - state.z;
      const forward = dz * cosH + dx * sinH;
      if (forward < 40) return null;
      const right = dx * cosH - dz * sinH;
      return project(right, wy - state.altitude, forward, horizonY);
    }
    function quad(x0, z0, x1, z1, wy, color) {
      const a = toScreen(x0, z0, wy);
      const b = toScreen(x1, z0, wy);
      const c = toScreen(x1, z1, wy);
      const d = toScreen(x0, z1, wy);
      if (!a || !b || !c || !d) return;
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.lineTo(d.x, d.y);
      context.closePath();
      context.fill();
    }
    const z0 = Math.max(state.z + 60, RUNWAY.zStart);
    const z1 = Math.min(state.z + VIEW_FAR, RUNWAY.zEnd);
    if (z1 <= z0) return;
    // Edge lines.
    quad(RUNWAY.x - RUNWAY.width / 2 + 1, z0, RUNWAY.x - RUNWAY.width / 2 + 3, z1, 1.5, 'rgba(245,245,240,0.9)');
    quad(RUNWAY.x + RUNWAY.width / 2 - 3, z0, RUNWAY.x + RUNWAY.width / 2 - 1, z1, 1.5, 'rgba(245,245,240,0.9)');
    // Centreline dashes, 60 ft dash every 120 ft.
    for (let z = Math.floor(z0 / 120) * 120; z < z1; z += 120) {
      quad(RUNWAY.x - 1.2, z + 8, RUNWAY.x + 1.2, Math.min(z + 68, z1), 1.5, 'rgba(245,245,240,0.95)');
    }
    // Threshold bars near the start of the strip.
    for (let i = 0; i < 6; i += 1) {
      const x = RUNWAY.x - 14 + i * 5.6;
      quad(x, RUNWAY.zStart + 30, x + 3.4, RUNWAY.zStart + 150, 1.5, 'rgba(245,245,240,0.95)');
    }
    // The big 27, painted on the pavement past the threshold.
    const num = toScreen(RUNWAY.x, RUNWAY.zStart + 420, 2);
    if (num) {
      const forward = (RUNWAY.zStart + 420 - state.z) * cosH + (RUNWAY.x - state.x) * sinH;
      const size = Math.max(10, Math.min(120, (FOCAL * 26) / forward));
      text('27', num.x, num.y, size, 'rgba(245,245,240,0.95)', 'center', true);
    }
  }

  /** Seabreeze buildings as simple projected boxes, far to near. */
  function drawBuildings(state, world, horizonY) {
    const hRad = state.heading * DEG;
    const sinH = Math.sin(hRad);
    const cosH = Math.cos(hRad);
    const visible = [];
    for (const b of world.city) {
      const dx = b.x - state.x;
      const dz = b.z - state.z;
      const forward = dz * cosH + dx * sinH;
      if (forward < 60 || forward > 9000) continue;
      const right = dx * cosH - dz * sinH;
      if (Math.abs(right) > forward * 1.1) continue;
      visible.push({ b, forward, right });
    }
    visible.sort((a, b) => b.forward - a.forward);
    for (const { b, forward, right } of visible) {
      const hw = b.w / 2;
      const hd = b.d / 2;
      const base = 24;
      const pFL = project(right - hw, base - state.altitude, forward - hd, horizonY);
      const pFR = project(right + hw, base - state.altitude, forward - hd, horizonY);
      const pTR = project(right + hw, base + b.h - state.altitude, forward - hd, horizonY);
      const pTL = project(right - hw, base + b.h - state.altitude, forward - hd, horizonY);
      const shade = b.shade;
      const top = `rgb(${Math.round(150 + shade * 60)},${Math.round(158 + shade * 55)},${Math.round(168 + shade * 50)})`;
      const face = `rgb(${Math.round(96 + shade * 40)},${Math.round(104 + shade * 38)},${Math.round(116 + shade * 36)})`;
      context.fillStyle = face;
      context.beginPath();
      context.moveTo(pFL.x, pFL.y);
      context.lineTo(pFR.x, pFR.y);
      context.lineTo(pTR.x, pTR.y);
      context.lineTo(pTL.x, pTL.y);
      context.closePath();
      context.fill();
      // Roof.
      const pBR = project(right + hw, base + b.h - state.altitude, forward + hd, horizonY);
      const pBL = project(right - hw, base + b.h - state.altitude, forward + hd, horizonY);
      context.fillStyle = top;
      context.beginPath();
      context.moveTo(pTL.x, pTL.y);
      context.lineTo(pTR.x, pTR.y);
      context.lineTo(pBR.x, pBR.y);
      context.lineTo(pBL.x, pBL.y);
      context.closePath();
      context.fill();
    }
  }

  /** Lighthouse on the point and the hilltop wind turbines. */
  function drawLandmarks(state, world, horizonY) {
    const hRad = state.heading * DEG;
    const sinH = Math.sin(hRad);
    const cosH = Math.cos(hRad);
    function rel(wx, wz) {
      const dx = wx - state.x;
      const dz = wz - state.z;
      return { forward: dz * cosH + dx * sinH, right: dx * cosH - dz * sinH };
    }
    const lh = world.landmarks.lighthouse;
    const r = rel(lh.x, lh.z);
    if (r.forward > 60 && r.forward < 12000 && Math.abs(r.right) < r.forward) {
      const base = project(r.right, 0 - state.altitude, r.forward, horizonY);
      const top = project(r.right, lh.h - state.altitude, r.forward, horizonY);
      const w = Math.max(3, (FOCAL * 26) / r.forward);
      context.fillStyle = '#f4f6f8';
      context.beginPath();
      context.moveTo(base.x - w / 2, base.y);
      context.lineTo(top.x - w * 0.32, top.y);
      context.lineTo(top.x + w * 0.32, top.y);
      context.lineTo(base.x + w / 2, base.y);
      context.closePath();
      context.fill();
      context.fillStyle = '#d8433a';
      context.fillRect(top.x - w * 0.36, top.y + (base.y - top.y) * 0.32, w * 0.72, (base.y - top.y) * 0.14);
      context.fillStyle = '#ffd94d';
      context.beginPath();
      context.arc(top.x, top.y - 4, Math.max(2, w * 0.3), 0, Math.PI * 2);
      context.fill();
    }
    for (const t of world.landmarks.turbines) {
      const tr = rel(t.x, t.z);
      if (tr.forward < 80 || tr.forward > 12000 || Math.abs(tr.right) > tr.forward) continue;
      const groundY = 0;
      const base = project(tr.right, groundY - state.altitude, tr.forward, horizonY);
      const hub = project(tr.right, t.h - state.altitude, tr.forward, horizonY);
      const towerW = Math.max(2, (FOCAL * 8) / tr.forward);
      context.strokeStyle = '#e8ecf0';
      context.lineWidth = towerW;
      context.beginPath();
      context.moveTo(base.x, base.y);
      context.lineTo(hub.x, hub.y);
      context.stroke();
      const bladeLen = (FOCAL * 120) / tr.forward;
      const ang = state.time * 0.9 + t.phase;
      context.strokeStyle = '#f4f6f8';
      context.lineWidth = Math.max(1.5, bladeLen * 0.06);
      for (let i = 0; i < 3; i += 1) {
        const a = ang + (i * Math.PI * 2) / 3;
        context.beginPath();
        context.moveTo(hub.x, hub.y);
        context.lineTo(hub.x + Math.cos(a) * bladeLen, hub.y + Math.sin(a) * bladeLen);
        context.stroke();
      }
    }
  }

  /** The gold rally rings: glowing hoops with their number, nearest first on top. */
  function drawRings(state, world, horizonY) {
    const hRad = state.heading * DEG;
    const sinH = Math.sin(hRad);
    const cosH = Math.cos(hRad);
    const rings = world.course.filter((ring) => !ring.cleared);
    rings.sort((a, b) => b.z - a.z);
    for (const ring of rings) {
      const dx = ring.x - state.x;
      const dz = ring.z - state.z;
      const forward = dz * cosH + dx * sinH;
      if (forward < 50 || forward > 12000) continue;
      const right = dx * cosH - dz * sinH;
      const p = project(right, ring.altitude - state.altitude, forward, horizonY);
      if (p.x < -160 || p.x > FIELD.width + 160 || p.y < -160 || p.y > FIELD.height + 160) continue;
      const radius = (FOCAL * ring.radius) / forward;
      const isNext = world.course[state.nextRing] === ring;
      const glowR = radius * 1.45;
      const glow = context.createRadialGradient(p.x, p.y, radius * 0.7, p.x, p.y, glowR);
      glow.addColorStop(0, 'rgba(255,157,0,0)');
      glow.addColorStop(0.75, isNext ? 'rgba(255,157,0,0.28)' : 'rgba(255,217,77,0.12)');
      glow.addColorStop(1, 'rgba(255,157,0,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(p.x, p.y, glowR, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = isNext ? PALETTE.ring : '#e8c95a';
      context.lineWidth = Math.max(2, radius * 0.14);
      context.beginPath();
      context.arc(p.x, p.y, radius, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = 'rgba(255,255,255,0.85)';
      context.lineWidth = Math.max(1, radius * 0.05);
      context.beginPath();
      context.arc(p.x, p.y, radius * 0.86, 0, Math.PI * 2);
      context.stroke();
      if (radius > 16) {
        text(String(ring.index), p.x, p.y - radius - 8, Math.max(14, Math.min(30, radius * 0.42)), isNext ? '#ffd94d' : '#e8e2c8', 'center', true);
      }
      if (isNext && radius > 30) {
        text(`${Math.round(forward / 6076 * 10) / 10} NM`, p.x, p.y + radius + 22, 16, '#ffd94d', 'center', true);
      }
    }
  }

  /** The Gullwing TW-1, seen from behind and slightly above: banked, pitched, lit. */
  function drawPlane(state, t) {
    const cx = FIELD.width / 2;
    const cy = 452 + state.pitch * -1.6;
    const bank = state.roll * DEG;
    context.save();
    context.translate(cx, cy);
    context.rotate(bank);
    const scale = 1 + (state.speed - 150) * 0.0004;
    context.scale(scale, scale);
    // Propeller disc (nose, up-screen) with a blur of spinning blades.
    const propY = -118;
    const propR = 46;
    const propGrad = context.createRadialGradient(0, propY, 4, 0, propY, propR);
    propGrad.addColorStop(0, 'rgba(210,225,240,0.10)');
    propGrad.addColorStop(0.8, 'rgba(210,225,240,0.28)');
    propGrad.addColorStop(1, 'rgba(210,225,240,0.05)');
    context.fillStyle = propGrad;
    context.beginPath();
    context.ellipse(0, propY, propR, propR * 0.92, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(40,52,66,0.55)';
    context.lineWidth = 3;
    const bladeAng = t * 21;
    for (let i = 0; i < 2; i += 1) {
      const a = bladeAng + i * Math.PI;
      context.beginPath();
      context.moveTo(0, propY);
      context.lineTo(Math.cos(a) * propR * 0.9, propY + Math.sin(a) * propR * 0.9);
      context.stroke();
    }
    // Main wings.
    const wingGrad = context.createLinearGradient(0, -30, 0, 30);
    wingGrad.addColorStop(0, '#f2f5f8');
    wingGrad.addColorStop(0.5, '#dfe6ec');
    wingGrad.addColorStop(1, '#b9c4cf');
    context.fillStyle = wingGrad;
    context.beginPath();
    context.moveTo(-196, 6);
    context.quadraticCurveTo(-120, -34, -26, -22);
    context.lineTo(26, -22);
    context.quadraticCurveTo(120, -34, 196, 6);
    context.lineTo(150, 22);
    context.lineTo(-150, 22);
    context.closePath();
    context.fill();
    context.strokeStyle = '#8b98a6';
    context.lineWidth = 2;
    context.stroke();
    // Wingtip navigation lights: red port, green starboard, blinking white strobe.
    context.fillStyle = '#ff4d3d';
    context.beginPath();
    context.arc(-192, 8, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#37e08a';
    context.beginPath();
    context.arc(192, 8, 6, 0, Math.PI * 2);
    context.fill();
    if (Math.floor(t * 2) % 2 === 0) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 96, 5, 0, Math.PI * 2);
      context.fill();
    }
    // Fuselage: tapered body, nose up-screen.
    const bodyGrad = context.createLinearGradient(-34, 0, 34, 0);
    bodyGrad.addColorStop(0, '#c94f2e');
    bodyGrad.addColorStop(0.45, '#e8643c');
    bodyGrad.addColorStop(0.55, '#f07a4e');
    bodyGrad.addColorStop(1, '#c94f2e');
    context.fillStyle = bodyGrad;
    context.beginPath();
    context.moveTo(-14, -116);
    context.quadraticCurveTo(-30, -40, -34, 46);
    context.quadraticCurveTo(-34, 92, -20, 104);
    context.lineTo(20, 104);
    context.quadraticCurveTo(34, 92, 34, 46);
    context.quadraticCurveTo(30, -40, 14, -116);
    context.quadraticCurveTo(0, -128, -14, -116);
    context.closePath();
    context.fill();
    // Canopy: the lit cockpit glass.
    const glassGrad = context.createLinearGradient(0, -84, 0, -30);
    glassGrad.addColorStop(0, '#bfe8ff');
    glassGrad.addColorStop(0.5, '#5fb2e8');
    glassGrad.addColorStop(1, '#2a6ea8');
    context.fillStyle = glassGrad;
    context.beginPath();
    context.ellipse(0, -58, 15, 30, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.65)';
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, -58, 15, 30, 0, 0, Math.PI * 2);
    context.stroke();
    // Tailplane and fin, toward the viewer.
    context.fillStyle = '#dfe6ec';
    context.beginPath();
    context.moveTo(-92, 78);
    context.lineTo(-24, 62);
    context.lineTo(24, 62);
    context.lineTo(92, 78);
    context.lineTo(70, 96);
    context.lineTo(-70, 96);
    context.closePath();
    context.fill();
    context.strokeStyle = '#8b98a6';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#c94f2e';
    context.beginPath();
    context.moveTo(-13, 66);
    context.lineTo(0, 18);
    context.lineTo(13, 66);
    context.lineTo(8, 100);
    context.lineTo(-8, 100);
    context.closePath();
    context.fill();
    text('TW-1', 0, 62, 13, '#ffffff', 'center', true);
    context.restore();
  }

  /** Paint one frame: the world, rolled with the bank, then the plane. HUD is separate. */
  function drawScene(state, world) {
    const horizonY = HORIZON_Y + state.pitch * 5.5;
    // Haze base: fills the thin strip between the horizon and the farthest ground band,
    // and the corners the banked scene rotates away from.
    context.fillStyle = '#b8d2e8';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.save();
    context.translate(FIELD.width / 2, 430);
    context.rotate(-state.roll * DEG * 0.55);
    context.translate(-FIELD.width / 2, -430);
    drawSky(state, horizonY);
    drawRidge(state, horizonY);
    drawClouds(state, world, horizonY);
    drawGround(state, horizonY);
    drawRunwayMarkings(state, horizonY);
    drawBuildings(state, world, horizonY);
    drawLandmarks(state, world, horizonY);
    drawRings(state, world, horizonY);
    context.restore();
    drawPlane(state, state.time);
  }

  resize();
  window.addEventListener('resize', resize);
  return { drawScene, text, context, view };
}
