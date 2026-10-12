# PowerFlo

> Early implementation. Manual source-build installation is available. No GitHub remote or release is published yet; HACS distribution is not ready. Home Assistant 2026.10 is the intended commissioning environment, with live compatibility still to be validated.

PowerFlo is a read-only, live power-flow card for Home Assistant. Its configurable default display profile targets the Deye `SUN-12K-SG02LP1-EU-AM3` with a 32.14 kWh battery bank. The card reads existing Home Assistant entities and Recorder history; install and commission the inverter gateway separately.

![PowerFlo reference-led redesign](assets/current-design.png)

*Rendered implementation with explicitly simulated telemetry, not a commissioned Home Assistant screenshot. Display surfaces are transparent.*

## Current status

PowerFlo is an early implementation. The state engine, reversible flow model, charge/discharge estimates, Today/Week/Month history, visual editor, responsive card shell, and unit tests exist. Live Deye commissioning and a tagged HACS release remain open. Simulated browser checks cover period switching, forecast labels, transparent themes, keyboard focus, and narrow layouts; these do not replace live Home Assistant validation.

## Safety boundary

PowerFlo reads Home Assistant entities. It does not connect to Modbus, call Home Assistant services, or write inverter settings.

## Features

- Dynamic `Static`, `Charging`, and `Discharging` battery status.
- Smoothed runtime to a configurable reserve SOC, with explainable estimate confidence.
- Solar-aware Time-to-Full/Target and 50%, 75%, and 95% milestones, using measured net charge and configurable assumed high-SOC taper.
- Configurable battery and grid sign conventions.
- Reversible solar, grid, battery, and load arrows driven by current power state.
- Freshness-gated transform-only flow particles.
- Rounded, image-safe routes with small reversible directional chevrons; default endpoints align to the visible enclosure, not transparent image padding. Uploaded art uses conservative full-image bounds.
- State-aware illustrations sit above a connected milestone rail, with runtime separate; narrow layouts use a two-column milestone group. Energy summaries remain icon-free.
- Solar, Grid, Load, and Battery energy histories with Today, Week, and Month views; Week/Month use validated long-term statistics.
- Shared pointer, touch, and keyboard chart inspection with actual observation timestamps.
- Editable title, inverter identity, ratings, clock format, and safe local raster image upload.
- 12-column Sections compatibility through `getGridOptions()`.
- Dark/light theme variables, narrow-card layout, and reduced-motion behavior.
- Plain JavaScript and JSDoc; no TypeScript toolchain.

## Transparent theme support

The outer card, inverter panel, flow nodes, and Today summaries have transparent backgrounds and no outer shadow. Your dashboard background or wallpaper shows through every panel. Text and borders use Home Assistant's `primary-text-color`, `secondary-text-color`, `divider-color`, and card border/radius variables, including custom themes. Flow colors retain their domain meaning. Uploaded inverter images retain their original background; use a transparent PNG or WebP for an image that blends into the dashboard.

## Required entities

| Mapping | Purpose |
|---|---|
| `freshness` | Boolean entity that is on/fresh while fast Modbus telemetry is current |
| `inverter_status` | Readable inverter status text from the integration |
| `grid_connected` | Boolean grid connection state |
| `solar_power` | Aggregate PV power in watts |
| `battery_soc` | Battery state of charge in percent |
| `battery_power` | Signed battery power in watts |
| `grid_power` | Signed grid power in watts |
| `load_power` | Protected-load power in watts |

PV channel values, voltage, temperature, frequency, and Today energy entities are recommended but optional.

## Installation

### Prerequisites

- A working Home Assistant instance and permission to manage dashboard resources.
- An inverter integration exposing all eight required mappings above, with power in **W** and SOC in **%**.
- A trustworthy freshness entity that switches off when telemetry stops. Do not substitute an always-on helper.
- Recorder enabled for daily-energy entities if you want historical sparklines.
- Node.js **22 or newer** and npm on your development computer to build PowerFlo. Node is not required on the Home Assistant server.

HACS is not required for manual installation. Live updates arrive when Home Assistant receives new entity values; the card does not increase your gateway's polling rate.

### 1. Build the installable bundle

