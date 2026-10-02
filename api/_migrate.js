// Applies db/migrations/*.sql in order and records each one, shared by the
// deploy-time script (scripts/db-migrate.js), the local dev server, and the
// tests. Sharing it matters: the tests then exercise the same statement
// splitting that production runs against Neon.
//
// The driver interface is deliberately tiny so Neon (HTTP) and PGlite
// (embedded) both fit it:
//   query(text, params) -> rows
//   transaction([[text, params], ...]) -> runs atomically
const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");
const LEDGER = "fashion_store_os_schema_migrations";

// Neon's HTTP driver runs one statement per query, so a migration file is
// split here and the pieces run inside one transaction -- all of a file lands,
// or none of it does. The splitter understands line comments and single-quoted
// strings, which is everything these files use. It refuses dollar quoting
// outright: a function body full of semicolons would be split mid-statement,
// and a loud refusal beats a half-applied migration.
function splitStatements(sqlText) {
  const statements = [];
  let current = "";
  let inString = false;
  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const next = sqlText[index + 1];
    // Checked during the scan, not on the raw text, so a comment that merely
    // mentions dollar quoting does not trip it. Migrations take no parameters,
    // so any "$" in live SQL can only be dollar quoting ($$ or a named $tag$).
    if (!inString && char === "$") {
      throw new Error("Dollar-quoted bodies are not supported by the migration runner; split the function into its own tooling.");
    }
    if (!inString && char === "-" && next === "-") {
      // Skip to end of line; a comment's semicolons are not statement ends.
      const newline = sqlText.indexOf("\n", index);
      index = newline === -1 ? sqlText.length : newline;
      current += "\n";
      continue;
    }
    if (char === "'") {
      // A doubled quote inside a string is an escaped quote, not a close.
      if (inString && next === "'") {
        current += "''";
        index += 1;
        continue;
      }
      inString = !inString;
    }
    if (char === ";" && !inString) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (inString) {
    throw new Error("Unterminated string literal in migration.");
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
}

async function migrate(driver, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  await driver.query(
    `create table if not exists ${LEDGER} (version text primary key, applied_at timestamptz not null default now())`,
    [],
  );
  const appliedRows = await driver.query(`select version from ${LEDGER}`, []);
  const applied = new Set(appliedRows.map((row) => row.version));
  const files = listMigrationFiles(dir);
  const ran = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;
    const statements = splitStatements(fs.readFileSync(path.join(dir, file), "utf8"));
    // The ledger row rides in the same transaction, so a file is never
    // recorded as applied unless every statement in it succeeded.
    await driver.transaction([
      ...statements.map((text) => [text, []]),
      [`insert into ${LEDGER} (version) values ($1)`, [version]],
    ]);
    log(`applied ${version} (${statements.length} statements)`);
    ran.push(version);
  }

  return { applied: ran, total: files.length };
}

module.exports = { LEDGER, MIGRATIONS_DIR, listMigrationFiles, migrate, splitStatements };
