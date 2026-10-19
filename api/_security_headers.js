// Security headers for every response (Phase 021 step 6).
//
// vercel.json cannot import code, so production carries a literal copy of
// these in its "headers" block; scripts/test-local-first.js fails if the two
// ever differ. The local dev server applies this module directly, so local
// behaviour predicts production behaviour, including anything the policy
// blocks.
//
// What the policy is protecting: the shop's records live in this origin's
// IndexedDB and localStorage, and the session cookie is only HttpOnly, not
// unreachable. Script injection is the attack that matters, so script-src is
// the strict part: this origin only, no inline script, no eval. The app has
// none of those, which is why it can be this strict.
//
// Two deliberate allowances, each for something the app actually loads:
//   style-src 'unsafe-inline'  17 inline style attributes in rendered
//                              templates (spacing, progress-bar widths).
//                              Moving them into CSS classes would let this be
//                              dropped. Style injection is far weaker than
//                              script injection, and user content is escaped.
//   fonts.googleapis.com /     The @import in src/styles.css.
//   fonts.gstatic.com
//   img-src data:              Business logos are stored as data: URLs.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Legacy companion to frame-ancestors for browsers that predate it.
  "X-Frame-Options": "DENY",
  // Camera is deliberately not listed: phones offer the camera from the logo
  // file picker, and nothing here should get in the way of that.
  "Permissions-Policy": "geolocation=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// HTTPS-only, so production only. Sent over plain http to the dev server it
// would be ignored anyway, but leaving it out keeps the local set honest.
const PRODUCTION_ONLY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
};

module.exports = { CONTENT_SECURITY_POLICY, PRODUCTION_ONLY_HEADERS, SECURITY_HEADERS };