From this project's local checkout:

```bash
cd /path/to/PowerFlo
npm ci
npm run verify
```

This runs lint, tests with coverage, and the production build. Install **both** `dist/powerflo-card.js` and `dist/inverter-reference.png` in the same folder. The image is a generated transparent illustration based on the supplied design reference, not a manufacturer product photograph. Copy the built outputs rather than the individual `src/` files. The source map is optional.

### 2. Copy the bundle into Home Assistant

Use your usual file-management method to create `www/powerflo/` inside the active Home Assistant configuration directory, then copy the built JavaScript there:

```text
<configuration directory>/
└── www/
    └── powerflo/
        ├── powerflo-card.js
        └── inverter-reference.png
```

On Home Assistant OS this is commonly `/config/www/powerflo/`. On a Container installation, use the host directory mounted as `/config`.

Files under `www/` are served at `/local/`. If you create `www/` for the first time, restart Home Assistant so it recognizes the directory. See the official [custom-card documentation](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/).

### 3. Register the dashboard resource

For a dashboard managed through the UI:

1. Enable **Advanced mode** in your Home Assistant profile if Resources is hidden.
2. Open **Settings → Dashboards** and find **Resources** in the menu.
3. Add `/local/powerflo/powerflo-card.js?v=0.1.0` with type **JavaScript module**.
4. Save and reload the browser/dashboard.

For an existing YAML-managed dashboard resource configuration, merge this entry into your `lovelace.resources` list instead:

```yaml
lovelace:
  mode: yaml
  resources:
    - url: /local/powerflo/powerflo-card.js?v=0.1.0
      type: module
```

Use one registration method and avoid duplicates. Do not switch a UI dashboard to YAML mode just to install the card. Official guidance: [registering resources](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources/).

### 4. Add and configure the card

Edit your dashboard, add a **Manual** card, and paste the configuration in the next section. Replace the example IDs with your actual entities from **Developer tools → States**.

All eight required mappings must be present. The empty starter configuration produces validation errors, so start with a Manual card. Once valid mappings are saved, the visual editor lets you change labels, capacities, images, clock format, flow behavior, and entity IDs.

### 5. Verify the live readings

Compare PowerFlo with Developer tools and the inverter display:

1. Confirm input power is in **W**, energy is in **kWh**, and temperature is in **°C**. PowerFlo does not inspect units or convert kW/Wh inputs.
2. Observe battery charging and discharging, then set `battery_positive` to match the signed power sensor.
3. Observe grid import/export, then set `grid_positive` accordingly.
4. Verify freshness switches off when telemetry stops and flow animation pauses.
5. Confirm your load mapping represents the protected-load output you intend to display.

### HACS installation status

