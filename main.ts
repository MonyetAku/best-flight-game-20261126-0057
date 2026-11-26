// Island Courier — the entrypoint (Node 22, standard library only).
// The game is plain static files under game/ that a desktop browser loads
// offline; this program hands them in. It checks the hand-in is complete,
// copies game/ and screenshots/ from beside this file to /output, and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Stop the run with a clear reason instead of handing in a broken entry. */
function fail(message: string): never {
  throw new Error(`Island Courier: ${message}`);
}

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
if (shots.length < 3 || shots.length > 4) fail(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
for (const shot of shots) {
  const size = statSync(join(shotsDir, shot)).size;
  if (size > 262144) fail(`screenshots/${shot} is ${size} bytes, over the 256 KiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Say what was handed in, so a run's log shows the entry is complete.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(
  `Island Courier handed in: ${shots.length} screenshots (${shots.sort().join(', ')}), ` +
    `dossier.json ${dossierBytes} bytes, to ${out}`,
);
