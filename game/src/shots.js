// The screenshot scenes behind ?shot=takeoff|rings|landing|storm. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (bank toward the next waypoint, pitch toward its
// altitude, throttle to hold cruise speed), so the frame is what a short game
// really looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { EVENT_LANDED, EVENT_MISSION } from './world.js';
import { SCREEN_PLAY } from './render.js';

const SAMPLE = STEP;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Steer toward the next waypoint: bank to turn onto it, pitch to its altitude,
 * throttle to hold speed. `cruise` is the target throttle; `approach` slows the
 * plane down and brings it low for a landing shot.
 */
function autopilot(world, cruise, approach) {
  const state = world.state;
  const waypoint = world.nextWaypoint();
  // On the runway, hold the centreline and use takeoff power — a slow roll
  // in the grass is how sorties die before they start.
  if (!state.airborne) {
    const desiredHeading = clamp((Math.atan2(-state.x, 300) / Math.PI) * 180, -40, 40);
    let headingError = desiredHeading - state.heading;
    if (headingError > 180) headingError -= 360;
    if (headingError < -180) headingError += 360;
    return {
      roll: clamp(headingError / 15, -1, 1),
      pitch: 0.25,
      throttle: 1,
      brake: false,
    };
  }
  const targetAlt = waypoint ? waypoint.alt || 220 : 250;
  const targetThrottle = approach ? 0.42 : cruise;
  let desiredHeading = 0;
  let desiredAlt = targetAlt;
  if (waypoint) {
    const dx = waypoint.x - state.x;
    const ahead = Math.max(200, waypoint.dist);
    desiredHeading = clamp((Math.atan2(dx, ahead) / Math.PI) * 180, -40, 40);
    if (approach && waypoint.kind === 'island') {
      desiredAlt = clamp(30 + waypoint.dist * 0.09, 30, 320);
    }
    if (approach && waypoint.kind === 'ring') {
      // Start the descent early: never fly higher than the glide path to the
      // final island plus a margin, so the last ring still leaves room to
      // come down for the strip.
      const finalIsland = state.mission.islands[state.mission.islands.length - 1];
      const dFinal = Math.max(finalIsland.at - state.dist, 0);
      desiredAlt = Math.min(desiredAlt, 30 + dFinal * 0.09 + 120);
    }
  }
  let headingError = desiredHeading - state.heading;
  if (headingError > 180) headingError -= 360;
  if (headingError < -180) headingError += 360;
  const roll = clamp(headingError / 22, -1, 1);
  const altError = desiredAlt - state.alt;
  const pitch = clamp(altError / 100, -1, 1);
  const throttle = state.throttle < targetThrottle - 0.02 ? 1 : state.throttle > targetThrottle + 0.02 ? -1 : 0;
  return { roll, pitch, throttle, brake: false };
}

export { autopilot };

function flyFor(world, seconds, cruise, approach) {
  let events = 0;
  for (let index = 0; index < seconds / SAMPLE; index += 1) {
    events |= world.step(SAMPLE, autopilot(world, cruise, approach));
    if (events & (EVENT_LANDED | EVENT_MISSION)) break;
    if (world.state.phase !== 'flying') break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * takeoff: full throttle down the home strip, just lifting off.
 * rings: mid-route, threading the rings of the first sortie.
 * landing: on final approach to Pulau Bintang, low over the sea.
 * storm: inside the storm sortie, rain and crosswind.
 */
export function stageShot(name, world) {
  if (name === 'storm') {
    world.reset(2);
    flyFor(world, 21, 0.68, false);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'landing') {
    world.reset(1);
    // Fly the whole hop — rings, the Kelor strip, then on to Bintang — and stop
    // on final approach: low over the sea, the strip ahead. A mid-route landing
    // does not stop the staging; the plane takes off again and carries on.
    for (let index = 0; index < 150 / SAMPLE; index += 1) {
      const events = world.step(SAMPLE, autopilot(world, 0.68, true));
      const state = world.state;
      const last = state.mission.islands[state.mission.islands.length - 1];
      const dFinal = last.at - state.dist;
      if (state.phase === 'finished' || state.phase === 'gameover' || state.phase === 'crashed') break;
      if (state.phase === 'flying' && state.airborne && dFinal > 0 && dFinal < 450 && state.alt < 110) break;
      if (events & EVENT_LANDED && state.landingsDone > 0 && dFinal < 0) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'rings') {
    world.reset(0);
    flyFor(world, 26, 0.68, false);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // takeoff (and any unknown name): throttle up on the home strip, lift off,
  // then climb away with the first rings ahead.
  world.reset(0);
  for (let index = 0; index < 5.5 / SAMPLE; index += 1) {
    world.step(SAMPLE, { roll: 0, pitch: 0.25, throttle: 1, brake: false });
    if (world.state.phase !== 'flying') break;
  }
  for (let index = 0; index < 3.5 / SAMPLE; index += 1) {
    world.step(SAMPLE, { roll: 0, pitch: 0.6, throttle: 0.3, brake: false });
    if (world.state.phase !== 'flying') break;
  }
  return { screen: SCREEN_PLAY, best: 0 };
}
