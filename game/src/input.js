// Keyboard, mouse and touch input, read once per frame.
// Arrow keys / WASD fly the plane (left/right roll, up/down pitch);
// Shift/Ctrl work the throttle; Space is the airbrake;
// Enter or click confirms; P pauses; M mutes.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const KEY_ROLL_LEFT = ['ArrowLeft', 'a', 'A'];
const KEY_ROLL_RIGHT = ['ArrowRight', 'd', 'D'];
const KEY_PITCH_UP = ['ArrowUp', 'w', 'W'];
const KEY_PITCH_DOWN = ['ArrowDown', 's', 'S'];
const KEY_THROTTLE_UP = ['Shift'];
const KEY_THROTTLE_DOWN = ['Control'];
const KEY_BRAKE = [' '];
const KEY_CONFIRM = ['Enter'];
const KEY_PAUSE = ['p', 'P'];
const KEY_MUTE = ['m', 'M'];

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseActive = false;
  let touchX = 0;
  let touchActive = false;

  function keyDown(event) {
    if (KEY_CONFIRM.includes(event.key)) actions |= ACTION_CONFIRM;
    if (KEY_PAUSE.includes(event.key)) actions |= ACTION_PAUSE;
    if (KEY_MUTE.includes(event.key)) actions |= ACTION_MUTE;
    if (KEY_BRAKE.includes(event.key) || KEY_CONFIRM.includes(event.key)) event.preventDefault();
    held.add(event.key);
  }
  function keyUp(event) {
    held.delete(event.key);
  }
  function blur() {
    held.clear();
    mouseActive = false;
    touchActive = false;
  }
  function mouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width;
    mouseActive = true;
  }
  function mouseDown(event) {
    mouseMove(event);
    actions |= ACTION_CONFIRM;
  }
  function touchStart(event) {
    const rect = canvas.getBoundingClientRect();
    touchX = (event.touches[0].clientX - rect.left) / rect.width;
    touchActive = true;
    actions |= ACTION_CONFIRM;
    event.preventDefault();
  }
  function touchMove(event) {
    const rect = canvas.getBoundingClientRect();
    touchX = (event.touches[0].clientX - rect.left) / rect.width;
    event.preventDefault();
  }
  function touchEnd() {
    touchActive = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  canvas.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('mousedown', mouseDown);
  canvas.addEventListener('touchstart', touchStart, { passive: false });
  canvas.addEventListener('touchmove', touchMove, { passive: false });
  canvas.addEventListener('touchend', touchEnd);

  function isHeld(keys) {
    return keys.some((key) => held.has(key));
  }

  return {
    /** Roll input -1 (left) .. 1 (right), from keys or from pointer position. */
    roll() {
      let value = 0;
      if (isHeld(KEY_ROLL_LEFT)) value -= 1;
      if (isHeld(KEY_ROLL_RIGHT)) value += 1;
      if (value === 0 && mouseActive) value = (mouseX - 0.5) * 2;
      if (value === 0 && touchActive) value = (touchX - 0.5) * 2;
      return Math.max(-1, Math.min(1, value));
    },
    /** Pitch input -1 (nose down) .. 1 (nose up). */
    pitch() {
      let value = 0;
      if (isHeld(KEY_PITCH_UP)) value += 1;
      if (isHeld(KEY_PITCH_DOWN)) value -= 1;
      return value;
    },
    /** Throttle change -1 .. 1 per second from the throttle keys. */
    throttle() {
      let value = 0;
      if (isHeld(KEY_THROTTLE_UP)) value += 1;
      if (isHeld(KEY_THROTTLE_DOWN)) value -= 1;
      return value;
    },
    brake() {
      return isHeld(KEY_BRAKE);
    },
    /** One-shot actions since the last call; reading them clears them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