HACS installation is not available yet. The repository has no published remote/release, and `dist/` is generated locally and excluded from Git. Before HACS distribution, the maintainer must publish an accessible repository, supply its built JavaScript in a supported distribution location, validate metadata/filename requirements, and test installation. See [HACS dashboard publishing requirements](https://www.hacs.xyz/docs/publish/plugin/).

## Development

```bash
npm ci
npm run verify
```

The build writes `dist/powerflo-card.js` and its source map.

## Minimal card configuration

Use Home Assistant's dashboard editor or resource API; never edit `.storage` directly.

```yaml
type: custom:powerflo-card
title: Deye Energy
inverter_name: DEYE
inverter_model: SUN-12K-SG02LP1-EU-AM3
inverter_capacity_kw: 12
battery_capacity_kwh: 32.14
clock_format: "12"
battery_positive: discharge
grid_positive: import
battery_reserve_soc: 20
runtime_window_minutes: 5
runtime_max_sample_age_seconds: 60
entities:
  freshness: binary_sensor.deye_modbus_flow_fresh
  inverter_status: sensor.deye_running_status
  grid_connected: binary_sensor.deye_grid_connected
  solar_power: sensor.deye_pv_power
  battery_soc: sensor.deye_battery_soc
  battery_power: sensor.deye_battery_power
  grid_power: sensor.deye_grid_power
  load_power: sensor.deye_inverter_output_power
```

Entity IDs above illustrate the required shape. Select the actual entities created by the commissioned gateway.

## Complete entity configuration

Use this example when the optional readings and daily counters exist. Omit optional mappings you do not have.

```yaml
type: custom:powerflo-card
title: Home energy
inverter_name: DEYE
inverter_model: SUN-12K-SG02LP1-EU-AM3
inverter_capacity_kw: 12
battery_capacity_kwh: 32.14
clock_format: "12"
flow_threshold_w: 40
flow_release_w: 20
battery_positive: discharge
grid_positive: import
entities:
  freshness: binary_sensor.deye_modbus_flow_fresh
  inverter_status: sensor.deye_running_status
  grid_connected: binary_sensor.deye_grid_connected
  solar_power: sensor.deye_pv_power
  pv1_power: sensor.deye_pv1_power
  pv2_power: sensor.deye_pv2_power
  pv3_power: sensor.deye_pv3_power
  battery_soc: sensor.deye_battery_soc
  battery_power: sensor.deye_battery_power
  battery_voltage: sensor.deye_battery_voltage
  battery_temperature: sensor.deye_battery_temperature
  grid_power: sensor.deye_grid_power
  grid_voltage: sensor.deye_grid_voltage
  grid_frequency: sensor.deye_grid_frequency
  load_power: sensor.deye_inverter_output_power
  solar_today: sensor.deye_solar_energy_today
  grid_today: sensor.deye_grid_import_energy_today
  load_today: sensor.deye_load_energy_today
  battery_today: sensor.deye_battery_discharge_energy_today
```

| Optional mapping | Unit | Meaning |
|---|---|---|
| `pv1_power`, `pv2_power`, `pv3_power` | W | Individual MPPT/channel power. |
| `battery_voltage` | V | Battery-bank voltage. |
| `battery_temperature` | °C | Reported battery temperature. |
| `grid_voltage` | V | Grid voltage. |
| `grid_frequency` | Hz | Grid frequency. |
| `solar_today` | kWh | Today's solar production energy. |
| `grid_today` | kWh | Selected daily grid counter, normally import. |
| `load_today` | kWh | Selected daily load counter. |
| `battery_today` | kWh | Selected daily battery counter, normally discharge. |

The card displays the counters you map; it does not calculate energy from power or combine charging/discharging totals. Choose daily-reset counters and document your selected grid/battery meanings. Missing optional numeric readings display `—`. The summary labels are fixed.

The inverter-status entity must contain readable text; raw register codes are not translated by PowerFlo. The card does not itself verify the integration's register map.

Boolean mappings accept `on`, `true`, `connected`, `1`, `yes`, or `fresh` as true, and `off`, `false`, `disconnected`, `0`, `no`, or `stale` as false, case-insensitively. Missing, unrecognized, unknown, or unavailable values are unavailable. For freshness, false produces **Stale**, and unavailable produces **Unavailable**; both stop flow motion.

## Customization

| Setting | Default | Accepted values / purpose |
|---|---|---|
| `title` | `Deye Energy` | Text, up to 60 characters. |
| `inverter_name` | `DEYE` | Text, up to 40 characters. |
| `inverter_model` | `SUN-12K-SG02LP1-EU-AM3` | Text, up to 80 characters. |
| `inverter_capacity_kw` | `12` | 0.1–1,000 kW; display metadata. |
| `battery_capacity_kwh` | `32.14` | 0.1–10,000 kWh; display metadata. |
| `inverter_image` | Empty | Built-in illustration when empty; supported local path or raster data URL otherwise. |
| `clock_format` | `"12"` | `"12"` for AM/PM or `"24"`; Home Assistant timezone. |
| `battery_positive` | `discharge` | `discharge` or `charge`: meaning of positive battery power. |
| `grid_positive` | `import` | `import` or `export`: meaning of positive grid power. |
| `flow_threshold_w` | `40` | Activation threshold, 1–5,000 W. |
| `flow_release_w` | `20` | Battery/grid release threshold, between 0 and the activation threshold. |
| `battery_reserve_soc` | `20` | Runtime stopping point, 0–100%. Does not change inverter settings. |
| `battery_charge_target_soc` | `100` | Time-to-Full target, 1–100%; lower targets change the displayed label. |
| `runtime_window_minutes` | `5` | Discharge averaging window, 1–60 minutes. |
| `runtime_max_sample_age_seconds` | `60` | Maximum power sample age/gap, 5–300 seconds; choose to suit gateway polling. |
| `charge_taper_start_soc` | `90` | Assumed taper start, 50–99% SOC. |
| `charge_taper_floor_ratio` | `0.2` | Assumed charge-power ratio at full SOC, 0.05–1. |
| `solar_projection_hours` | `4` | Future solar-supply horizon, 0–24 hours, capped at sunset when available. |

With `battery_positive: discharge`, +512 W means discharging and −512 W means charging. With `grid_positive: import`, positive power means grid → inverter; negative means inverter → grid. Arrowheads and moving particles follow these derived directions on the wide layout. Solar flows toward the inverter while producing; protected load flows away from it while powered.

Battery/grid hysteresis keeps an active direction until power magnitude falls below the release threshold, reducing flicker near zero. Solar/load use the activation threshold only. **Static** means no significant flow under the configured thresholds, rather than necessarily exactly zero watts.

### Inverter image

The visual editor's **Upload inverter image** accepts PNG, JPEG, or WebP up to **2 MB**, with dimensions no greater than **4096 × 4096**. It embeds the selected file as a data URL in the card configuration; it does not create a server-side image file.

Alternatively, copy a raster image into `www/powerflo/` and configure:

```yaml
inverter_image: /local/powerflo/inverter.png
```

Existing `/api/image/serve/` paths are also accepted. Remote image URLs and SVG uploads are not accepted. Use transparent PNG/WebP art to preserve the background. Do not place secrets in `www/`; Home Assistant serves `/local/` files without authentication.

### Battery expansion

Update `battery_capacity_kwh` when installed capacity changes. Capacity is manually configured, not discovered from the BMS. This version displays one aggregate bank; separate battery modules, module SOC, and balancing are not represented. Confirm your integration still exposes aggregate bank readings after expansion.

### Responsive layouts

The card implements both masonry sizing and Sections grid sizing. Use a wide card/section for the full topology. Below **58 rem of card-container width**, connectors and particles are hidden and nodes rearrange; below **34 rem**, nodes stack. Narrow layouts still display live values, both battery forecasts, and period selectors, but currently do not show directional arrows. On wide layouts, connector endpoints are measured from actual panel edges so arrows stay aligned after layout changes.

## Battery runtime estimate

The battery outlook strip displays **Runtime to reserve** and its basis, for example `To 20% reserve · 512 W recent average`. This is time to the selected reserve at recent battery discharge, not guaranteed outage duration or time to zero SOC.

```text
Energy remaining (kWh) = capacity_kWh × max(SOC − reserve_SOC, 0) / 100
Runtime (hours)        = energy_remaining_kWh / (average_discharge_W / 1000)
```

Discharge power is averaged by elapsed time using the battery entity's `last_reported` timestamp when exposed to the frontend, otherwise `last_updated`, and a rolling five-minute window by default. Each sample is held until the next sample; unrelated HA updates do not count as new observations. At least 30 seconds of continuous discharge observation is required. Samples collect while the card is loaded; reopening the card starts a new window. Recorder backfill and learned effective capacity are not implemented.

The estimator uses the configured `battery_capacity_kwh`. Keep this aligned with effective bank capacity across the SOC scale; do not deduct reserve twice by supplying capacity already reduced for that reserve. Battery-side power already reflects DC draw for the actual inverter operation, so an extra inverter-efficiency factor is not applied to runtime.

For an illustrative 32.14 kWh bank at 85% SOC, with 20% reserve and 512 W average discharge: remaining energy is 20.891 kWh and runtime is approximately **40 h 48 min**. Actual time varies with loads, solar contribution, battery ageing, temperature, BMS limits, and SOC accuracy. Solar assistance can extend this estimate; it is not a separate no-solar backup forecast.

Lifecycle states are explicit:

- **Collecting discharge data** while the window warms up.
- **Charging** or **Not discharging** when a depletion estimate is inappropriate.
- **Reserve reached** at/below reserve during discharge.
- **Unavailable** for stale gateway data, invalid SOC/power, absent timestamps, or power samples older than the configured maximum age.

Charging, static operation, stale data, configuration changes, and excessive sample gaps reset the discharge window. A timer checks sample age even when HA stops sending updates. Set the maximum age longer than the normal telemetry interval, with a reasonable margin; the default suits polling faster than one minute. This checks the power entity's age in addition to the existing gateway freshness mapping. If an integration suppresses identical power states and exposes no refreshed report timestamp, a stable reading can become unavailable here; confirm timestamp behavior during commissioning rather than replacing timestamps with unrelated dashboard updates.

Edit reserve and averaging settings in the visual editor under **Flow behavior**, or use the YAML keys in the configuration table. Choose reserve for the meaning you want to show; match it to an actual off-grid limit or a higher preferred margin. The card never writes the inverter's shutdown/TOU configuration.

## Time-to-Full

The battery outlook strip shows charging milestones for **50%, 75%, 95%**, and **full** (or your configured `battery_charge_target_soc`). A milestone already reached is labelled **Target reached**. Otherwise the model combines the independent recent net-charge average with solar-source and SOC-taper assumptions. It is an estimate, not a guaranteed completion time.

While charging, the estimator uses **battery-side net charging power**, normalized using `battery_positive`, and a time-weighted charging average separate from the discharge window:

```text
Energy needed (kWh) = effective_capacity_kWh × max(target_SOC − SOC, 0) / 100
Time to target (h)  = energy_needed_kWh / (average_net_charge_W / 1000)
```

The default target is 100%. At 85% SOC, 32.14 kWh capacity, and 2 kW net charging, the constant-rate estimate to 100% is **2 h 24 min**. This assumes the same charging rate continues and is not a forecast of taper completion. A lower target is display-only and does not configure the inverter's charging target.

Net battery input power should not be confused with gross PV generation or grid import: household demand consumes part of those inputs. If using net battery-side power, avoid multiplying by inverter conversion efficiency again. A calibrated battery energy-retention factor could be added if measurements show a systematic charge-side bias.

Near full, BMS limits, balancing, and taper can extend the time. The implemented model reduces future charge power linearly above `charge_taper_start_soc` (default 90%), reaching `charge_taper_floor_ratio` (default 0.2 of the untapered rate) at 100%. These are configurable scenario assumptions, **not verified Pylontech/Fidus specifications**. Future taper is normalized to the current SOC factor so observed taper is not applied twice. The model integrates energy across 0.25%-SOC steps:

```text
Time to target (h) ≈ Σ [effective_capacity_kWh × SOC_band_width / 100
                        ÷ expected_net_charge_kW_in_that_band]
```

Net battery charge already includes PV and loads; the card never adds gross solar power to it again. For future supply it approximates the current solar fraction as `solar_power / (solar_power + grid_import_power)`, then applies that fraction to measured net charge. This proportion is not a measurement of routed PV energy.

Current solar is assumed available for `solar_projection_hours` (default four hours), capped at `sun.sun`'s next sunset when available. Below the horizon, solar availability is zero. After the horizon only the modeled non-solar share remains. If supply cannot reach a target within the supported seven-day projection, the label is **Needs more solar**, not infinity.

Optionally map `entities.solar_forecast_power` to a sensor whose value is expected **average PV power in W over the configured horizon**. Reports up to one hour old are accepted; forecast declines reduce supply, while increases above current supply are conservatively ignored. Do not map energy in kWh, peak power, or an unrelated forecast interval. Creating/validating that sensor is outside the card's scope.

```yaml
charge_taper_start_soc: 90
charge_taper_floor_ratio: 0.2
solar_projection_hours: 4
entities:
  # Merge with the required existing entity mappings:
  solar_forecast_power: sensor.expected_average_pv_power_next_4_hours
```

Current states also include **Collecting charge data**, **Not charging**, **Target reached**, and **Unavailable**. Inactive/stale/reversed sessions reset the charge window. Learned battery-specific taper and future household-load prediction are not implemented. The 2 h 24 min constant-rate example above is a baseline comparison; the solar/taper model can show a longer duration.

### Estimate confidence

**High**, **Moderate**, and **Limited** describe data quality, not calibrated probabilities. Confidence considers observation duration, sample count/age, and time-weighted rate variability. High needs at least 80% of the configured window, three samples, variation below 15%, and age at most 15 seconds. Moderate needs 60 seconds observed, variation below 35%, and age at most 30 seconds. Other ready estimates are Limited.

Solar/taper estimates are capped at Moderate because future assumptions are uncalibrated; missing current solar data caps them at Limited. Expand **Estimate confidence and assumptions** for the basis. Inactive estimates have no confidence label.

## Recorder history behavior

Use the **Today / Week / Month** buttons to change all four summary graphs together. The live topology and forecasts remain current, independent of the selected period.

| View | Range in Home Assistant's timezone | Displayed energy |
|---|---|---|
| Today | Local midnight to now | Current daily energy counter, with its recorded trend. |
| Week | Six preceding local days plus today | Cumulative hourly long-term energy changes. |
| Month | First local day of the current month to now | Cumulative hourly long-term energy changes. |

Today reads Recorder history and current `*_today` entities. Week/Month use **long-term statistics**, requesting hourly `change` values in **kWh** through the authenticated WebSocket API. HA's accumulated statistics handle counter resets; the card no longer reconstructs Week/Month energy by summing raw daily maxima.

Supply optional `statistics` mappings to energy statistics with `has_sum` support. If omitted, the card tries the corresponding `*_today` entity's statistic ID and validates its metadata. No statistics are created or modified:

```yaml
statistics:
  solar: sensor.deye_solar_energy_total
  grid: sensor.deye_grid_import_energy_total
  load: sensor.deye_load_energy_total
  battery: sensor.deye_battery_discharge_energy_total
```

These are examples. Check **Developer tools → Statistics** for actual IDs. Missing or non-energy sum statistics show **Energy statistics not configured**; mean power/SOC cannot substitute for energy.

Only completed hours are included; the unfinished hour is not extrapolated. Summaries say **Statistics through [time]**. Missing/invalid/negative changes and intervals are marked **Partial**; duplicates are ignored. Totals depend on upstream statistics correctness and are not billing guarantees. All graphs use fixed axes; missing history is never fabricated.

Ensure Today sensors are recorded. Week/Month use retained hourly long-term statistics, so 35-day raw-history retention is not required for those views. Statistics never collected or deleted cannot be recovered by the card. See [Recorder](https://www.home-assistant.io/integrations/recorder/) and [long-term statistics requirements](https://developers.home-assistant.io/docs/core/entity/sensor/#long-term-statistics).

At least two numeric points are needed for a line. Period/hour requests are cached with stale responses ignored. Live counters extend Today only, avoiding double counting in Week/Month statistics. Date/hour rollover is checked every minute and on HA updates. Today waits for a current-day counter timestamp after midnight.

Loading is announced, history failures expose a **Retry history** button, and unmapped sensors display **Map an energy entity**. Live Home Assistant history performance and midnight rollover remain commissioning tasks.

### Interactive inspection

Move over a graph, drag/touch it, or use **Inspect recorded time**. The slider supports keyboard arrows and visible focus. All charts share the selected time; each readout shows the nearest recorded value and its own timestamp, rather than an interpolated fabricated measurement. Missing series show **No sample**.

## Updates and removal

To update, build with `npm ci` and `npm run verify`, replace both installed JavaScript and image, and change the resource query string to a fresh cache key, such as `?v=0.1.0-local2`. Reload the browser and refresh the companion app's frontend cache if needed.

To remove PowerFlo, remove its cards, resource registration, installed JavaScript, and any images you no longer use. The inverter integration and entities remain independent of the card.

## Troubleshooting

| Symptom | Check |
|---|---|
| `Custom element doesn't exist: powerflo-card` | Open the resource URL. Confirm the bundle exists, is JavaScript, and is registered as a module. Reload with a new cache key. |
| Resource returns 404 | Verify the active config directory and `www/powerflo/` path; restart HA if `www/` was just created. |
| `Missing required entity` | Supply all eight mappings using the Manual card editor. |
| Reading shows `—` | Check the entity ID and numeric state in Developer tools. |
| Battery or grid direction is reversed | Correct `battery_positive` or `grid_positive` using real signed readings. |
| Status unavailable or motion paused | Check freshness, power sensor availability, thresholds, reduced motion, and whether the card/tab is visible. |
| Values differ by a factor of 1,000 | Inputs must be W and kWh. Convert kW/Wh upstream. |
| No arrows on a phone | The current layout hides connectors below 58 rem. Use a wider card for topology. |
| Week/Month reports partial coverage | Check collected long-term energy statistics and missing hours. Raw-history retention cannot restore missing statistics. |
| Energy statistics not configured | Map an energy statistic with sum support using the visual editor or `statistics`. |
| Time-to-Full is unavailable | Check net charge power, SOC, freshness and sensor timestamps; allow 30 seconds after charging starts. |
| Today total works but no graph | Check optional daily mappings, Recorder history, and availability of two numeric points. |
| Image missing | Check supported type, size, dimensions, local URL, and file existence. |
| Background visible except behind artwork | The selected image may be opaque; use transparent PNG/WebP. |

For issue reports, include Home Assistant/browser versions, PowerFlo commit, sanitized configuration, entity units/states, and browser console errors. Never share tokens or credentials.

## Developer commands and fixture

| Command | Purpose |
|---|---|
| `npm run build` | Generate the browser bundle and source map. |
| `npm run dev` | Watch source changes and rebuild. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run unit tests. |
| `npm run test:coverage` | Check core-module coverage. |
| `npm run verify` | Run lint, coverage, and build. |

After building, serve the repository root with a local HTTP server. If Python is installed:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/demo/`. The fixture uses simulated values; it is not connected to an inverter.

```text
src/                 Card, editor, tokens, state, flow, history
test/                Core unit tests
demo/                Simulated browser fixture
assets/              Design mockup
dist/                Generated bundle, excluded from Git
graphify-out/         Code graph and extraction state
.github/workflows/    Verification configuration
PRD.md               Product scope
DESIGN.md            Design decisions
Task Checklist.md    Acceptance work
task-status.md        Progress
changelog.md          Changes
chatlog.md            Engineering record
```

See [SECURITY.md](SECURITY.md) for the read-only implementation boundary and [Task Checklist.md](Task%20Checklist.md) for outstanding verification.

## Repository technology

1. The build system is Rollup 4.
2. The frontend is a standards-based Web Component.
3. The language is modern JavaScript with JSDoc.
4. There is no backend or database.
5. Authentication is inherited from the Home Assistant frontend.
6. There is no payment system.
7. Distribution is designed for HACS and Home Assistant dashboard resources.
8. Verification runs through GitHub Actions.
9. Unit tests use Vitest 5 with Happy DOM.
10. The production card has zero runtime package dependencies.

## License

MIT

## Refined display and interaction

PowerFlo inherits HA fonts; all display panels remain transparent. Large readings have smaller units. Topology icons share one SVG family; summaries have no icons. Runtime is separate from the connected charging milestones. Targets are sorted and duplicate SOC goals are collapsed. Completed milestones say `Reached`; the configured goal says `Target reached`.

Hover or touch graphs to inspect actual observations with a shared cursor, point markers and compact time/value tooltips. First touch pins inspection; keyboard arrows operate the native range control and Escape clears it. Missing statistics intervals split paths instead of inventing continuity. Period totals remain visible during inspection.

Text updates immediately. Limited opacity feedback lasts 160 ms, runs at most once per element per 30 seconds, and skips small numeric changes. Flow-speed changes preserve particle position. Stale, hidden and reduced-motion states stop animation work; mobile layouts without connectors stop invisible flow loops.

Theme authors may override `--powerflo-solar-color`, `--powerflo-grid-color`, `--powerflo-battery-color` and `--powerflo-load-color`. Recheck contrast against your actual background after overrides. No external font request was added.

See [VISUAL-REFINEMENTS.md](VISUAL-REFINEMENTS.md) for the six-part review and verification limits. Installation and forecast formulas remain unchanged. The dated reference stays fixed; `assets/current-design.png` is the simulated implementation preview.
