// The renderer: everything the player (and the judge) sees.
// A forward chase view over the archipelago at golden hour, drawn on a 2D canvas
// in a fixed 1280x720 logical space, scaled to the window. The world is projected
// with a simple perspective: screenX = cx + dx * FOCAL / dz, and the sea level at
// screenY = horizonY + altitude * FOCAL / dz. Far things are drawn first.

import { FIELD, LANDING, PALETTE, FONT, PLANE, SCORE, VIEW_DISTANCE } from './config.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_MISSION = 4;
export const SCREEN_CRASH = 5;

const DEG = Math.PI / 180;
const FOCAL = 950;
const CX = FIELD.width / 2;
const PLANE_Y = 432;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function horizonY(state) {
  return clamp(300 + state.pitch * 3.2, 200, 420);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function headingLabel(heading) {
  const h = ((Math.round(heading) % 360) + 360) % 360;
  if (h < 11 || h > 349) return 'N';
  if (h > 79 && h < 101) return 'E';
  if (h > 169 && h < 191) return 'S';
  if (h > 259 && h < 281) return 'W';
  return String(h).padStart(3, '0');
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function fit() {
    const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
    canvas.width = FIELD.width;
    canvas.height = FIELD.height;
    canvas.style.width = `${Math.floor(FIELD.width * scale)}px`;
    canvas.style.height = `${Math.floor(FIELD.height * scale)}px`;
  }
  fit();
  window.addEventListener('resize', fit);

  function drawSky(state) {
    const horizon = horizonY(state);
    const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyHorizon);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, horizon + 1);
    // Sun, low over the sea to the right, with a warm glow.
    const sunX = 1010;
    const sunY = horizon - 70;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
    glow.addColorStop(0, 'rgba(255, 233, 168, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 179, 71, 0.45)');
    glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 160, sunY - 160, 320, 320);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds(state) {
    const horizon = horizonY(state);
    const sorted = [...state.clouds].sort((a, b) => b.dist - a.dist);
    for (const cloud of sorted) {
      const dz = cloud.dist - state.dist;
      if (dz < 60 || dz > VIEW_DISTANCE) continue;
      const dx = cloud.x - state.x;
      const dy = cloud.alt - state.alt;
      const sx = CX + (dx * FOCAL) / dz;
      const sy = horizon - (dy * FOCAL) / dz;
      const size = (cloud.size * FOCAL) / dz;
      if (sx < -size || sx > FIELD.width + size) continue;
      const alpha = cloud.layer === 0 ? 0.5 : cloud.layer === 1 ? 0.7 : 0.9;
      ctx.fillStyle = `rgba(255, 248, 235, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, size, size * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(sx - size * 0.45, sy + size * 0.08, size * 0.55, size * 0.22, 0, 0, Math.PI * 2);
      ctx.ellipse(sx + size * 0.5, sy + size * 0.06, size * 0.6, size * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDistantRidges(state) {
    const horizon = horizonY(state);
    ctx.fillStyle = 'rgba(90, 70, 90, 0.35)';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= FIELD.width; x += 40) {
      const h = 26 + 22 * Math.sin(x * 0.011 + 1.7) + 12 * Math.sin(x * 0.027);
      ctx.lineTo(x, horizon - h);
    }
    ctx.lineTo(FIELD.width, horizon);
    ctx.closePath();
    ctx.fill();
    // One volcano cone on the horizon, snow-capped.
    ctx.fillStyle = 'rgba(107, 74, 58, 0.5)';
    ctx.beginPath();
    ctx.moveTo(180, horizon);
    ctx.lineTo(260, horizon - 86);
    ctx.lineTo(340, horizon);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(244, 237, 224, 0.55)';
    ctx.beginPath();
    ctx.moveTo(246, horizon - 62);
    ctx.lineTo(260, horizon - 86);
    ctx.lineTo(274, horizon - 62);
    ctx.lineTo(260, horizon - 54);
    ctx.closePath();
    ctx.fill();
  }

  function drawSea(state) {
    const horizon = horizonY(state);
    const gradient = ctx.createLinearGradient(0, horizon, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.seaShallow);
    gradient.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, horizon, FIELD.width, FIELD.height - horizon);
    // Sun glitter: a shimmering path under the sun.
    const sunX = 1010;
    for (let row = 0; row < 9; row += 1) {
      const dz = 260 + row * 320;
      const y = horizon + (state.alt * FOCAL) / dz;
      if (y > FIELD.height || y < horizon) continue;
      const width = 26 + row * 22;
      const shimmer = 0.25 + 0.2 * Math.sin(state.time * 2.4 + row * 1.3);
      ctx.fillStyle = `rgba(255, 217, 122, ${shimmer})`;
      ctx.fillRect(sunX - width / 2, y, width, 2);
    }
    // Wave lines, closer ones lower and wider.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 7; row += 1) {
      const dz = 180 + row * 260;
      const y = horizon + (state.alt * FOCAL) / dz;
      if (y > FIELD.height || y < horizon) continue;
      ctx.beginPath();
      for (let x = 0; x <= FIELD.width; x += 24) {
        const yy = y + Math.sin(x * 0.02 + row * 2.1 + state.time * 0.8) * 1.5;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawIsland(state, island) {
    const horizon = horizonY(state);
    const dz = island.at - state.dist;
    if (dz < 40 || dz > VIEW_DISTANCE) return;
    const dx = island.x - state.x;
    const baseY = horizon + (state.alt * FOCAL) / dz;
    const baseX = CX + (dx * FOCAL) / dz;
    const halfW = (island.size * FOCAL) / dz;
    if (baseX < -halfW - 80 || baseX > FIELD.width + halfW + 80) return;
    const heightPx = (island.size * 0.34 * FOCAL) / dz;
    // Sand rim, then the green mound.
    ctx.fillStyle = PALETTE.sand;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY - heightPx * 0.18, halfW * 1.06, heightPx * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    const grass = ctx.createLinearGradient(0, baseY - heightPx, 0, baseY);
    grass.addColorStop(0, PALETTE.jungle);
    grass.addColorStop(1, PALETTE.grass);
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY - heightPx * 0.32, halfW, heightPx * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    if (island.volcano) {
      ctx.fillStyle = PALETTE.volcano;
      ctx.beginPath();
      ctx.moveTo(baseX - halfW * 0.5, baseY - heightPx * 0.3);
      ctx.lineTo(baseX, baseY - heightPx * 1.5);
      ctx.lineTo(baseX + halfW * 0.5, baseY - heightPx * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.volcanoSnow;
      ctx.beginPath();
      ctx.moveTo(baseX - halfW * 0.12, baseY - heightPx * 1.12);
      ctx.lineTo(baseX, baseY - heightPx * 1.5);
      ctx.lineTo(baseX + halfW * 0.12, baseY - heightPx * 1.12);
      ctx.lineTo(baseX, baseY - heightPx * 1.0);
      ctx.closePath();
      ctx.fill();
    }
    // Palms, when the island is big enough on screen to show them.
    if (halfW > 34) {
      const palms = island.volcano ? 2 : 4;
      for (let index = 0; index < palms; index += 1) {
        const px = baseX - halfW * 0.6 + (index * halfW * 1.2) / Math.max(1, palms - 1);
        const py = baseY - heightPx * (0.55 + (index % 2) * 0.18);
        const s = clamp(halfW / 26, 2, 9);
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = Math.max(1, s * 0.28);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + s * 0.4, py - s * 1.6);
        ctx.stroke();
        ctx.strokeStyle = PALETTE.jungle;
        ctx.lineWidth = Math.max(1, s * 0.3);
        for (let leaf = -1; leaf <= 1; leaf += 1) {
          ctx.beginPath();
          ctx.moveTo(px + s * 0.4, py - s * 1.6);
          ctx.quadraticCurveTo(px + s * (0.4 + leaf * 0.9), py - s * 2.2, px + s * (0.4 + leaf * 1.5), py - s * 1.4);
          ctx.stroke();
        }
      }
    }
    // Island name, when close enough to read but not so close it fills the
    // screen: the label stays small and is skipped once the island is on top
    // of the camera.
    if (halfW > 90 && halfW < 600 && island.name) {
      ctx.fillStyle = 'rgba(234, 246, 255, 0.9)';
      ctx.font = `600 ${Math.min(30, Math.max(11, Math.floor(halfW / 9)))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(island.name, baseX, baseY - heightPx * 0.95);
    }
    if (island.runway) drawRunway(state, island);
  }

  function drawRunway(state, island) {
    const horizon = horizonY(state);
    const near = island.at - LANDING.stripLength / 2 - state.dist;
    const far = island.at + LANDING.stripLength / 2 - state.dist;
    if (far < 25) return;
    const nearDz = Math.max(near, 30);
    const farDz = Math.max(far, 60);
    const dx = island.x - state.x;
    const nearY = horizon + (state.alt * FOCAL) / nearDz;
    const farY = horizon + (state.alt * FOCAL) / farDz;
    const nearX = CX + (dx * FOCAL) / nearDz;
    const farX = CX + (dx * FOCAL) / farDz;
    const nearHalf = (LANDING.stripHalfWidth * FOCAL) / nearDz;
    const farHalf = (LANDING.stripHalfWidth * FOCAL) / farDz;
    if (nearY < horizon - 4 && farY < horizon - 4) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(nearX - nearHalf, nearY);
    ctx.lineTo(farX - farHalf, farY);
    ctx.lineTo(farX + farHalf, farY);
    ctx.lineTo(nearX + nearHalf, nearY);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes, interpolated along the strip.
    ctx.fillStyle = PALETTE.runwayLine;
    for (let step = 0; step < 6; step += 1) {
      const t = (step + 0.5) / 6;
      const y = nearY + (farY - nearY) * t;
      const x = nearX + (farX - nearX) * t;
      const half = nearHalf + (farHalf - nearHalf) * t;
      ctx.fillRect(x - half * 0.06, y - Math.max(1, half * 0.05), half * 0.12, Math.max(2, half * 0.1));
    }
    // Threshold bars at the near end.
    ctx.fillRect(nearX - nearHalf * 0.8, nearY - 3, nearHalf * 1.6, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `700 ${Math.max(10, Math.floor(nearHalf / 4))}px ${FONT}`;
    ctx.textAlign = 'center';
    if (nearHalf > 26) ctx.fillText('27', nearX, nearY - 8);
  }

  function drawRing(state, ring) {
    const horizon = horizonY(state);
    const dz = ring.at - state.dist;
    if (dz < 30 || dz > VIEW_DISTANCE) return;
    const dx = ring.x - state.x;
    const dy = ring.alt - state.alt;
    const sx = CX + (dx * FOCAL) / dz;
    const sy = horizon - (dy * FOCAL) / dz;
    const radius = (ring.r * FOCAL) / dz;
    if (sx < -radius - 40 || sx > FIELD.width + radius + 40) return;
    if (ring.passed) return;
    const pulse = 1 + 0.06 * Math.sin(state.time * 3 + ring.at);
    ctx.lineWidth = Math.max(2, radius * 0.22);
    ctx.strokeStyle = 'rgba(255, 140, 26, 0.35)';
    ctx.beginPath();
    ctx.arc(sx, sy, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, radius * 0.1);
    ctx.strokeStyle = PALETTE.ring;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 179, 71, 0.9)';
    ctx.font = `700 ${Math.max(10, Math.floor(radius * 0.34))}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Label only at a readable distance: a ring right on the nose is drawn
    // bare, or its giant text would swallow the HUD.
    if (radius > 26 && radius <= 110) ctx.fillText('RING', sx, sy);
    ctx.textBaseline = 'alphabetic';
  }

  function drawRain(state) {
    ctx.strokeStyle = 'rgba(200, 220, 240, 0.35)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 90; index += 1) {
      const x = ((index * 137.5 + state.time * 260) % (FIELD.width + 80)) - 40;
      const y = ((index * 89.3 + state.time * 620) % (FIELD.height + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 7, y + 22);
      ctx.stroke();
    }
  }

  function drawSpeedLines(state) {
    if (state.speed < 220 || !state.airborne) return;
    const strength = clamp((state.speed - 220) / 100, 0, 1) * 0.5;
    ctx.strokeStyle = `rgba(255, 255, 255, ${strength})`;
    ctx.lineWidth = 1.5;
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + state.time * 0.6;
      const x1 = CX + Math.cos(angle) * 420;
      const y1 = PLANE_Y + Math.sin(angle) * 260;
      const x2 = CX + Math.cos(angle) * 560;
      const y2 = PLANE_Y + Math.sin(angle) * 340;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  function drawPlane(state) {
    const bank = state.roll;
    const bob = state.airborne ? Math.sin(state.time * 2.2) * 2 : 0;
    const y = PLANE_Y - state.pitch * 1.1 + bob;
    ctx.save();
    ctx.translate(CX, y);
    ctx.rotate(bank * DEG);
    // Wings, swept back slightly, teal with cream tips.
    ctx.fillStyle = PALETTE.planeTeal;
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.lineTo(-104, 26);
    ctx.lineTo(-104, 36);
    ctx.lineTo(-12, 22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 6);
    ctx.lineTo(104, 26);
    ctx.lineTo(104, 36);
    ctx.lineTo(12, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeCream;
    ctx.fillRect(-104, 26, 14, 10);
    ctx.fillRect(90, 26, 14, 10);
    // Twin engines with spinning prop discs.
    for (const side of [-1, 1]) {
      const ex = side * 58;
      ctx.fillStyle = '#33414f';
      ctx.beginPath();
      ctx.ellipse(ex, 16, 10, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      const spin = state.time * (6 + state.throttle * 22);
      ctx.strokeStyle = 'rgba(245, 234, 214, 0.55)';
      ctx.lineWidth = 2;
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = spin + (blade * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(ex - Math.cos(angle) * 17, 16 - Math.sin(angle) * 17);
        ctx.lineTo(ex + Math.cos(angle) * 17, 16 + Math.sin(angle) * 17);
        ctx.stroke();
      }
    }
    // Fuselage: tail at the bottom, nose away at the top.
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.moveTo(-13, 48);
    ctx.quadraticCurveTo(-17, 0, -9, -50);
    ctx.quadraticCurveTo(0, -58, 9, -50);
    ctx.quadraticCurveTo(17, 0, 13, 48);
    ctx.quadraticCurveTo(0, 56, -13, 48);
    ctx.fill();
    // Teal cheatline along the fuselage and a coral stripe.
    ctx.fillStyle = PALETTE.planeTeal;
    ctx.fillRect(-13, -6, 26, 5);
    ctx.fillStyle = PALETTE.planeCoral;
    ctx.fillRect(-13, 0, 26, 3);
    // Tail fin and stabiliser.
    ctx.fillStyle = PALETTE.planeTeal;
    ctx.beginPath();
    ctx.moveTo(-8, 40);
    ctx.lineTo(0, 66);
    ctx.lineTo(8, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeCoral;
    ctx.fillRect(-30, 44, 60, 6);
    // Navigation lights: red left, green right, strobe at the tail.
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-104, 31, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#37e08a';
    ctx.beginPath();
    ctx.arc(104, 31, 3, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(state.time * 6) > 0.4) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 68, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
  }

  function drawCompass(state) {
    const w = 380;
    const x0 = CX - w / 2;
    panel(x0, 12, w, 44);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, 12, w, 44, 10);
    ctx.clip();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.textAlign = 'center';
    for (let deg = -75; deg <= 75; deg += 15) {
      const heading = Math.round(state.heading + deg);
      const x = CX + (deg / 75) * (w / 2 - 14);
      const label = headingLabel(heading);
      const major = deg % 45 === 0;
      ctx.strokeStyle = major ? PALETTE.text : PALETTE.muted;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, major ? 30 : 26);
      ctx.stroke();
      if (major) ctx.fillText(label, x, 46);
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(CX - 6, 12);
    ctx.lineTo(CX + 6, 12);
    ctx.lineTo(CX, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(`${headingLabel(state.heading)} ${((Math.round(state.heading) % 360) + 360) % 360}°`, CX, 62);
  }

  function drawAttitude(state) {
    const cx = 92;
    const cy = 612;
    const radius = 46;
    panel(30, 556, 170, 128);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.roll * DEG);
    ctx.translate(0, state.pitch * 1.6);
    ctx.fillStyle = '#3f7fb5';
    ctx.fillRect(-radius - 4, -radius * 2, radius * 2 + 8, radius * 2);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-radius - 4, 0, radius * 2 + 8, radius * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed aircraft symbol over the ball.
    ctx.strokeStyle = PALETTE.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`ALT ${Math.max(0, Math.round(state.alt))} m`, 150, 596);
    ctx.fillText(`V/S ${state.verticalSpeed >= 0 ? '+' : ''}${state.verticalSpeed.toFixed(1)} m/s`, 150, 620);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(state.airborne ? 'AIRBORNE' : 'ON GROUND', 150, 644);
    ctx.fillText(`WIND ${Math.round(state.windNow)} m/s`, 150, 664);
  }

  function drawSpeedAndFuel(state) {
    panel(FIELD.width - 210, 556, 180, 128);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 26px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(state.speed)}`, FIELD.width - 78, 596);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('km/h', FIELD.width - 44, 596);
    ctx.textAlign = 'left';
    ctx.fillText('THR', FIELD.width - 196, 622);
    const barW = 120;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(FIELD.width - 160, 612, barW, 10);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillRect(FIELD.width - 160, 612, barW * state.throttle, 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(`${Math.round(state.throttle * 100)}%`, FIELD.width - 34, 622);
    ctx.fillText('FUEL', FIELD.width - 196, 650);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(FIELD.width - 160, 640, barW, 10);
    ctx.fillStyle = state.fuel > 30 ? PALETTE.ok : state.fuel > 15 ? PALETTE.amber : PALETTE.warning;
    ctx.fillRect(FIELD.width - 160, 640, barW * (state.fuel / 100), 10);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`${Math.round(state.fuel)}%`, FIELD.width - 34, 650);
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(state.fuel <= 0 ? 'TANK EMPTY' : state.airborne ? 'FLYING' : 'TAXI', FIELD.width - 196, 674);
  }

  function drawMissionPanel(state) {
    const mission = state.mission;
    panel(16, 12, 330, 92);
    ctx.fillStyle = PALETTE.amber;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(mission.name.toUpperCase(), 30, 36);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`Rings ${state.ringsPassed}/${mission.rings.length}   Landings ${state.landingsDone}/${mission.targetLandings}`, 30, 60);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(mission.briefing, 30, 82);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE ${state.score}`, FIELD.width - 30, 36);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`TIME ${formatTime(state.missionTime)}`, FIELD.width - 30, 60);
    ctx.fillText(`LIVES ${'●'.repeat(state.lives)}${'○'.repeat(Math.max(0, PLANE.lives - state.lives))}`, FIELD.width - 30, 82);
    ctx.textAlign = 'left';
  }

  function drawWaypointArrow(state, waypoint) {
    if (!waypoint || state.phase !== 'flying') return;
    const dx = waypoint.x - state.x;
    const direction = dx > 24 ? 1 : dx < -24 ? -1 : 0;
    const label = `${waypoint.name} ${Math.max(0, Math.round(waypoint.dist))} m`;
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.beginPath();
    ctx.roundRect(CX - 110, 76, 220, 30, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.amber;
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'center';
    const arrow = direction === 1 ? '→' : direction === -1 ? '←' : '↓';
    ctx.fillText(`${arrow}  ${label}`, CX, 96);
  }

  function drawWarnings(state) {
    const warnings = [];
    if (state.stalled) warnings.push('STALL — NOSE DOWN, ADD POWER');
    if (state.fuel > 0 && state.fuel < 20) warnings.push('LOW FUEL');
    if (state.fuel <= 0) warnings.push('ENGINE OUT — GLIDE TO A STRIP');
    if (state.airborne && state.alt < 60 && state.speed > 40) warnings.push('TERRAIN');
    if (warnings.length === 0) return;
    const blink = Math.sin(state.time * 9) > -0.2;
    if (!blink) return;
    ctx.fillStyle = PALETTE.warning;
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(warnings.join('   •   '), CX, 128);
  }

  function drawPitchLadder(state) {
    if (!state.airborne) return;
    ctx.strokeStyle = 'rgba(234, 246, 255, 0.5)';
    ctx.lineWidth = 1.5;
    for (const deg of [-10, -5, 5, 10]) {
      const y = PLANE_Y - deg * 3.2 - state.pitch * 3.2;
      const len = deg % 10 === 0 ? 26 : 16;
      ctx.beginPath();
      ctx.moveTo(CX - 150, y);
      ctx.lineTo(CX - 150 + len, y);
      ctx.moveTo(CX + 150 - len, y);
      ctx.lineTo(CX + 150, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(234, 246, 255, 0.75)';
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.abs(deg)), CX - 156, y + 4);
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.abs(deg)), CX + 156, y + 4);
    }
  }

  function dim() {
    ctx.fillStyle = 'rgba(6, 12, 20, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function centredPanel(title, lines, accent) {
    const w = 620;
    const h = 120 + lines.length * 30;
    const x = CX - w / 2;
    const y = 190;
    ctx.fillStyle = 'rgba(8, 18, 28, 0.82)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, CX, y + 52);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 15px ${FONT}`;
    lines.forEach((line, index) => {
      ctx.fillText(line, CX, y + 92 + index * 30);
    });
  }

  function drawTitle(state, best) {
    dim();
    ctx.fillStyle = PALETTE.amber;
    ctx.font = `700 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('ISLAND COURIER', CX, 150);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText('Nusantara Skies — a mail run over the islands', CX, 186);
    const mission = state.mission;
    centredPanel(
      `Sortie ${state.missionIndex + 1} of ${3} — ${mission.name}`,
      [
        mission.briefing,
        `Fuel ${mission.fuelStart}%   •   Wind ${mission.wind} m/s   •   Rings ${mission.rings.length}   •   Landings ${mission.targetLandings}`,
        '← → bank and turn    ↑ ↓ climb and descend    Shift / Ctrl throttle    Space airbrake',
        'Fly through the rings, land on the strips, mind the fuel gauge.',
        `Best score: ${best}`,
      ],
      PALETTE.amber,
    );
    ctx.fillStyle = PALETTE.ok;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText('Press ENTER or click to fly', CX, 560);
  }

  function drawPaused() {
    dim();
    centredPanel('PAUSED', ['Press P or ENTER to keep flying.', 'M toggles the sound.'], PALETTE.text);
  }

  function drawCrash(state) {
    dim();
    const reason =
      state.crashReason === 'water'
        ? 'Ditched in the sea.'
        : state.crashReason === 'terrain'
          ? 'Clipped the hillside.'
          : 'Hard landing — the gear gave up.';
    centredPanel(
      'CRASHED',
      [
        reason,
        state.lives > 0
          ? `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left — respawning at the last strip.`
          : 'No lives left.',
        state.lives > 0 ? 'Press ENTER to fly again.' : 'Press ENTER for the scoreboard.',
      ],
      PALETTE.warning,
    );
  }

  function drawMissionComplete(state, totalScore) {
    dim();
    const stats = state.finishedStats;
    centredPanel(
      `SORTIE COMPLETE — ${state.mission.name}`,
      [
        `Landed at ${stats.island}. Rings ${stats.rings} · Landings ${stats.landings} · Time ${formatTime(stats.time)}`,
        `Flying score ${stats.score}  +  time bonus ${stats.timeBonus}  +  fuel bonus ${stats.fuelBonus}`,
        `Sortie total: ${stats.total}      Campaign total: ${totalScore}`,
        state.missionIndex + 1 < 3 ? 'Press ENTER for the next sortie.' : 'Press ENTER for the final scoreboard.',
      ],
      PALETTE.ok,
    );
  }

  function drawGameOver(state, best) {
    dim();
    centredPanel(
      'OUT OF LIVES',
      [
        `Campaign score: ${state.score}`,
        `Best score: ${Math.max(best, state.score)}`,
        'Press ENTER to fly the first sortie again.',
      ],
      PALETTE.warning,
    );
  }

  function drawWorld(state) {
    drawSky(state);
    ctx.save();
    ctx.translate(CX, PLANE_Y);
    ctx.rotate(-state.roll * 0.35 * DEG);
    ctx.translate(-CX, -PLANE_Y);
    drawClouds(state);
    drawDistantRidges(state);
    drawSea(state);
    const islands = [...state.islands, ...state.decoIslands].sort((a, b) => b.at - a.at);
    for (const island of islands) drawIsland(state, island);
    const rings = [...state.rings].sort((a, b) => b.at - a.at);
    for (const ring of rings) drawRing(state, ring);
    ctx.restore();
    if (state.mission.rain) drawRain(state);
    drawSpeedLines(state);
    drawPlane(state);
  }

  function draw(state, screen, info) {
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, info.best);
      return;
    }
    drawMissionPanel(state);
    drawCompass(state);
    drawAttitude(state);
    drawSpeedAndFuel(state);
    drawWaypointArrow(state, info.waypoint);
    drawPitchLadder(state);
    drawWarnings(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_CRASH) drawCrash(state);
    else if (screen === SCREEN_MISSION) drawMissionComplete(state, info.totalScore);
    else if (screen === SCREEN_OVER) drawGameOver(state, info.best);
  }

  return { draw };
}
