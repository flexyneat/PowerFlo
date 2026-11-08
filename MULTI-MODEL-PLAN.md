# PowerFlo model profiles and service scale-up

Status: proposed roadmap, not implemented compatibility. Version: 2026-11-08.

## Scope and invariants

Preserve the existing JavaScript-only, transparent, read-only card, all features and both battery estimates. Keep per-battery-pack visibility excluded. Do not add register writes, cloud connectivity, new credentials or remote-control access as a side effect of selecting a profile. Keep existing manual HA entity configuration working as a custom profile.

## Separate three concerns

1. **Transport adapter:** ESPHome/RS485 RTU, Modbus TCP, existing HA entities, or an authorized vendor API. Account for bus ownership, logger contention and vendor API quotas; the Waveshare is one transport option, not a universal inverter interface.
2. **Device/firmware profile:** decode a documented register/API contract into canonical metrics. Firmware, phase count, HV/LV topology and logger protocol can require separate profiles within one model family.
3. **Site configuration and presentation:** installed battery/array capacity, roof planes, tariffs, reserves, sensor bindings and circuit scope. Customer values must not be baked into shared profiles.

Flow: device → adapter → validated canonical observations → local storage/analytics → PowerFlo card; optional outbound managed collector → tenant-isolated API → customer app, wall display and installer portal.

## Profile contract

Use declarative, schema-validated versioned JSON rather than executable downloaded profile code. Each profile records:

- Stable profile ID, semantic version, schema version, manufacturer, exact model list and hardware topology.
- MAIN/HMI/protocol firmware evidence and explicit supported/unknown ranges. Never guess broad version ranges.
- Source documents, revision/date, provenance and redistribution rights. Do not publish confidential manuals or customer captures.
- Transport parameters and address convention (zero-based protocol address versus printed register number), function code and read-only allowlist.
- Register width, signedness, word/byte order, scale, offset, sentinel values and expected units.
- Grid and battery sign conventions; independent import/export and charge/discharge canonical metrics.
- Measurement scope: grid/PCC, inverter output, protected/EPS load or whole-site load. Never substitute one silently.
- Phase and MPPT capabilities, optional battery capability, grid evidence source, fault/status decoding and reset behavior of energy counters.
- Freshness policy, realistic cadence, batching exclusions, timeout/backoff policy, missing-data behavior and diagnostics.
- Capability status and evidence per metric; a profile can be commissioned for basic energy yet unvalidated for relay state.
- Fixtures, commissioning evidence references, approval state, migration notes and rollback version.

Canonical metrics include PV power W; PV daily/lifetime energy Wh; battery SOC percent, voltage V, current A and temperature Celsius; charge/discharge power W; grid import/export power W and energy Wh; per-phase voltage/frequency; protected and whole-site load as distinct fields; inverter state/fault; utility availability and relay position as distinct concepts.

Each observation carries site/device/profile version, metric, value/unit, measurement scope, observed timestamp, received timestamp, quality (valid/stale/unavailable/unsupported/unvalidated), and provenance (measured/derived/inferred). Unknown values are null with a reason, not zero. Counter resets, rollover, timezone and late samples must have explicit handling. An inferred grid state is not a confirmed relay state.

The API may normalize energy to Wh while the current HA card continues accepting its existing W/kW and Wh/kWh/MWh entity units. Convert at a single tested boundary; never rescale twice.

## Rollout starting with Deye

| Stage | Deliverable | Acceptance gate |
|---|---|---|
| 1. Inventory | User-supplied first-batch model numbers and topology/firmware matrix | Exact nameplate and MAIN/HMI/protocol captured privately; no serial numbers in public profiles |
| 2. Current baseline | Explicit profile for the existing AM3 installation and current manual-entity compatibility path | Mark unresolved load/relay semantics unvalidated; no claim of universal AM3 support |
| 3. Deye families | Separate single/three-phase and LV/HV families, with firmware exceptions | Manufacturer evidence, decoding fixtures, offline tests and installer-supervised live comparisons |
| 4. Other makes | Solis and Growatt adapters/profiles, one selected family at a time | Obtain model-specific documents/API permission; no reuse of Deye addresses or cable pinouts |
| 5. Registry UX | Search by model/firmware, capability preview, explicit review/apply and rollback | Missing capabilities hide only dependent features; existing configuration migrates without lost features |
| 6. Pilot service | Background collection, reports, incidents, app and installer views | Multi-site isolation, offline recovery, operational support and monitored pilot acceptance |

