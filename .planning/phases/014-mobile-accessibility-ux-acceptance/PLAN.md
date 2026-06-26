# Plan

## Outcome

The project has a repeatable mobile/accessibility acceptance gate and CSS/HTML rules that support drawer navigation, visible focus, live feedback, reduced motion, safe touch targets, and narrow-screen no-overflow.

## Scope

Included:

- Toast live-region hardening.
- Touch target and motion CSS fixes.
- Static UX audit script and package command.
- UAT checklist for phone and desktop widths.

Excluded:

- Paid device-lab testing.
- Screen-reader transcript capture.

## Steps

1. Add accessible live-region attributes to the toast.
2. Harden CSS for touch targets, overscroll, and reduced motion.
3. Add `scripts/ux-audit.js` and `npm.cmd run ux:audit`.
4. Record verification results.

## Verification

- Check: `npm.cmd run ux:audit`
  Expected: Passes and confirms the required mobile/accessibility gates.

## Rollback

Remove the audit script/package command and revert the CSS/HTML changes.
