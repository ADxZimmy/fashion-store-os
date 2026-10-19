// PGlite (Postgres compiled to WebAssembly, embedded in-process) wrapped in
// the same two-method driver interface as Neon's in api/_db.js. The local dev
// server and the test suites run the production SQL adapter through this, so
// the code they exercise is the code Neon runs.
//
// Dev-only: PGlite is a devDependency and nothing under api/ requires this
// file, so Vercel never bundles it into a function.
const { PGlite } = require("@electric-sql/pglite");
const { migrate } = require("../api/_migrate");
const { createPgIdentityStore, TABLES } = require("../api/_identity_pg");

function createPgliteDriver(dataDir) {
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  return {
    pg,
    async query(text, params = []) {
      const result = await pg.query(text, params);
      return result.rows;
    },
    async transaction(statements) {
      await pg.transaction(async (tx) => {
        for (const [text, params] of statements) {
          await tx.query(text, params || []);
        }
      });
    },
    close: () => pg.close(),
  };
}

// One persistent database for the local dev server, migrated on startup.
async function openDevDatabase(dataDir, log = () => {}) {
  const driver = createPgliteDriver(dataDir);
  await driver.pg.waitReady;
  await migrate(driver, { log });
  return { driver, db: createPgIdentityStore({ query: driver.query, transaction: driver.transaction }) };
}

// One in-memory database per test suite. Starting PGlite costs seconds, so a
// suite opens it once and reset() empties every table between scenarios in
// milliseconds. The migration ledger is left alone: the schema is applied once.
async function openTestDatabase() {
  const driver = createPgliteDriver();
  await driver.pg.waitReady;
  await migrate(driver);
  const db = createPgIdentityStore({ query: driver.query, transaction: driver.transaction });
  const tables = Object.values(TABLES).join(", ");
  return {
    driver,
    db,
    sql: driver.query,
    async reset() {
      await driver.query(`truncate table ${tables} restart identity cascade`, []);
      return db;
    },
    close: driver.close,
  };
}

module.exports = { createPgliteDriver, openDevDatabase, openTestDatabase };
