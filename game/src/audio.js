// Sound, all synthesised with WebAudio — no audio files are shipped.
// The engine is a low sawtooth hum whose pitch follows throttle and speed;
// rings chime, landings thud, warnings beep. Nothing starts before the
// player first interacts (browsers block audio until then).

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
    } catch {
      context = null;
    }
  }

  function tone(frequency, duration, type, volume, when = 0) {
    if (!context || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, context.currentTime + when);
      gain.gain.linearRampToValueAtTime(volume, context.currentTime + when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(context.currentTime + when);
      osc.stop(context.currentTime + when + duration + 0.05);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  return {
    /** Call on first interaction; safe to call any number of times. */
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume().catch(() => {});
    },
    /** Continuous engine note: throttle 0..1 and speed in km/h set the pitch and level. */
    engine(throttle, speed, airborne) {
      if (!context || !engineOsc || !engineGain) return;
      const level = muted ? 0 : airborne ? 0.035 + throttle * 0.05 : 0.02 + throttle * 0.02;
      engineGain.gain.setTargetAtTime(level, context.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(52 + throttle * 48 + speed * 0.12, context.currentTime, 0.1);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.4, 'sine', 0.12, 0.07);
    },
    landing() {
      tone(140, 0.25, 'sine', 0.25);
      tone(660, 0.3, 'sine', 0.1, 0.05);
    },
    crash() {
      tone(90, 0.5, 'sawtooth', 0.22);
      tone(55, 0.7, 'sawtooth', 0.2, 0.08);
    },
    warning() {
      tone(1046, 0.12, 'square', 0.06);
    },
    click() {
      tone(520, 0.08, 'sine', 0.1);
    },
    mission() {
      tone(523, 0.25, 'sine', 0.14);
      tone(659, 0.25, 'sine', 0.14, 0.12);
      tone(784, 0.4, 'sine', 0.16, 0.24);
    },
    toggleMute() {
      muted = !muted;
      if (engineGain && context) engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
