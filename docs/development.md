# Frontend development

## Implemented scope

The frontend is a real API client, with English UI, responsive layouts, explicit loading/error/empty states and no browser-persisted domain backend.

| Screen | Implemented behavior |
| --- | --- |
| Overview | Server-backed project/task/run/agent counts, recent runs, paused/failed/conflict attention, concurrency and queue metrics; missing provider usage stays unknown |
| Projects | Create/edit trusted WSL repository registration, configured root selection, branch and registered argv checks; optimistic revisions |
| Tasks & goals | Search and project filter, list/kanban, criteria, expected files, priorities and same-project dependency selection; asynchronous goal decomposition with a Planner version |
| Workflow studio | React Flow typed node palette, ports, keyboard selection, node settings, edge deletion, dependency-ranked parallel layout, client validation, mandatory server validation, editable drafts and immutable published versions |
| Agents | Versioned roles, Codex/Claude/mock provider, model, prompt, permission profile, numeric limits and pinned skill/tool/MCP references; worker-reported provider/auth health |
| Registry & policies | Inspect and create immutable versions of declarative skill/tool/MCP/policy manifests; explicit provider tool mappings and trusted scopes |
| Runs | Durable snapshots, node/attempt states, authenticated SSE replay, bounded activity history, pending pause/drain/resume/cancel controls, exact approval snapshots and approval history |
| Execution / Git | Result evidence, provider usage, branches/base/tree/commit IDs, escaped diff and test/review JSON, protected artifacts, trace links and exact integration-resolution proposals |
| Plan | Editable bounded task/dependency proposal; generated DAG display; create a separate workflow from the current proposal, publish it and launch with its exact source plan/base/policy |
| Settings | Read-only configured roots, telemetry flags and runtime readiness; no secret or authentication file editor |

Manual task states are authored only as draft/ready; running/completed outcomes remain server-owned. Approved task changes are isolated in host worker worktrees. The interface never marks approval or execution complete optimistically.

## Source layout

- `models.ts`: strict domain types and discriminated supported node kinds.
- `api.ts`: same-origin REST, bearer headers, redacted errors, optimistic revisions and retry identity.
- `hooks.ts`: TanStack server cache, mutations, query invalidation and abortable fetch SSE.
- `forms.ts`: canonical project/task form serialization and checks.
- `workflow.ts`: client graph validation, typed ports, safe default approval/test/review/commit template and dependency-ranked layout.
- `evidence.ts`: typed condition values, unknown usage handling and exact plan/proposal hash checks.
- `ui.tsx`: accessible native dialogs, labels, forms, error summaries and reusable primitives.
- `pages/`: project/task, workflow, agent/registry, plan and run interfaces.
- `App.tsx`: memory-only session, hash navigation and overview; `main.tsx`: QueryClient and development-only lazy query tools.
- `tests/`: Node test-runner regression tests, without live subscription calls.

Local graph selection, node positions and unsaved edits are UI state. Published graph JSON and run snapshots are authoritative server state. Node positions are presentation only and are recomputed from dependencies on reload.

## Contract bindings

The matching umbrella [contract documentation](../../docs/contracts.md) and API [wire contract](../../services/api/docs/wire-contract.md) own protocol semantics. `models.ts` describes the implemented client subset; it is not a separate schema authority. A generated OpenAPI client can replace the boundary once the implemented schema is published.

| Operation | Wire binding |
| --- | --- |
| Lists | `GET /api/{resource}?limit=200`, `{items,next_cursor}`; explicit load-more for long lists |
| Project / task edit | `PATCH`, `If-Match: revision`, canonical `dependency_ids`, `expected_files`, `acceptance_criteria` |
| Workflow draft / version | `graph_json`, `POST /validate {graph_json}`, `GET/POST /versions`; server semantic validation before publication |
| Agent config | `prompt`, `skill_ids`, `tool_ids`, `mcp_server_ids`, immutable `config_version_id` |
| Goal decomposition | `POST /api/tasks/{id}/decompose` with Planner config version; a queued planning run is not execution approval |
| Proposed plan edit | `PATCH /api/runs/{id}/plan {tasks,revision}` with revision and idempotency key; limited to 12 tasks before writing execution |
| Generated workflow | Only accept `result.graph_proposal` when `result.graph_proposal_plan_hash === run.plan_hash`; the planning workflow version remains unchanged |
| Run launch | `task_id`, immutable `workflow_version_id`, optional agent/policy, root base and plan; re-read source plan and reject changed hash or different root task |
| Approval | Decision includes the exact `snapshot_hash` and approval `revision`; show snapshot and expiry before approving |
| Controls | Durable `POST /pause`, `/resume`, `/cancel`; 202 means command persisted, not completed |
| Conflict resolution | `POST /resolution {execution_id,tree_sha}` proposes the preserved integration allocation's exact tree; fresh approval is required before resume |
| Health / metrics | `/api/providers/health`, `/api/metrics/overview`, `/api/settings` |
| Artifacts | Authenticated `/api/artifacts/{id}/content`, escaped text preview capped at 2 MiB, attachment download |

