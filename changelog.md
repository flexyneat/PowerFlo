# Changelog

## Unreleased

- Render fresh confirmed grid disconnection in red, with a static red X on the image-safe desktop connector lane; hide the marker for unknown/stale/reconnected states.
- Fix demo sun/moon switching by toggling SVG hidden attributes rather than an HTMLElement-only property.
- Add regressions for marker geometry/state transitions and ensure demo-only selectors are absent from the installed card.
- Document demo-only controls and the configurable disconnect color; retain all runtime, forecast, statistics, transparency and read-only behavior.

## 0.3.0 — source update

- Use integration-independent metadata and neutral identity defaults; retain editable ratings and battery forecast behavior.
- Add installed solar-array nameplate size without altering measured production.
- Distinguish disconnected, unknown and stale grid states; stop grid flow and suppress misleading retained readings during disconnection.
- Add grid-state controls and system customization to the offline demo.
- Add an Off-Grid outage preset and an accessible sun/moon toggle with system-first appearance to the demo.
- Include MIT notices in exported HTML and production JavaScript.
- Rewrite installation/configuration documentation and remove internal planning, log and graph artifacts from the current repository tree.

## 0.2.1

- Balance battery SOC/power and keep target/full estimates visible together.
- Preserve runtime, milestones and confidence in Battery details.
- Add recent-load trend, time-weighted average, peak, coverage and independent retry.
- Separate a reached lower goal from the full projection.

## 0.2.0

- Add illustrated reversible flows, freshness gating and transparent presentation.
- Add editable identity/image, clock/polarity, runtime and modeled charging milestones.
- Add Today Recorder history, Week/Month statistics and accessible inspection.

Source changes do not replace previously published release assets. Offline export and clarified reserve wording were added between 0.2.1 and 0.3.0.
