# UAT

## Scenario 1: Static Hosted App Loads

Given the project is deployed to Vercel from `main`,
when a reviewer opens the production URL,
then the app loads without needing `node server.js`.

## Scenario 2: Section Link Opens

Given the app is deployed,
when a reviewer opens `/#orders`,
then the app preserves that section target after sign-in/setup and uses the Orders view when accessible.

## Scenario 3: Browser Storage Fallback Is Honest

Given the Vercel deployment has no durable database yet,
when the app checks `/api/bootstrap`,
then it should continue with browser storage fallback rather than presenting JSON-file storage as production-safe.

## Scenario 4: Private Files Are Not Public

Given the static build is deployed,
when a reviewer tries to open handover, planning, prompt, backend, or runtime data files,
then those files should not be available from the public deployment.

