// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, paused,
// crashed, mission complete and game over.
//
// ?seed=N fixes the clouds and islands. ?shot=takeoff|rings|landing|storm (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_LANDED, EVENT_MISSION, EVENT_RING, EVENT_TAKEOFF } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_CRASH,
  SCREEN_MISSION,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const IDLE_INPUT = { roll: 0, pitch: 0, throttle: 0, brake: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, {
      best: scene.best,
      totalScore: world.state.score,
      waypoint: world.nextWaypoint(),
      muted: audio.isMuted(),
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let totalScore = 0;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startMission(index) {
    world.reset(index);
    totalScore = index === 0 ? 0 : totalScore;
    screen = SCREEN_PLAY;
    announce(`Sortie ${index + 1}: ${MISSIONS[index].name}. ${MISSIONS[index].briefing}`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (totalScore > best) {
      best = totalScore;
      saveBest(best);
    }
    announce(`Out of lives. Campaign score ${totalScore}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_LANDED) audio.landing();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_MISSION) audio.mission();
    if (events & EVENT_FUEL_EMPTY) announce('Fuel empty. Glide to a strip.');
    if (events & EVENT_TAKEOFF) announce('Airborne.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (screen === SCREEN_TITLE && actions & ACTION_CONFIRM) {
      audio.unlock();
      audio.click();
      startMission(0);
      return;
    }
    if (screen === SCREEN_OVER && actions & ACTION_CONFIRM) {
      audio.click();
      totalScore = 0;
      startMission(0);
      return;
    }
    if (screen === SCREEN_MISSION && actions & ACTION_CONFIRM) {
      audio.click();
      if (world.state.missionIndex + 1 < MISSIONS.length) startMission(world.state.missionIndex + 1);
      else endGame();
      return;
    }
    if (screen === SCREEN_CRASH && actions & ACTION_CONFIRM) {
      audio.click();
      if (world.state.lives > 0) {
        world.respawn();
        screen = SCREEN_PLAY;
        announce('Back in the air. Fly safe.');
      } else {
        endGame();
      }
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, IDLE_INPUT);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, {
      roll: input.roll(),
      pitch: input.pitch(),
      throttle: input.throttle(),
      brake: input.brake(),
    });
    handleEvents(events);
    if (world.state.phase === 'crashed') {
      screen = SCREEN_CRASH;
      announce(`Crashed. ${world.state.lives} lives left.`);
    } else if (world.state.phase === 'finished') {
      totalScore += world.state.finishedStats.total;
      if (totalScore > best) {
        best = totalScore;
        saveBest(best);
      }
      screen = SCREEN_MISSION;
      announce(`Sortie complete. Total ${totalScore}.`);
    } else if (world.state.phase === 'gameover') {
      endGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    audio.engine(world.state.throttle, world.state.speed, world.state.airborne);
    renderer.draw(world.state, screen, {
      best,
      totalScore,
      waypoint: world.nextWaypoint(),
      muted: audio.isMuted(),
    });
  }

  // Leaving the tab pauses a running game rather than letting fuel burn unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Island Courier. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
