# Verification

## Automated Checks

- Command: `npm.cmd run check`
  Result: Passed.
  Notes: Re-ran after adding hash links and Vercel build files.
- Command: `npm.cmd run build`
  Result: Passed.
  Notes: `scripts/build-static.js` wrote `dist/`.
- Command: Static dist privacy check
  Result: Passed.
  Notes: `dist/` contains only `index.html`, `src/`, and required JPG assets; handover, planning, prompt/PPTX docs, backend files, and runtime data are excluded.
- Command: `Invoke-WebRequest http://127.0.0.1:4180/`
  Result: Passed.
  Notes: Returned `200` from the local static build.
- Command: `Invoke-WebRequest http://127.0.0.1:4180/handover.md`
  Result: Passed.
  Notes: Returned `404`, confirming handover is not in static output.
- Command: `vercel deploy --yes --prod`
  Result: Passed.
  Notes: Completed after Vercel CLI device login. Production alias: `https://fashion-store-os.vercel.app`.
- Command: `vercel inspect https://fashion-store-os.vercel.app`
  Result: Passed.
  Notes: Deployment `dpl_5Gcn14bTDQ8MLRFjFnaqjjXcLLmP` is READY.
- Command: `Invoke-WebRequest https://fashion-store-os.vercel.app`
  Result: Passed.
  Notes: Returned `200`.
- Command: `Invoke-WebRequest https://fashion-store-os.vercel.app/handover.md`
  Result: Passed.
  Notes: Returned `404`, confirming handover is not public.

## Browser Checks

- Check: In-app browser smoke test at `http://localhost:4181/#orders`
  Result: Passed.
  Notes: Static build completed manager signup and business setup, then opened the Garment Orders view with the `#orders` URL and no browser console errors.

## Residual Risk

- Risk: Vercel static deployment uses browser storage fallback, not shared server storage.
  Owner: Production backend/database phase.
