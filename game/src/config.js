// Island Courier — every tuning number, colour and mission in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The courier plane: a little twin-prop island hopper. Speeds in km/h, altitudes in metres. */
export const PLANE = {
  cruiseSpeed: 185,
  maxSpeed: 320,
  stallSpeed: 95,
  takeoffSpeed: 110,
  accelPerThrottle: 0.55,
  drag: 0.012,
  climbRate: 12,
  sinkRate: 7.0,
  rollRate: 95,
  maxRoll: 62,
  turnRate: 0.42,
  fuelCapacity: 100,
  fuelBurnCruise: 0.18,
  fuelBurnFull: 0.5,
  lives: 3,
};

/** How far ahead the pilot can see, in metres; the world is generated this far out. */
export const VIEW_DISTANCE = 5200;

/** Ring pass tolerance, in metres of travel past the ring plane. */
export const RING_PASS_DEPTH = 28;

/** A landing counts when the wheels touch inside the strip at a gentle sink rate. */
export const LANDING = {
  maxSink: 4.5,
  maxSpeed: 165,
  minSpeed: 85,
  stripHalfWidth: 26,
  stripLength: 420,
  flareBonusSink: 2.2,
};

/** Points for each thing the pilot does right. */
export const SCORE = {
  ring: 250,
  landing: 500,
  landingCenterBonus: 150,
  landingSoftBonus: 150,
  missionFuelBonusPerUnit: 6,
  missionTimeBonusPerSecond: 4,
  crashPenalty: 200,
};

/** Three sorties, in order. Distances are metres along the route from the home strip. */
export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    briefing: 'Fly the mail run through all 8 rings before the fuel runs dry.',
    fuelStart: 100,
    wind: 0,
    gust: 0,
    turbulence: 0,
    rain: false,
    targetRings: 8,
    targetLandings: 0,
    rings: [
      { at: 550, x: 0, alt: 120, r: 55 },
      { at: 1050, x: -140, alt: 180, r: 55 },
      { at: 1550, x: 120, alt: 260, r: 55 },
      { at: 2050, x: -60, alt: 200, r: 55 },
      { at: 2550, x: 170, alt: 320, r: 55 },
      { at: 3050, x: -180, alt: 280, r: 55 },
      { at: 3550, x: 40, alt: 240, r: 55 },
      { at: 4050, x: -90, alt: 300, r: 55 },
    ],
    islands: [
      { at: 0, x: 0, size: 380, runway: true, name: 'Pulau Rumah' },
      { at: 900, x: -320, size: 180, runway: false, name: 'Karang Kecil' },
      { at: 2300, x: 300, size: 220, runway: false, name: 'Pulau Kelor' },
      { at: 4300, x: 0, size: 300, runway: true, name: 'Pulau Bintang' },
    ],
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    briefing: 'Land on both island strips. Rings on the way pay the fuel bill.',
    fuelStart: 100,
    wind: 6,
    gust: 3,
    turbulence: 0.3,
    rain: false,
    targetRings: 4,
    targetLandings: 2,
    rings: [
      { at: 650, x: -80, alt: 200, r: 55 },
      { at: 1450, x: 150, alt: 280, r: 55 },
      { at: 2350, x: -120, alt: 220, r: 55 },
      { at: 3150, x: 60, alt: 300, r: 55 },
    ],
    islands: [
      { at: 0, x: 0, size: 380, runway: true, name: 'Pulau Rumah' },
      { at: 1900, x: 0, size: 280, runway: true, name: 'Pulau Kelor' },
      { at: 3800, x: 0, size: 300, runway: true, name: 'Pulau Bintang' },
    ],
  },
  {
    id: 'storm-courier',
    name: 'Storm Courier',
    briefing: 'A storm is coming in. Thread the rings, land in the crosswind, deliver the mail.',
    fuelStart: 85,
    wind: 14,
    gust: 8,
    turbulence: 0.85,
    rain: true,
    targetRings: 6,
    targetLandings: 1,
    rings: [
      { at: 550, x: 100, alt: 240, r: 55 },
      { at: 1150, x: -160, alt: 200, r: 55 },
      { at: 1750, x: 60, alt: 320, r: 55 },
      { at: 2350, x: -100, alt: 180, r: 55 },
      { at: 2950, x: 180, alt: 280, r: 55 },
      { at: 3550, x: -40, alt: 240, r: 55 },
    ],
    islands: [
      { at: 0, x: 0, size: 380, runway: true, name: 'Pulau Rumah' },
      { at: 2100, x: 40, size: 280, runway: true, name: 'Pulau Kelor' },
      { at: 4100, x: 0, size: 300, runway: true, name: 'Pulau Bintang' },
    ],
  },
];

/** Golden-hour palette: warm sun, deep blue sea, green islands. */
export const PALETTE = {
  skyTop: '#16324f',
  skyMid: '#4a7fa5',
  skyHorizon: '#f2a65e',
  sunCore: '#ffe9a8',
  sunGlow: '#ffb347',
  seaDeep: '#14495f',
  seaShallow: '#2e86a8',
  seaGlitter: '#ffd97a',
  sand: '#e8d29a',
  grass: '#4f9d5d',
  jungle: '#2f7a44',
  volcano: '#6b4a3a',
  volcanoSnow: '#f4ede0',
  runway: '#3a3f4a',
  runwayLine: '#f5f1e6',
  ring: '#ffb347',
  ringGlow: '#ff8c1a',
  planeCream: '#f5ead6',
  planeTeal: '#0f766e',
  planeCoral: '#e07856',
  panel: 'rgba(8, 18, 28, 0.58)',
  panelEdge: 'rgba(255, 255, 255, 0.16)',
  text: '#eaf6ff',
  muted: '#9fc3d8',
  amber: '#ffc857',
  warning: '#ff5a4e',
  ok: '#7ee081',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'island-courier.best';
