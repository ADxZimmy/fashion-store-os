// The Supabase-to-Neon move. Covers the pieces that replaced Supabase rather
// than the identity logic itself (that is test-identity.js, which now runs the
// production SQL adapter): the migration runner, the deploy-time migration
// gate, the unconfigured-database paths of health, maintenance and readiness,
// the secret detector's new connection-string patterns, and the absence of
// any Supabase client in runtime code.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// These tests exercise the "no database configured" behaviour, so they must
// not inherit a real connection string from the shell running them.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const rootDir = path.resolve(__dirname, "..");
const { migrate, splitStatements, listMigrationFiles, LEDGER } = require(path.join(rootDir, "api/_migrate.js"));
const { openTestDatabase } = require(path.join(rootDir, "db/pglite.js"));
const { secretFindings } = require(path.join(rootDir, "scripts/security-audit.js"));

let pass = 0;
let fail = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

function throws(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

// Minimal stand-ins for the Node request/response pair Vercel hands a handler.
function fakeRequest(method = "GET", headers = {}) {
  return { method, headers, url: "/" };
}
function fakeResponse() {
  const captured = { statusCode: 0, headers: {}, body: "" };
  return {
    captured,
    setHeader(key, value) {
      captured.headers[key.toLowerCase()] = value;
    },
    end(payload) {
      captured.body = payload || "";
    },
    get statusCode() {
      return captured.statusCode;
    },
    set statusCode(value) {
      captured.statusCode = value;
    },
  };
}
async function invoke(handlerPath, request = fakeRequest()) {
  const handler = require(path.join(rootDir, handlerPath));
  const response = fakeResponse();
  await handler(request, response);
  let json = null;
  try {
    json = JSON.parse(response.captured.body);
  } catch (error) {
    json = null;
  }
  return { status: response.captured.statusCode, json };
}

function runMigrateScript(env) {
  const childEnv = { ...process.env, ...env };
  delete childEnv.DATABASE_URL;
  delete childEnv.POSTGRES_URL;
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts/db-migrate.js")], {
    env: childEnv,
    encoding: "utf8",
    timeout: 60000,
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

async function main() {
  // --- Statement splitter ---------------------------------------------------
  {
    const parts = splitStatements("create table a (x text); -- a comment; with a semicolon\ncreate table b (y text default 'a;b');");
    ok("splits on statement boundaries only", parts.length === 2, JSON.stringify(parts));
    ok("a semicolon inside a comment is not a boundary", !parts.some((part) => part.includes("comment")));
    ok("a semicolon inside a string is not a boundary", parts[1].includes("'a;b'"));

    const escaped = splitStatements("insert into t values ('it''s; fine');");
    ok("a doubled quote stays inside the string", escaped.length === 1 && escaped[0].includes("it''s; fine"));

    ok("dollar quoting is refused, not mis-split", throws(() => splitStatements("create function f() returns int as $$ select 1; $$ language sql;")) !== null);
    ok("a named dollar tag is refused too", throws(() => splitStatements("do $body$ begin null; end $body$;")) !== null);
    ok("a comment mentioning $$ does not trip the refusal", throws(() => splitStatements("-- never use $$ here\ncreate table c (z text);")) === null);
    ok("an unterminated string is refused", throws(() => splitStatements("insert into t values ('oops);")) !== null);
  }

  // --- The real schema ------------------------------------------------------
  {
    const files = listMigrationFiles();
    ok("migrations are discovered in order", files[0] === "0001_identity.sql", files.join(","));
    const statements = splitStatements(fs.readFileSync(path.join(rootDir, "db/migrations", files[0]), "utf8"));
    ok("the schema splits into DDL statements only", statements.length > 10 && statements.every((sql) => /^create /i.test(sql)), `${statements.length} statements`);
    const schema = statements.join("\n");
    ok("the schema carries no Supabase role grants", !/\b(anon|authenticated|service_role)\b/.test(schema));
    ok("the schema enables no row-level security", !/row level security/i.test(schema));
    for (const table of ["accounts", "stores", "memberships", "sessions", "invites", "rate_limit_events", "identity_audit", "backups", "inbox_messages"]) {
      ok(`the schema creates fashion_store_os_${table}`, new RegExp(`create table fashion_store_os_${table}\\b`).test(schema));
    }
  }

  // --- Migration runner against real Postgres --------------------------------
  {
    const testDb = await openTestDatabase();
    const ledger = await testDb.sql(`select version from ${LEDGER}`);
    ok("the schema is recorded in the ledger once applied", ledger.length === 1 && ledger[0].version === "0001_identity");

    const again = await migrate(testDb.driver);
    ok("a second run applies nothing", again.applied.length === 0);

    // A failing migration must leave no trace: not half its tables, and not a
    // ledger row claiming it ran.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "fso-migrate-test-"));
    fs.writeFileSync(path.join(scratch, "0001_good.sql"), "create table runner_good (id text primary key);");
    fs.writeFileSync(path.join(scratch, "0002_bad.sql"), "create table runner_half (id text);\ncreate table runner_half (id text);");
    let failed = false;
    try {
      await migrate(testDb.driver, { dir: scratch });
    } catch (error) {
      failed = true;
    }
    ok("a failing migration surfaces as an error", failed);
    const halfExists = await testDb.sql("select count(*)::int as count from information_schema.tables where table_name = 'runner_half'");
    ok("a failing migration leaves none of its tables behind", halfExists[0].count === 0);
    const recorded = await testDb.sql(`select version from ${LEDGER} where version in ('0001_good', '0002_bad') order by version`);
    ok(
      "only the migration that succeeded is recorded",
      recorded.length === 1 && recorded[0].version === "0001_good",
      recorded.map((row) => row.version).join(","),
    );
    fs.rmSync(scratch, { recursive: true, force: true });
    await testDb.close();
  }

  // --- Deploy-time migration gate --------------------------------------------
  {
    const preview = runMigrateScript({ VERCEL: "1", VERCEL_ENV: "preview" });
    ok("preview builds skip migrations", preview.code === 0 && /skipped on preview build/.test(preview.out), preview.out.trim());

    const production = runMigrateScript({ VERCEL: "1", VERCEL_ENV: "production" });
    ok("a production build without a database fails", production.code === 1, `exit ${production.code}`);
    ok("the failure says how to fix it", /DATABASE_URL/.test(production.out) && /Neon/.test(production.out));
  }

  // --- Unconfigured database paths ------------------------------------------
  {
    const health = await invoke("api/health.js");
    ok("health reports an unconfigured database without crashing", health.status === 200 && health.json.ok === false && health.json.storage === "unconfigured");

    const maintenance = await invoke("api/maintenance.js");
    ok("maintenance fails loudly when the database is missing", maintenance.status === 503 && maintenance.json.ok === false);

    const readiness = await invoke("api/readiness.js");
    const dbCheck = readiness.json.checks.find((check) => check.name === "database configured");
    ok("readiness is not ready without a database", readiness.json.ok === false && dbCheck && dbCheck.ok === false);
    const optional = readiness.json.checks.filter((check) => check.required === false).map((check) => check.name);
    ok("channel checks are optional, not blocking", optional.includes("webhook signatures required") && optional.includes("channel intake bound to a store"));

    // CRON_SECRET still guards the cron route after the rename.
    process.env.CRON_SECRET = "test-cron-secret-value";
    const unauthorized = await invoke("api/maintenance.js", fakeRequest("GET", {}));
    ok("maintenance refuses a request without the cron secret", unauthorized.status === 401);
    delete process.env.CRON_SECRET;
  }

  // --- Every endpoint still loads ------------------------------------------
  {
    const broken = [];
    for (const file of fs.readdirSync(path.join(rootDir, "api")).filter((name) => name.endsWith(".js"))) {
      try {
        require(path.join(rootDir, "api", file));
      } catch (error) {
        broken.push(`${file}: ${error.message.split("\n")[0]}`);
      }
    }
    ok("every api module loads with no database configured", broken.length === 0, broken.join("; "));
  }

  // --- Supabase is gone from the runtime ------------------------------------
  {
    const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const runtime = [
      ...fs.readdirSync(path.join(rootDir, "api")).filter((name) => name.endsWith(".js")).map((name) => path.join("api", name)),
      "server.js",
      "db/pglite.js",
    ];
    const offenders = runtime.filter((file) => /supabase/i.test(stripComments(fs.readFileSync(path.join(rootDir, file), "utf8"))));
    ok("no runtime file references Supabase", offenders.length === 0, offenders.join(","));
    for (const gone of ["_store.js", "_auth.js", "_identity_supabase.js", "_identity_local.js", "_workspace_codes.js", "_rate_limit.js", "keepalive.js"]) {
      ok(`api/${gone} is deleted`, !fs.existsSync(path.join(rootDir, "api", gone)));
    }

    const vercel = JSON.parse(fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"));
    ok("the daily cron targets maintenance, not keepalive", vercel.crons.length === 1 && vercel.crons[0].path === "/api/maintenance");
    ok("production builds run migrations", /db-migrate\.js/.test(vercel.buildCommand));
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    ok("the Neon driver is a runtime dependency", Boolean(pkg.dependencies && pkg.dependencies["@neondatabase/serverless"]));
    ok("PGlite stays a dev dependency", Boolean(pkg.devDependencies && pkg.devDependencies["@electric-sql/pglite"]) && !(pkg.dependencies || {})["@electric-sql/pglite"]);
    // A require, not a mention: comments in api/ legitimately explain that the
    // tests run on PGlite. What must never happen is a function bundling it.
    ok(
      "nothing under api/ requires PGlite",
      runtime
        .filter((file) => file.startsWith("api"))
        .every((file) => !/require\([^)]*(pglite|db\/pglite)[^)]*\)/i.test(fs.readFileSync(path.join(rootDir, file), "utf8"))),
    );
    ok("the local dev database is git-ignored", /^data\/pglite\/$/m.test(fs.readFileSync(path.join(rootDir, ".gitignore"), "utf8")));
    // vercel env pull writes the connection string to .env.local, and the
    // secret scan only reads source extensions, so git must refuse the file.
    const gitignore = fs.readFileSync(path.join(rootDir, ".gitignore"), "utf8");
    ok("environment files are git-ignored, except the example", /^\.env\.\*$/m.test(gitignore) && /^!\.env\.example$/m.test(gitignore));
  }

  // --- Secret detector: the connection string is the new secret -------------
  {
    // Assembled at runtime so no file in the repo ever contains a contiguous
    // secret-shaped string -- the audit scans this file too.
    // The scheme is joined on separately: the audit flags this very file if
    // "postgresql://user:<anything 12+ chars>@" ever appears contiguously, a
    // template placeholder included.
    const neonPassword = ["npg", "Zq81LkPw3tYv"].join("_");
    const realUrl = ["postgresql", `//neondb_owner:${neonPassword}@ep-quiet-sky-a1b2c3.eu-central-1.aws.neon.tech/neondb?sslmode=require`].join(":");
    ok("a real-looking Neon connection string is flagged", secretFindings(`DATABASE_URL=${realUrl}`, "x").length > 0);
    ok("a bare Neon password is flagged", secretFindings(`password = ${neonPassword}`, "x").length > 0);
    ok("a secret inside a comment is still flagged", secretFindings(`// ${realUrl}`, "x").length > 0);
    ok("the .env.example placeholder is not flagged", secretFindings(fs.readFileSync(path.join(rootDir, ".env.example"), "utf8"), ".env.example").length === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
