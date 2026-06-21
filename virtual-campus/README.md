# Virtual Campus MVP

Independent Virtual Campus prototype for the plan in `todo/virtual-campus-requirements-and-technical-plan.md`.

## Scope

This is a runnable MVP slice, not a Paperclip core schema change. It follows the plan's recommended boundary:

- Paperclip remains the source of truth for companies, agents, issues, activity, costs, and approvals.
- Campus adds spatial read models: campus, building, floor, seat, seat assignment, employee projection, task projection, snapshots, timeline, and alerts.
- A BFF exposes Campus-shaped REST endpoints and an SSE event stream.
- The React frontend renders a 2D floor view with Canvas and drills into seat, agent, task, activity, and cost details.

## Run

From this directory:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm dev:bff
pnpm dev:ui
```

Open `http://127.0.0.1:5177`.

The BFF listens on `http://127.0.0.1:4177`; Vite proxies `/api` to it.

From the repository root, the Clawith service helper manages this package too:

```sh
./paperclip-clawith-services.sh install virtual-campus
./paperclip-clawith-services.sh start virtual-campus
./paperclip-clawith-services.sh status virtual-campus
./paperclip-clawith-services.sh restart virtual-campus
./paperclip-clawith-services.sh stop virtual-campus
```

The default `all` target also includes Virtual Campus.

By default the BFF uses seeded Paperclip data. To point it at a running Paperclip instance:

```sh
PAPERCLIP_API_BASE_URL=http://127.0.0.1:3100 \
PAPERCLIP_API_TOKEN=<optional-agent-token> \
pnpm dev:bff
```

The Campus PostgreSQL read-model contract is documented in `schema.sql`.

## API

- `GET /api/campus`
- `GET /api/campus/campus-main/overview`
- `GET /api/companies/{companyId}/campus`
- `GET /api/floors/{floorId}`
- `GET /api/seats/{seatId}`
- `GET /api/employees/{employeeId}`
- `GET /api/tasks/{taskId}`
- `GET /api/timeline`
- `GET /api/metrics/company/{companyId}`
- `GET /api/events`

Viewer scope is simulated for tests and review:

```sh
curl -H 'x-campus-role: observer' -H 'x-campus-companies: company-nova' \
  http://127.0.0.1:4177/api/floors/floor-nova-1
```

## Implemented P0 Coverage

- FR-01 campus overview: visible company buildings, agent/task/budget/approval alert metrics.
- FR-02 drill-down: building card selects a company floor; floor and filter state are recoverable from URL query params.
- FR-03 floor plan: 1000-seat Nova floor rendered through Canvas with zoom and seat selection.
- FR-04 state lights: occupancy, agent status, task status, and alerts are separate fields and visual layers.
- FR-05 agent card: drawer shows agent role, title, team, status, and monthly cost.
- FR-06 current task detail: drawer shows issue projection and Paperclip issue link.
- FR-07 realtime sync: BFF cold-starts from mock Paperclip REST data, applies idempotent live events, and pushes SSE.
- FR-08 activity panel: seat drawer shows normalized timeline events.
- FR-09 search/filter: query, team, status, priority, and alert filters are implemented server-side.
- FR-10 permissions/masking: company scope is enforced; observer role masks sensitive payloads and restricted agent/task fields.

## Deliberate MVP Limits

- Uses an in-memory read store in the runnable MVP. `schema.sql` defines the PostgreSQL read model for the next adapter.
- Uses a REST Paperclip client when `PAPERCLIP_API_BASE_URL` is set; otherwise falls back to seeded Paperclip data.
- Uses SSE for frontend fan-out. Paperclip source WebSocket consumption is represented by typed `PaperclipLiveEvent` inputs.
- Uses Canvas directly because `konva`, `react-konva`, and `echarts` are not installed in this checkout.
- P1/P2 items from the plan are not implemented: replay controls, communication graph, artifact wall, layout editor, plugin embedding, Redis fan-out.
