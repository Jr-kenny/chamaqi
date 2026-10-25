/**
 * ChamaQi store — one JSON file per chama under data/. Pure filesystem,
 * no database, works offline on any laptop. Synchronous reads are fine at
 * chama scale (dozens of members); write-through on every mutation gives
 * crash safety for free.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CHAMAQI_DATA_DIR || join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

export function chamaFile(name) {
  return join(DATA_DIR, `${name.replace(/[^a-z0-9-]/gi, '_').toLowerCase() || 'demo'}.json`);
}

export function load(name) {
  const file = chamaFile(name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function save(state) {
  const file = chamaFile(state.name);
  state.updatedAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(state, null, 2));
  return file;
}
