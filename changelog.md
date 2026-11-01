# Changelog

## Unreleased — grid evidence and demand intervals

- Add opt-in, labelled voltage/power grid-availability evidence, with explicit connection-signal precedence, fresh-input guards and suspected-outage distinction. Keep inferred events out of the confirmed-relay outage ledger.
- Draw complete bounded load intervals instead of only their start points; retain genuine gaps.
- Add configuration/editor support, source-freshness and conflict regression tests, and document inference limitations.

## Unreleased — quadrant boundaries and grid diagnostics

- Restore theme-native transparent borders around Solar, Battery, Grid and Protected load, with mobile text insets.
- Distinguish unknown grid connection from unavailable measurements and show reported voltage without inferring connection or starting grid flow.

## Unreleased — partial telemetry commissioning

- Allow missing inverter-status and grid-connection mappings so valid solar, battery and load telemetry can render without fabricated signals. Unknown grid connection pauses grid flow and remains explicitly unavailable.
- Preserve all card features and both estimates; add a regression test for omitted status mappings.

## Unreleased — gateway commissioning correction

- Correct omitted -100 °C temperature offset after ×0.1 for battery, AC and DC readings; retain exact-firmware comparison as an acceptance gate and do not rewrite old history.
- Expose existing load-power candidate by default, add isolated raw status59/relay194 diagnostics and seven per-channel response ages. Preserve strict freshness, native encrypted API/OTA and all read-only protections.
- No automatic flash, decoded grid/status assertion, power-polarity change, version bump or release.

## Unreleased — Waveshare sensor coverage

- Add optional AC/DC temperature, L2 register voltage, separate inverter output and explicitly unvalidated CT-candidate mappings without changing flow or runtime roles.
- Add separate daily battery-charge/grid-export and five lifetime energy snapshots inside System insights; retain report timestamps, unit validation and stale instantaneous states.
- Preserve all existing features, transparent surfaces, JavaScript-only read-only behavior and both battery estimates; update mapping documentation, tests and illustrative offline demo. No version bump or release.

## Unreleased — gateway recovery and local diagnostics

- Add password-protected fallback Wi-Fi after 90 seconds with a captive recovery portal; document its administrative firmware-upload boundary.
- Add local embedded v3 web diagnostics with Digest authentication, private secret placeholders, hidden internal entities and disabled web log streaming.
- Disable regular LAN web OTA; retain encrypted native API/OTA, safe mode, existing reboot behavior, UART/RS485 settings and read-only register map.
- Update setup/recovery/security documentation and commissioning regression tests. No device flashed, version bump or tagged release in this change.

## Unreleased — Precision refresh / Phase 3

- Refresh transparent layout with quieter typography, open zones, compact mobile artwork and caption-safe lower flow routes; preserve all existing features and both visible battery estimates.
- Add lazy read-only HA Energy solar source selection, interval normalization, measured/forecast overlay, Today/Tomorrow inspection, coverage/provenance and contextual hourly weather.
- Preserve baseline charge/runtime/readiness logic; weather is not a second PV derating or an undisclosed battery-energy forecast.
- Add frozen qualified charge/reserve outcomes and separate 30-minute SOC feedback, censoring and bounded opt-in user/card-local retention. No auto-calibration or equipment writes.
- Update editor, edge-case regressions, simulated offline demo, README and commissioning notes. Keep 0.5.0 pending explicit release authorization.

## Unreleased — Phase 2

- Extend the existing readiness disclosure with outage energy availability, demand, margin and explicit unassessed power/surge capability; preserve assumptions and both battery estimates.
- Add an independent `preparedness_enabled` display preference that leaves the simulator available; retain the legacy readiness master switch.
- Add opt-in equivalent-period chart overlays/deltas using filtered Recorder and long-term statistics reads, bounded caching, cancellation, matched coverage and conservative calendar/DST handling.
- Add on-demand Grid insights with qualified live-session sustained-export observations and explicit standby measurement/manual-assumption provenance; never infer measured standby from AC/DC residuals.
- Preserve transparent surfaces, all existing features, JavaScript-only implementation and read-only equipment behavior. Update simulated offline export, configuration documentation and regression coverage.
- Keep package/release version at 0.5.0 pending explicit release authorization; development demos identify themselves as Phase 2 previews.

## 0.5.0

- Add compact conditional overnight readiness with HA-local/DST deadline, reserve shortfall and explicit manual/history/recent/current demand basis.
- Add ephemeral what-if load/capacity/reserve/deadline simulation without changing live configuration; preserve both Battery estimates.
- Add editor-only guided entity checks, sign confirmation and explicit review/save/cancel; preserve direct/YAML configuration.
- Extend model/lifecycle/UI tests and offline demo, using one simulated 16 kWh battery; explicitly label next-local-day deadlines as tomorrow.
- Publish updated installation files, standalone demo, README and Waveshare commissioning documentation; preserve all existing features and JavaScript-only read-only behavior.

## 0.4.1

- Confirm observed MAIN A028-1727 / HMI 0000-C382 / protocol 0201 identity in README, commissioning guide and read-only profile notes; distinguish identity confirmation from exact-register validation.
- Add firmware-evidence documentation regression test. Preserve existing decoding, units, polarity, freshness and unknown-state logic rather than apply unsupported firmware-specific overrides.

## 0.4.0

- Add read-only estimate bands, load runtime scenarios, guarded opt-in session taper learning, outage Recorder/live timeline, BMS current indicators, solar utilization, MPPT detail, indicative source mix, diagnostics/coverage and three density presets.
- Include reviewed Waveshare/Modbus HTML commissioning guide, read-only YAML and secrets template; correct UART direction control and document firmware/register-role validation gates.
- Align numeric timestamp reporting with native HA updates and require a core-register freshness quorum; avoid falsely aging transition-only binary/status flags.

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
