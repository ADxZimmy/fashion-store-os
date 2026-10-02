// Applies pending db/migrations to Neon. Runs as part of the Vercel build
// (vercel.json buildCommand) so a production deploy can never go live ahead of
// the schema it needs, and nobody has to remember a manual step. Safe to run
// repeatedly: each file is recorded once applied and skipped afterwards.
//
//   npm run db:migrate                 # locally, with DATABASE_URL set
//   (automatic)                        # every production deploy on Vercel
//
// Preview deploys are skipped by default: unless the Vercel Neon integration
// is set to give each preview its own database branch, previews share the
// production DATABASE_URL, and a preview build must not change the production
// schema. Set DB_MIGRATE_ON_PREVIEW=1 once previews have their own branches.
const { databaseSummary, driver } = require("../api/_db");
const { migrate } = require("../api/_migrate");

async function main() {
  const onVercel = Boolean(process.env.VERCEL);
  const environment = process.env.VERCEL_ENV || "local";

  if (onVercel && environment !== "production" && process.env.DB_MIGRATE_ON_PREVIEW !== "1") {
    console.log(`db-migrate: skipped on ${environment} build (production schema is migrated by production deploys only).`);
    return;
  }

  const summary = databaseSummary();
  if (!summary.configured) {
    // On a production build this must fail: the deployment cannot serve sign-in
    // without a database, and a failed build keeps the previous deployment live.
    console.error(`db-migrate: ${summary.error}. Add Neon to the Vercel project (Storage tab) so DATABASE_URL is set, then redeploy.`);
    process.exitCode = 1;
    return;
  }

  console.log(`db-migrate: ${environment} database at ${summary.host}`);
  const result = await migrate(driver, { log: (line) => console.log(`db-migrate: ${line}`) });
  console.log(
    result.applied.length
      ? `db-migrate: applied ${result.applied.length} of ${result.total} migrations.`
      : `db-migrate: schema up to date (${result.total} migrations).`,
  );
}

main().catch((error) => {
  // Connection strings never reach the log: errors from the driver are
  // classified in api/_db.js and carry only a public message and a cause.
  console.error(`db-migrate: failed. ${error.publicMessage || error.message}`);
  process.exitCode = 1;
});
