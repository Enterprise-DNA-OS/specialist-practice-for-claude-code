#!/usr/bin/env node
// Loads the demo rooms (supabase/seed.sql). Safe to run twice: the second run does nothing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  await db.exec('BEGIN');
  try {
    await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    await seed(db);
    console.log(`seed: demo rooms ready (${db.mode})`);
  } finally {
    await db.close();
  }
}