For each candidate, test raw decode/endian/sign/scaling, plausible boundaries and sentinels, counter rollover/reset, unknown/stale data, phase aggregation and unsupported features. Compare PV, battery, grid and protected-load readings against LCD/reference measurements under several operating conditions. Validate natural grid loss/restoration without asking customers to interrupt mains. Finish a multi-day soak covering midnight counters, reconnects and day/night cycles. Promotion states: draft → lab-tested → field-validated → supported; retain metric-level qualifications even after profile promotion. Certification must not be implied.

Required first-batch intake: exact model/suffix, phase count, HV/LV, MAIN/HMI/protocol versions, logger/gateway model and intended transport, available manual/register-map revision, MPPT count, battery topology and monitored circuit scope. Store client identities and credentials outside the public repository.

## Persistent collection before paid monitoring

The frontend card cannot guarantee collection or alerts while closed. Add a separate local collector with a persistent bounded queue, original timestamps, sequence/idempotency keys, retry/backoff, clock-skew detection and gap reporting. Keep local display functional without internet. Cloud receipt timestamps must not replace measurement timestamps. Clearly distinguish utility outage, site-network loss, collector loss and cloud-service loss.

Use a single polling owner per physical bus; fan out normalized observations to consumers rather than letting every app independently poll the inverter. Do not expose Modbus or an unrestricted HA API directly to the internet. Never embed HA long-lived tokens or vendor secrets in a frontend bundle.

## Proposed infrastructure and API boundary

Start with one deployable ingestion/analytics service, not many microservices. Use a tenant/site/device registry, transactional configuration store, indexed time-series observations and scheduled rollups, and separate object storage for reports. Choose managed versus self-hosted deployment only after pilot volume, retention, jurisdiction and operating budget are known. Current card operation requires none of this infrastructure.

Proposed versioned contract (not existing endpoints):

- `GET /v1/profiles` and `GET /v1/profiles/{id}/versions/{version}`: vetted capabilities and profile metadata.
- `POST /v1/sites/{siteId}/observations:batch`: collector-only ingestion with bounded size, schema/unit validation, idempotency and timestamps.
- `GET /v1/sites/{siteId}/snapshot`: latest values with freshness/provenance, not silently cached live claims.
- `GET /v1/sites/{siteId}/series`: allowlisted metrics, bounded time range/resolution and explicit gaps/coverage.
- `GET /v1/sites/{siteId}/insights` and `/incidents`: evidence, assumptions, confidence and model version.
- Server-sent events or WebSocket subscriptions for live updates; signed webhooks with replay protection/retries for services.

Publish an OpenAPI contract, JSON Schemas and JavaScript client only after the canonical schema stabilizes. Use additive API changes and explicit deprecation/migration policy. Begin read-only with no control endpoints.

Use per-site revocable collector credentials, tenant-bound authorization on every lookup/stream/export, customer/installer/support roles, MFA for privileged accounts, TLS, encrypted secret storage, scoped service identities, quotas/rate limits, request-size limits and audit logs. Browser sessions require secure cookies, CSRF defenses where applicable, output encoding and a restrictive CSP. Test cross-tenant access, credential revocation, deletion/export and support-access expiration. Customer consent governs remote sharing and retention. Local read-only visibility should survive subscription expiry.

Keep forecasts, modeled costs and advisory outputs labelled estimates. Do not claim battery health from SOC alone, measured standby loss from an AC/DC residual, or hardware failure from weather/curtailment-limited production. Advisory actions require evidence and explanation; remote control remains out of scope.

## Capacity and service gates

Size by measured observations: sites × metrics per site × reports per day, then measure encoded payload/index/storage and retention costs. Pilot local 30-second cadence only where supported; aggregate for remote transfer when appropriate and preserve incident resolution. Define freshness, completeness, ingestion lag and recovery objectives from pilot results rather than promise an unmeasured SLA.

Milestones: (A) approved intake/schema; (B) one tested current-device profile and backwards-compatible bindings; (C) user-selected Deye first batch; (D) persistent collector and multi-site pilot; (E) stable public read API and customer PWA; (F) individually qualified Solis/Growatt families. No dates or budget are committed until the first model batch and service requirements are known.

## References

- Home Assistant HomeKit Bridge supported types: https://www.home-assistant.io/integrations/homekit/
- Home Assistant sensor entity semantics: https://developers.home-assistant.io/docs/core/entity/sensor/
- Existing source, tests and commissioning guide remain the implementation reference; this document does not change firmware, entity IDs or current hardware settings.
