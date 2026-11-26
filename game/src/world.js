// The world: the flight model, the route, the missions and the events.
// The plane flies a forward rail over an archipelago: distance along the route,
// lateral offset from the route centreline and altitude above the sea. Rings,
// islands and runways sit at fixed distances; the plane's heading steers it
// across the route. Nothing here draws anything — render.js does that.

import { FIELD, LANDING, MISSIONS, PLANE, RING_PASS_DEPTH, SCORE, STEP, VIEW_DISTANCE } from './config.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASH = 4;
export const EVENT_MISSION = 8;
export const EVENT_FUEL_EMPTY = 16;
export const EVENT_TAKEOFF = 32;

const DEG = Math.PI / 180;

/** Height of an island's ground, in metres: flat strips are safe to land on. */
function islandHeight(island, x) {
  if (!island.runway) return 45;
  return Math.abs(x - island.x) < LANDING.stripHalfWidth + 10 ? 0 : 12;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createWorld(random) {
  const state = {
    missionIndex: 0,
    mission: MISSIONS[0],
    dist: 0,
    x: 0,
    alt: 0,
    speed: 0,
    throttle: 0,
    pitch: 0,
    roll: 0,
    heading: 0,
    verticalSpeed: 0,
    fuel: 100,
    lives: PLANE.lives,
    score: 0,
    ringsPassed: 0,
    ringsMissed: 0,
    landingsDone: 0,
    time: 0,
    missionTime: 0,
    airborne: false,
    onGround: true,
    stalled: false,
    phase: 'flying',
    crashReason: '',
    windNow: 0,
    gustPhase: 0,
    fuelEmptyAnnounced: false,
    rings: [],
    islands: [],
    clouds: [],
    decoIslands: [],
    checkpoint: { dist: 0, x: 0 },
    finishedStats: null,
  };

  function buildScenery() {
    state.clouds = [];
    for (let index = 0; index < 16; index += 1) {
      state.clouds.push({
        dist: random.range(400, VIEW_DISTANCE),
        x: random.range(-900, 900),
        alt: random.range(350, 1200),
        size: random.range(90, 280),
        layer: random.int(0, 2),
      });
    }
    state.decoIslands = [];
    for (let index = 0; index < 8; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      state.decoIslands.push({
        at: random.range(500, 4800),
        x: side * random.range(480, 950),
        size: random.range(130, 320),
        volcano: random.next() < 0.3,
      });
    }
  }

  function reset(missionIndex) {
    state.missionIndex = missionIndex;
    state.mission = MISSIONS[missionIndex];
    state.dist = 0;
    state.x = 0;
    state.alt = 0;
    state.speed = 0;
    state.throttle = 0;
    state.pitch = 0;
    state.roll = 0;
    state.heading = 0;
    state.verticalSpeed = 0;
    state.fuel = state.mission.fuelStart;
    state.lives = PLANE.lives;
    state.score = 0;
    state.ringsPassed = 0;
    state.ringsMissed = 0;
    state.landingsDone = 0;
    state.time = 0;
    state.missionTime = 0;
    state.airborne = false;
    state.onGround = true;
    state.stalled = false;
    state.phase = 'flying';
    state.crashReason = '';
    state.windNow = 0;
    state.gustPhase = 0;
    state.fuelEmptyAnnounced = false;
    state.rings = state.mission.rings.map((ring) => ({ ...ring, passed: false, missed: false }));
    state.islands = state.mission.islands;
    state.checkpoint = { dist: 0, x: 0 };
    state.finishedStats = null;
    buildScenery();
  }

  function respawn() {
    state.dist = state.checkpoint.dist;
    state.x = state.checkpoint.x;
    state.alt = 0;
    state.speed = 0;
    state.throttle = 0.3;
    state.pitch = 0;
    state.roll = 0;
    state.heading = 0;
    state.verticalSpeed = 0;
    state.fuel = Math.max(state.fuel, 45);
    state.airborne = false;
    state.onGround = true;
    state.stalled = false;
    state.phase = 'flying';
    state.crashReason = '';
  }

  function crash(reason) {
    state.phase = 'crashed';
    state.crashReason = reason;
    state.lives -= 1;
    state.score = Math.max(0, state.score - SCORE.crashPenalty);
    if (state.lives <= 0) state.phase = 'gameover';
    return EVENT_CRASH;
  }

  function finishMission(island) {
    const lastIsland = state.mission.islands[state.mission.islands.length - 1];
    const parTime = lastIsland.at / 40 + 60;
    const timeBonus = Math.max(0, Math.round(parTime - state.missionTime)) * SCORE.missionTimeBonusPerSecond;
    const fuelBonus = Math.round(state.fuel) * SCORE.missionFuelBonusPerUnit;
    state.finishedStats = {
      island: island.name,
      score: state.score,
      timeBonus,
      fuelBonus,
      total: state.score + timeBonus + fuelBonus,
      rings: state.ringsPassed,
      landings: state.landingsDone,
      time: Math.round(state.missionTime),
    };
    state.score = state.finishedStats.total;
    state.phase = 'finished';
    return EVENT_MISSION;
  }

  function step(dt, input) {
    if (state.phase !== 'flying') return 0;
    let events = 0;
    const prevDist = state.dist;
    state.time += dt;
    state.missionTime += dt;

    // Wind and gusts push the plane sideways; turbulence wobbles the wings.
    state.gustPhase += dt;
    const gust = state.mission.gust;
    state.windNow =
      state.mission.wind +
      gust * Math.sin(state.gustPhase * 0.9) +
      gust * 0.5 * Math.sin(state.gustPhase * 2.3);
    const wobble = state.mission.turbulence * Math.sin(state.time * 7.3);

    // Throttle, then speed chases it (climbing costs speed, diving gains it).
    state.throttle = clamp(state.throttle + input.throttle * 0.5 * dt, 0, 1);
    let targetSpeed = state.throttle * PLANE.maxSpeed;
    if (state.pitch > 0) targetSpeed -= state.pitch * 1.5;
    if (state.pitch < 0) targetSpeed += -state.pitch * 1.5;
    targetSpeed = clamp(targetSpeed, 0, PLANE.maxSpeed);
    // Linear approach: full throttle adds ~32 km/h per second, drag bleeds 25.
    const accel = 10 + state.throttle * 22;
    if (targetSpeed > state.speed) state.speed = Math.min(targetSpeed, state.speed + accel * dt);
    else state.speed = Math.max(targetSpeed, state.speed - 25 * dt);
    if (input.brake) state.speed -= 55 * dt;
    if (state.onGround && state.speed > 0 && state.speed < PLANE.takeoffSpeed) state.speed -= 6 * dt;
    state.speed = Math.max(0, state.speed);

    // Roll banks the plane; bank turns the heading; the nose follows the pitch.
    const targetRoll = input.roll * PLANE.maxRoll;
    const rollStep = PLANE.rollRate * dt;
    state.roll += clamp(targetRoll - state.roll, -rollStep, rollStep) + wobble * 6 * dt;
    state.roll = clamp(state.roll, -PLANE.maxRoll, PLANE.maxRoll);
    // A right bank (positive roll) turns the nose right: heading grows.
    state.heading += state.roll * PLANE.turnRate * (state.speed / PLANE.cruiseSpeed) * dt;
    if (state.heading > 180) state.heading -= 360;
    if (state.heading < -180) state.heading += 360;
    const targetPitch = input.pitch > 0 ? input.pitch * 18 : input.pitch * 16;
    state.pitch += clamp(targetPitch - state.pitch, -25 * dt, 25 * dt) + wobble * 2 * dt;
    state.pitch = clamp(state.pitch, -16, 18);

    // Lift: enough speed and the wing flies; too slow and she sinks.
    const speedMs = state.speed / 3.6;
    state.stalled = state.airborne && state.speed < PLANE.stallSpeed;
    if (state.airborne) {
      if (state.stalled) state.verticalSpeed = -PLANE.sinkRate;
      else {
        state.verticalSpeed = Math.sin(state.pitch * DEG) * speedMs * 0.85;
        state.verticalSpeed = clamp(state.verticalSpeed, -12, PLANE.climbRate);
      }
      state.alt += state.verticalSpeed * dt;
    } else {
      state.verticalSpeed = 0;
    }

    // Move along the route; heading steers across it; wind pushes sideways.
    // On the ground the wheels hold her — the wind barely moves a taxiing
    // plane — but once airborne the full crosswind is hers to fight.
    const windPush = state.airborne ? state.windNow : state.windNow * 0.15;
    state.dist += Math.cos(state.heading * DEG) * speedMs * dt;
    state.x += Math.sin(state.heading * DEG) * speedMs * dt + windPush * dt;

    // Fuel burns with throttle; an empty tank means a dead stick.
    if (state.speed > 1 || state.airborne) {
      state.fuel -= (PLANE.fuelBurnCruise + state.throttle * (PLANE.fuelBurnFull - PLANE.fuelBurnCruise)) * dt;
    }
    if (state.fuel <= 0) {
      state.fuel = 0;
      state.throttle = 0;
      if (!state.fuelEmptyAnnounced) {
        state.fuelEmptyAnnounced = true;
        events |= EVENT_FUEL_EMPTY;
      }
    }

    // Takeoff: fast enough on the strip and she lifts on her own.
    if (state.onGround && state.speed >= PLANE.takeoffSpeed && state.pitch >= -5) {
      state.airborne = true;
      state.onGround = false;
      state.alt = 0.5;
      state.verticalSpeed = 1.5;
      events |= EVENT_TAKEOFF;
    }

    // Rings: crossing a ring's plane inside its circle scores.
    for (const ring of state.rings) {
      if (ring.passed || ring.missed) continue;
      const crossed =
        (prevDist < ring.at && state.dist >= ring.at) || (prevDist > ring.at && state.dist <= ring.at);
      if (!crossed) continue;
      const dx = state.x - ring.x;
      const dy = state.alt - ring.alt;
      if (dx * dx + dy * dy < ring.r * ring.r) {
        ring.passed = true;
        state.ringsPassed += 1;
        state.score += SCORE.ring;
        events |= EVENT_RING;
      } else {
        ring.missed = true;
        state.ringsMissed += 1;
      }
    }

    // Terrain: low over an island that is not a flat strip is a crash.
    if (state.airborne && state.alt > 0) {
      for (const island of state.islands) {
        if (Math.abs(state.dist - island.at) >= island.size / 2) continue;
        if (Math.abs(state.x - island.x) >= island.size / 2) continue;
        if (state.alt < islandHeight(island, state.x)) {
          return events | crash('terrain');
        }
      }
    }

    // Touchdown: on the sea or the ground, a strip or a crash.
    if (state.alt <= 0 && state.airborne) {
      state.alt = 0;
      const strip = state.islands.find(
        (island) =>
          island.runway &&
          Math.abs(state.dist - island.at) < LANDING.stripLength / 2 &&
          Math.abs(state.x - island.x) < LANDING.stripHalfWidth,
      );
      if (
        strip &&
        state.speed >= LANDING.minSpeed &&
        state.speed <= LANDING.maxSpeed &&
        state.verticalSpeed >= -LANDING.maxSink
      ) {
        const touchdownSink = state.verticalSpeed;
        state.airborne = false;
        state.onGround = true;
        state.verticalSpeed = 0;
        state.landingsDone += 1;
        let points = SCORE.landing;
        if (Math.abs(state.x - strip.x) < 10) points += SCORE.landingCenterBonus;
        if (touchdownSink >= -LANDING.flareBonusSink) points += SCORE.landingSoftBonus;
        state.score += points;
        state.fuel = 100;
        state.checkpoint = { dist: strip.at, x: strip.x };
        events |= EVENT_LANDED;
        const lastIsland = state.mission.islands[state.mission.islands.length - 1];
        if (strip === lastIsland && state.landingsDone >= state.mission.targetLandings) {
          events |= finishMission(strip);
        }
      } else if (strip) {
        return events | crash('hard-landing');
      } else {
        return events | crash('water');
      }
    }

    // Rolling on the ground bleeds speed when the pilot is not powering;
    // off the strip end the grass stops her.
    if (state.onGround && state.speed > 0) {
      if (state.throttle < 0.2) state.speed = Math.max(0, state.speed - 22 * dt);
      const strip = state.islands.find(
        (island) =>
          island.runway &&
          Math.abs(state.dist - island.at) < LANDING.stripLength / 2 + 60 &&
          Math.abs(state.x - island.x) < LANDING.stripHalfWidth + 30,
      );
      if (!strip && state.speed > 60) state.speed = Math.max(0, state.speed - 12 * dt);
    }

    return events;
  }

  /** The next thing to fly to: the nearest unpassed ring, else the final strip. */
  function nextWaypoint() {
    let best = null;
    for (const ring of state.rings) {
      if (ring.passed || ring.missed) continue;
      const d = ring.at - state.dist;
      if (d < -50) continue;
      if (!best || d < best.dist) best = { kind: 'ring', dist: d, x: ring.x, alt: ring.alt, name: 'Ring' };
    }
    const lastIsland = state.mission.islands[state.mission.islands.length - 1];
    const islandDist = lastIsland.at - state.dist;
    if (islandDist > -50 && (!best || islandDist < best.dist)) {
      best = { kind: 'island', dist: islandDist, x: lastIsland.x, alt: 0, name: lastIsland.name };
    }
    return best;
  }

  reset(0);

  return { state, reset, step, respawn, nextWaypoint };
}
