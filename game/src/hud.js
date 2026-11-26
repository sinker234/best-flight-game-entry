// The instruments and the panels: the lit cockpit readouts the bounty asks for —
// altitude, speed and heading on the HUD — plus the title, pause, crash and landing
// screens. All of it is canvas text and shapes, drawn unrotated over the scene.
import { FIELD, PALETTE, RINGS, RUNWAY, SCORING } from './config.js';

const DEG = Math.PI / 180;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function headingText(heading) {
  let h = Math.round(((heading % 360) + 360) % 360);
  return String(h).padStart(3, '0') + '°';
}

function compassLabel(deg) {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function createHud(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function panel(x, y, w, h, fill) {
    context.fillStyle = fill;
    context.fillRect(x, y, w, h);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  /** Artificial horizon: a lit attitude ball that banks and pitches with the plane. */
  function drawAttitude(state, cx, cy, r) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();
    context.translate(cx, cy);
    context.rotate(-state.roll * DEG);
    const pitchPx = state.pitch * 2.4;
    // Sky first across the whole ball, then ground below the horizon line: the ball is
    // never left half-unpainted, however steep the dive or climb.
    context.fillStyle = '#3f8fd2';
    context.fillRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4);
    context.fillStyle = '#8a6b42';
    context.fillRect(-r - 2, pitchPx, r * 2 + 4, r + 2 - pitchPx);
    context.strokeStyle = 'rgba(255,255,255,0.85)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-r, pitchPx);
    context.lineTo(r, pitchPx);
    context.stroke();
    context.lineWidth = 1;
    for (const off of [-24, -12, 12, 24]) {
      context.beginPath();
      context.moveTo(-r * 0.55, pitchPx + off);
      context.lineTo(r * 0.55, pitchPx + off);
      context.stroke();
    }
    context.restore();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    // Fixed aircraft symbol.
    context.fillStyle = '#ffd94d';
    context.fillRect(cx - 16, cy - 2, 12, 4);
    context.fillRect(cx + 4, cy - 2, 12, 4);
    context.beginPath();
    context.arc(cx, cy, 3, 0, Math.PI * 2);
    context.fill();
    text('ATT', cx, cy + r + 16, 11, PALETTE.hudDim, 'center', true);
  }

  /** A vertical tape (speed in knots, altitude in feet) with the live value boxed. */
  function drawTape(cx, top, height, value, step, unit, label) {
    const cy = top + height / 2;
    const pxPerUnit = height / (step * 6);
    context.save();
    context.beginPath();
    context.rect(cx - 34, top, 68, height);
    context.clip();
    context.fillStyle = 'rgba(16,21,29,0.92)';
    context.fillRect(cx - 34, top, 68, height);
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.lineWidth = 1;
    const first = Math.floor((value - step * 3) / step) * step;
    for (let v = first; v <= value + step * 3; v += step) {
      const y = cy - (v - value) * pxPerUnit;
      if (y < top - 4 || y > top + height + 4) continue;
      context.beginPath();
      context.moveTo(cx + 20, y);
      context.lineTo(cx + 30, y);
      context.stroke();
      text(String(v), cx + 16, y + 4, 12, PALETTE.hudDim, 'right');
    }
    context.restore();
    context.fillStyle = '#0d1420';
    context.fillRect(cx - 34, cy - 13, 68, 26);
    context.strokeStyle = PALETTE.hudAmber;
    context.lineWidth = 1.5;
    context.strokeRect(cx - 34.5, cy - 13.5, 68, 26);
    text(fmt(value), cx, cy + 5, 16, PALETTE.hudAmber, 'center', true);
    text(label, cx, top + height + 15, 11, PALETTE.hudDim, 'center', true);
    text(unit, cx, top - 6, 11, PALETTE.hudDim, 'center', true);
  }

  /** Heading strip: degrees sliding past a fixed caret, cardinals labelled. */
  function drawHeading(state, cx, y, width) {
    const pxPerDeg = 3.2;
    context.fillStyle = 'rgba(16,21,29,0.92)';
    context.fillRect(cx - width / 2, y, width, 34);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(cx - width / 2 + 0.5, y + 0.5, width, 34);
    context.save();
    context.beginPath();
    context.rect(cx - width / 2, y, width, 34);
    context.clip();
    const h = ((state.heading % 360) + 360) % 360;
    for (let d = -60; d <= 60; d += 5) {
      let deg = Math.round(h + d);
      deg = ((deg % 360) + 360) % 360;
      const x = cx + d * pxPerDeg;
      const major = deg % 30 === 0;
      context.strokeStyle = major ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x, y + (major ? 6 : 12));
      context.lineTo(x, y + 22);
      context.stroke();
      if (major) {
        const label = deg % 90 === 0 ? compassLabel(deg) : String(deg).padStart(3, '0');
        text(label, x, y + 32, 12, major ? PALETTE.hud : PALETTE.hudDim, 'center', deg % 90 === 0);
      }
    }
    context.restore();
    // Caret + digital heading.
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(cx - 7, y);
    context.lineTo(cx + 7, y);
    context.lineTo(cx, y + 9);
    context.closePath();
    context.fill();
    text(headingText(state.heading), cx, y - 6, 17, PALETTE.hudAmber, 'center', true);
    text('HDG', cx, y + 48, 11, PALETTE.hudDim, 'center', true);
  }

  /** Ring progress: twelve dots and the runway flag at the end. */
  function drawCourse(state, cx, y) {
    const total = RINGS.count;
    const spacing = 22;
    const x0 = cx - ((total + 1) * spacing) / 2;
    for (let i = 0; i < total; i += 1) {
      const x = x0 + i * spacing;
      const done = i < state.ringsCleared;
      const next = i === state.nextRing;
      context.beginPath();
      context.arc(x, y + 10, next ? 7 : 5.5, 0, Math.PI * 2);
      context.fillStyle = done ? '#37e08a' : next ? '#ffd94d' : 'rgba(255,255,255,0.25)';
      context.fill();
      if (next) {
        context.strokeStyle = '#ffd94d';
        context.lineWidth = 1.5;
        context.stroke();
      }
      if (done) {
        context.strokeStyle = '#0d1420';
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(x - 3, y + 10);
        context.lineTo(x - 1, y + 13);
        context.lineTo(x + 3.5, y + 7);
        context.stroke();
      }
    }
    const fx = x0 + total * spacing;
    text('RWY 27', fx + 6, y + 15, 12, state.phase === 'final' ? '#ffd94d' : PALETTE.hudDim, 'left', true);
  }

  function drawTopBar(state, best) {
    context.fillStyle = 'rgba(10,14,22,0.82)';
    context.fillRect(0, 0, FIELD.width, 46);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, 46, FIELD.width, 1);
    text(`SCORE ${fmt(state.score)}`, 18, 30, 22, PALETTE.hud, 'left', true);
    text(`RINGS ${state.ringsCleared}/${RINGS.count}`, 200, 30, 18, state.ringsCleared === RINGS.count ? '#37e08a' : PALETTE.hudAmber, 'left', true);
    text(`TIME ${fmtTime(state.time)}`, 340, 30, 18, PALETTE.hud, 'left', true);
    text(`BEST ${fmt(Math.max(best, state.score))}`, 470, 30, 18, PALETTE.hudDim, 'left', true);
    // Live digital readouts, right side.
    text(`ALT ${fmt(state.altitude)} FT`, 780, 30, 18, PALETTE.hud, 'left', true);
    text(`SPD ${fmt(state.speed)} KT`, 960, 30, 18, PALETTE.hud, 'left', true);
    text(`HDG ${headingText(state.heading)}`, 1120, 30, 18, PALETTE.hud, 'left', true);
  }

  function drawMessage(state) {
    if (!state.message) return;
    const alpha = Math.min(1, (state.messageUntil - state.time) / 0.8);
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    context.fillStyle = 'rgba(10,14,22,0.75)';
    const w = context.measureText(state.message).width + 44;
    void w;
    text(state.message, FIELD.width / 2, 92, 21, '#ffd94d', 'center', true);
    context.globalAlpha = 1;
  }

  function drawBottomPanel(state) {
    context.fillStyle = 'rgba(10,14,22,0.88)';
    context.fillRect(0, 596, FIELD.width, 124);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, 596, FIELD.width, 1);
    drawAttitude(state, 92, 656, 50);
    drawTape(196, 612, 88, state.speed, 20, 'KT', 'AIRSPEED');
    drawTape(1090, 612, 88, state.altitude, 500, 'FT', 'ALTITUDE');
    drawHeading(state, 640, 622, 380);
    drawCourse(state, 640, 686);
    // Throttle bar.
    const tx = 1196;
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(tx, 612, 14, 88);
    context.fillStyle = state.throttle > 85 ? '#ff6b5e' : '#7dff9a';
    const th = (state.throttle / 100) * 88;
    context.fillRect(tx, 612 + 88 - th, 14, th);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(tx + 0.5, 612.5, 14, 88);
    text(`THR ${Math.round(state.throttle)}%`, tx + 7, 716, 11, PALETTE.hudDim, 'center', true);
    // Vertical speed, digital — between the heading strip and the altitude tape.
    const vs = state.verticalSpeed;
    text(`V/S ${vs >= 0 ? '+' : ''}${fmt(vs)} FPM`, 955, 716, 12, vs < -1200 ? '#ff6b5e' : PALETTE.hudDim, 'center', true);
    // Next-ring distance, or the runway on final.
    // Phase line, bottom-left of the panel where it cannot touch the course dots.
    if (state.phase === 'final') {
      text('FINAL — RUNWAY 27 AHEAD', 280, 713, 12, '#ffd94d', 'left', true);
    } else if (state.phase === 'rings' || state.phase === 'takeoff') {
      const next = state.nextRing + 1;
      text(`NEXT RING ${next} OF ${RINGS.count}`, 280, 713, 12, PALETTE.hudDim, 'left', true);
    }
  }

  function drawHud(state, best) {
    drawTopBar(state, best);
    drawMessage(state);
    drawBottomPanel(state);
  }

  function drawPanelBox(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2 - 20;
    context.fillStyle = 'rgba(10,14,22,0.92)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, width - 2, height - 2);
    text(title, FIELD.width / 2, y + 64, 44, accent || PALETTE.hud, 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 112 + i * 34, 19, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 20, '#ffd94d', 'center', true);
  }

  function drawTitle(state, best) {
    context.fillStyle = 'rgba(8,12,20,0.45)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('TAILWIND', FIELD.width / 2, 190, 84, '#ffffff', 'center', true);
    text('— SEASIDE AIR RALLY —', FIELD.width / 2, 232, 24, '#ffd94d', 'center', true);
    text('Fly the Gullwing TW-1 down the coast: 12 gold rings, then land on Runway 27.', FIELD.width / 2, 282, 20, PALETTE.hud, 'center');
    text('Steer with ← → or A D to bank, ↑ ↓ or W S to climb and dive,', FIELD.width / 2, 330, 18, PALETTE.muted, 'center');
    text('Shift / Ctrl for throttle — or steer with the mouse.  M mutes the sound.', FIELD.width / 2, 356, 18, PALETTE.muted, 'center');
    text(`BEST SCORE ${fmt(best)}`, FIELD.width / 2, 408, 20, PALETTE.hudAmber, 'center', true);
    text('PRESS SPACE OR CLICK TO FLY', FIELD.width / 2, 470, 24, '#ffd94d', 'center', true);
  }

  function drawOver(state, best) {
    context.fillStyle = 'rgba(8,12,20,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const lines = [
      `${state.crashReason} — RINGS ${state.ringsCleared}/${RINGS.count}`,
      `SCORE ${fmt(state.score)}   •   BEST ${fmt(Math.max(best, state.score))}`,
    ];
    drawPanelBox('CRASHED', lines, 'PRESS SPACE OR CLICK TO FLY AGAIN', '#ff6b5e');
  }

  function drawLanded(state, best) {
    context.fillStyle = 'rgba(8,12,20,0.45)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const l = state.landing;
    const lines = [
      `RINGS ${state.ringsCleared}/${RINGS.count}  × ${SCORING.ringPoints}  =  ${fmt(l.ringPoints)}`,
      `LANDING ON RUNWAY 27  =  ${fmt(SCORING.landingPoints)}${l.smooth ? `   •   SMOOTH +${fmt(SCORING.smoothLandingBonus)}` : ''}`,
      `TIME BONUS  =  ${fmt(l.timeBonus)}   •   FLIGHT TIME ${fmtTime(state.time)}`,
      `TOTAL  ${fmt(state.score)}   •   BEST  ${fmt(Math.max(best, state.score))}`,
    ];
    drawPanelBox('MISSION COMPLETE', lines, 'PRESS SPACE OR CLICK TO FLY AGAIN', '#7dff9a');
  }

  function drawPaused() {
    context.fillStyle = 'rgba(8,12,20,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    drawPanelBox('PAUSED', ['The coast will wait for you.'], 'PRESS P TO RESUME', null);
  }

  return { drawHud, drawTitle, drawOver, drawLanded, drawPaused };
}
