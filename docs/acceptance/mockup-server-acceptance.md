# Mock server acceptance specification

- Status: Draft
- Created: 2026-11-04
- Scope: agent-readable acceptance criteria for a declared Jira/Confluence read-only mock, not a claim that the mock is complete.
- Authority: [supplied executable-contract input](mockup-server-acceptance.json), [provenance and implementation boundaries](provenance.md), and the explicitly separated live observations and proposed requirements below.

> This is the supplied specification narrative. Its draft/not-executed wording describes the input snapshot; current execution results are recorded separately without changing its substantive assertions.

## Deliverable

[mockup-server-acceptance.json](mockup-server-acceptance.json) is a self-contained
test specification. It contains anonymized live observations, synthetic fixture
seeds, JSON Schemas, parameterized cases, completion gates and a result template.
It is not a test runner. An implementing agent must translate its assertions into
executable checks, expand every matrix row, and retain sanitized execution evidence.
Schema definitions use JSON Schema draft-07-compatible keywords and URN references.

Template variables use `{{NAME}}`. Bindings come from the `bindings` object or the
current matrix row. Request paths are relative to each product Base URL. Authentication
aliases mean the matching fake PAT (`valid`), no header (`missing`), an invalid fake
PAT (`invalid`), or the other mock product's PAT (`other_product_token`). Never load
real credential files during mock acceptance. JSON body subsets are partial checks,
not complete-response equality. Schema names refer to entries in `schemas`.

The fixture seeds are synthetic, not captured real records. Materialize them into
REST response objects consistent with the schemas and expected ordered key sets.
Dates must be parsed when ordering/comparing. Request matrices describe a bounded
supported language; they do not request a new general-purpose JQL parser.

## Evidence boundary

Only read-only requests were made while collecting live observations. Credentials,
URLs, real identities, account/space keys, issue/page contents and raw responses
are not included. Field names, field types, status codes and public enum concepts
are sufficient to ground this specification. Actual server patch versions were
not collected and must not be inferred from target versions in mock documentation.

Important observed differences from the earlier mock contract:

- Jira authentication-filter 401 uses `status-code` and `message`; resource-level
  invalid-JQL/missing-issue errors use `errorMessages` and `errors`.
- Confluence `user/current` returns HTTP 200 with `type: anonymous` for both missing
  and invalid tokens. Only `known` plus identity fields confirms authentication.
- Jira search `expand` is optional, including on empty results.
- Confluence default content includes metadata without a body. An explicit
  `body.storage` expansion can replace default metadata expansions; do not require
  `space`, `history` and `version` unless the request explicitly asks for them.

Null variants, injected failures, alternate offsets/limits, combined expansions,
offline lifecycle and consumer integration remain labelled as consumer requirements
or synthetic design, not as observed live facts. The earlier strict-PAT anonymous
policy cannot silently be called live-compatible; it must be a named alternative
profile or changed to satisfy the observed anonymous-identity cases.

## Completion

All required matrix rows and all gates must pass on the same candidate source and
fixture version. `NOT_RUN`, `BLOCKED`, `SKIPPED` and missing evidence block completion.
Keep failed attempts even after retries. This document and the JSON are currently
**specification only**: live collection succeeded, but the new mock acceptance suite
has not been implemented or executed and no completion gate has been passed.

The supported claim is read-only offline-development compatibility within this
contract. It does not cover uploads, writes, arbitrary queries, actual access control,
SSO/TLS/proxy parity, historical analytics or AI-driven dashboards. Expansion into
those areas requires new observed contracts and explicit acceptance cases.
