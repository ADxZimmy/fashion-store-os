# Context

## Goal

Add an operational reports workspace that turns existing records into useful studio intelligence: conversion, revenue, production pressure, stock alerts, reply drafts, quote drafts, and estimate-learning notes.

## Relevant Files

- Path: `src/app.js`
  Why it matters: Contains all data models, navigation, renderers, and derived calculations.
- Path: `src/styles.css`
  Why it matters: Reports must fit the existing dense dashboard style and small-phone layout.

## Decisions

- Decision: Use deterministic rule-based "AI-style" drafts in this phase.
  Reason: The product gains useful intelligence without adding external AI credentials or persistence risk.
- Decision: Add Reports as a first-class nav item.
  Reason: Dashboard metrics already reference a reports destination.

## Risks

- Risk: Reports can become visually noisy on phones.
  Mitigation: Use dense panels, wrapping grids, stable touch targets, and small-screen verification.
