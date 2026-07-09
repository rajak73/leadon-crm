import { prepareTestDb, cleanupTestDb } from './helpers.js';

/** Create the test DB once before the whole run, remove it after. */
export async function setup() {
  prepareTestDb();
}

export async function teardown() {
  cleanupTestDb();
}