Uncertain mutation retries reuse the same request key while the body/revision remains identical. A successful receipt retires the key; a new intent or changed revision gets a new key. Conflicts invalidate the cache, show the server error and preserve form edits for manual reconciliation.

A plan edit invalidates its old workflow proposal on the server. The planner recompiles a new proposal for the new plan hash. A created workflow route binds the source run and source plan hash, so later edits cannot silently launch a different plan. A generated workflow is a new draft requiring validation/publication; the old planning run is never rewritten.

## Authentication, permissions and streaming

The admin token is entered into a password field, stays in React/API client memory and travels only in an `Authorization` header. It is absent from URL parameters, localStorage, sessionStorage, client environment files and build output. Lock or HTTP 401 clears the session and query cache. No cookie session is used.

Fetch SSE carries the same bearer header and `Last-Event-ID`. The parser supports fragmented CRLF, multiline data and heartbeat comments. Persistent event IDs are deduplicated and run sequence advances monotonically. Reconnection uses bounded backoff; expired cursors reset replay and refetch the authoritative snapshot. Navigation aborts the stream and timers. The UI retains at most 200 activity events; it does not announce or focus every streamed token. Events refresh run-related server caches with a short throttle.

The parser caps the full UTF-8 event at 64 KiB. The API reserves envelope space by limiting payloads to 60,000 bytes; a regression covers the near-limit envelope and oversized network chunks containing many valid frames.

Workflow conditions select registered state fields and `eq`/`in`, with true booleans for boolean fields. Forms accept declarative registry JSON and argv arrays for trusted registered checks/MCP; there is no arbitrary JavaScript expression or shell execution widget. Scope, capability, path and lease validation are server/worker responsibilities.

Tool manifests require explicit provider identifiers in `provider_mappings`. The current Claude example maps read scope to `Read`, `Glob`, `Grep`. Codex 0.157 cannot enforce the promised narrow per-tool registry and rejects assigned narrow registries; its coarse permission profile is a separate worker capability. Registering a skill or MCP definition does not prove that the configured worker can execute it. Unsupported capabilities must fail closed.

Diffs, logs, JSON and artifact previews are escaped text. There is no raw HTML rendering. Trace links allow HTTP(S) only. Provider usage is displayed only when actually reported; null/missing values remain unknown and a reported zero stays zero. Subscription cost is not estimated.

## Development and build

Use the pinned Node 24 LTS toolchain (CI 24.14.0) and `npm ci`. Do not put secrets in `VITE_*` variables. The ESM Vite config binds its development listener to loopback and proxies `/api` to API port 8080. Run the local Docker stack from the matching umbrella; nginx blocks `/internal` from the browser-facing proxy. The Dockerfile builds static assets from the lockfile.

```sh
npm ci
npm run lint
npm test
npm run build
npm run dev
```

`npm run build` includes strict TypeScript checking. Biome checks formatting, imports, accessibility and common source errors. The production build splits React, query and workflow dependencies into bounded chunks; development query tools are lazy and excluded from production. No remote fonts or asset API is required.

The module CI pins checkout/setup-node actions by verified commit SHA, runs lint/tests/build on Node 24.14.0, and makes no live provider call.

Relevant primary references: [React useActionState](https://react.dev/reference/react/useActionState), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), [React Flow](https://reactflow.dev/learn), [Vite build configuration](https://vite.dev/config/build-options.html), [Biome configuration](https://biomejs.dev/reference/configuration/). Installed TypeScript definitions and compiled code were checked against the pinned package versions.

## Verification and readiness

Local verification on October 10, 2026: production build and strict types passed; 21 proportional unit tests passed. Tests cover authorization/error boundaries and protected artifact session expiry, uncertain mutation identity, canonical forms, typed conditions, safe workflow evidence bindings, invalid graph topology, parallel layout, stale plan proposals, unknown usage and bounded SSE replay.

Read-only checks through the local production same-origin proxy returned 200 for projects, tasks, workflows, agents, skills, tools, MCP servers, policies, runs, provider health, settings and metrics with expected list/metadata shapes. That database was empty, so these checks do not verify approval/execution artifact payloads or mutation workflows. The umbrella owner performs browser integration QA and host execution acceptance separately.

Remaining whole-system evidence includes real provider authentication/capability enforcement, goal-to-generated-DAG execution, exact approval conflicts, worker stop/retry/cancellation, independent tree review, integration conflicts and restart replay. UI build/tests alone do not satisfy those gates. `runtime_ready` remains server-reported false until the matching umbrella records acceptance evidence.
