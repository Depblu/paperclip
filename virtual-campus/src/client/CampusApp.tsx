import { useEffect, useState } from "react";
import { AlertTriangle, Building2, Search, Users, Zap } from "lucide-react";
import type { CampusOverview, FloorView, FloorViewSeat, TimelineEvent } from "../shared/projections";
import { createCampusApi } from "./api";
import { FloorCanvas } from "./FloorCanvas";
import { formatMoney, statusLabel } from "./format";

const api = createCampusApi();

export function CampusApp() {
  const initialState = getInitialViewState();
  const [overview, setOverview] = useState<CampusOverview | null>(null);
  const [floor, setFloor] = useState<FloorView | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<(FloorViewSeat & { timeline?: TimelineEvent[] }) | null>(null);
  const [filters, setFilters] = useState(initialState.filters);
  const [selectedFloorId, setSelectedFloorId] = useState(initialState.floorId);
  const [liveState, setLiveState] = useState<"connected" | "stale">("stale");

  const load = async () => {
    const overviewResult = await api.getOverview();
    const firstFloorId = overviewResult.buildings[0]?.floorId ?? selectedFloorId;
    const effectiveFloorId = overviewResult.buildings.some((building) => building.floorId === selectedFloorId)
      ? selectedFloorId
      : firstFloorId;
    const floorResult = await api.getFloor(effectiveFloorId, compactFilters(filters));
    if (effectiveFloorId !== selectedFloorId) setSelectedFloorId(effectiveFloorId);
    setOverview(overviewResult);
    setFloor(floorResult);
  };

  useEffect(() => {
    void load();
    syncUrl(selectedFloorId, filters);
  }, [selectedFloorId, filters.query, filters.team, filters.status, filters.priority, filters.alert]);

  useEffect(() => {
    const close = api.openEvents(() => {
      setLiveState("connected");
      void load();
    });
    return close;
  }, [selectedFloorId, filters.query, filters.team, filters.status, filters.priority, filters.alert]);

  const floors = overview?.buildings.map((building) => ({ id: building.floorId, label: building.metrics.companyName })) ?? [];

  return (
    <main className="campus-app">
      <header className="topbar">
        <div>
          <h1>Virtual Campus</h1>
          <p>Paperclip companies, agents, tasks, costs, approvals, and live events as a spatial operations view.</p>
        </div>
        <div className={`live-pill ${liveState}`}>
          <Zap size={16} />
          {liveState === "connected" ? "live sync" : "waiting for sync"}
        </div>
      </header>
      <section className="overview-grid">
        {overview?.buildings.map((building) => (
          <button key={building.id} className="building-card" onClick={() => setSelectedFloorId(building.floorId)}>
            <Building2 size={22} />
            <span>{building.name}</span>
            <strong>{building.metrics.companyName}</strong>
            <small>{building.metrics.runningAgents}/{building.metrics.agentCount} running agents</small>
            <small>{formatMoney(building.metrics.spentMonthlyCents)} / {formatMoney(building.metrics.budgetMonthlyCents)}</small>
            <small>{building.metrics.alerts.length} alerts</small>
          </button>
        ))}
      </section>
      <section className="workspace">
        <aside className="left-panel">
          <nav className="segmented">
            {floors.map((item) => (
              <button key={item.id} className={item.id === selectedFloorId ? "active" : ""} onClick={() => setSelectedFloorId(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <Filters filters={filters} setFilters={setFilters} />
          {floor ? <Metrics floor={floor} /> : null}
        </aside>
        <section className="floor-area">
          {floor ? <FloorCanvas floor={floor} selectedSeatId={selectedSeat?.id ?? null} onSelectSeat={async (seat) => setSelectedSeat(await api.getSeat(seat.id))} /> : <div className="loading">Loading floor...</div>}
        </section>
        <SeatDrawer seat={selectedSeat} onClose={() => setSelectedSeat(null)} />
      </section>
    </main>
  );
}

function Filters({
  filters,
  setFilters,
}: {
  filters: Record<string, string>;
  setFilters: (filters: { query: string; team: string; status: string; priority: string; alert: string }) => void;
}) {
  const update = (key: string, value: string) => setFilters({ query: filters.query, team: filters.team, status: filters.status, priority: filters.priority, alert: filters.alert, [key]: value });
  return (
    <div className="filter-panel">
      <label className="search-box">
        <Search size={16} />
        <input value={filters.query} onChange={(event) => update("query", event.target.value)} placeholder="Search company, agent, seat, task" />
      </label>
      <select value={filters.team} onChange={(event) => update("team", event.target.value)}>
        <option value="all">All teams</option>
        <option value="Leadership">Leadership</option>
        <option value="Engineering">Engineering</option>
      </select>
      <select value={filters.status} onChange={(event) => update("status", event.target.value)}>
        <option value="all">All statuses</option>
        <option value="occupied">Occupied seats</option>
        <option value="running">Running agents</option>
        <option value="idle">Idle agents</option>
        <option value="error">Agent error</option>
        <option value="blocked">Blocked tasks</option>
        <option value="in_review">In review</option>
      </select>
      <select value={filters.priority} onChange={(event) => update("priority", event.target.value)}>
        <option value="all">All priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select value={filters.alert} onChange={(event) => update("alert", event.target.value)}>
        <option value="all">All alerts</option>
        <option value="cost_overrun">Cost overrun</option>
        <option value="blocked_too_long">Blocked too long</option>
        <option value="agent_error">Agent error</option>
        <option value="approval_pending">Approval pending</option>
      </select>
    </div>
  );
}

function Metrics({ floor }: { floor: FloorView }) {
  return (
    <div className="metrics-grid">
      <Metric label="Agents" value={`${floor.metrics.runningAgents}/${floor.metrics.agentCount}`} />
      <Metric label="Blocked" value={floor.metrics.blockedTasks.toString()} />
      <Metric label="Approvals" value={floor.metrics.pendingApprovals.toString()} />
      <Metric label="Spend" value={formatMoney(floor.metrics.spentMonthlyCents)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SeatDrawer({
  seat,
  onClose,
}: {
  seat: (FloorViewSeat & { timeline?: TimelineEvent[] }) | null;
  onClose: () => void;
}) {
  if (!seat) {
    return (
      <aside className="drawer empty">
        <Users size={22} />
        <p>Select a seat to inspect agent, task, activity, cost, and Paperclip links.</p>
      </aside>
    );
  }

  return (
    <aside className="drawer">
      <button className="icon-button close" onClick={onClose} aria-label="Close">x</button>
      <header>
        <span className="eyebrow">{seat.code} / {seat.zone}</span>
        <h2>{seat.employee?.displayName ?? "Empty seat"}</h2>
      </header>
      <dl className="property-list">
        <div><dt>Seat</dt><dd>{statusLabel(seat.occupancyStatus)}</dd></div>
        <div><dt>Agent</dt><dd>{statusLabel(seat.agentStatus)}</dd></div>
        <div><dt>Task</dt><dd>{statusLabel(seat.issueStatus)}</dd></div>
      </dl>
      {seat.employee ? (
        <section className="drawer-section">
          <h3>Agent</h3>
          <p>{seat.employee.title ?? seat.employee.role}</p>
          <p>{seat.employee.team} / {seat.employee.role}</p>
          <p>{formatMoney(seat.employee.spentMonthlyCents)} used of {formatMoney(seat.employee.budgetMonthlyCents)}</p>
        </section>
      ) : null}
      {seat.task ? (
        <section className="drawer-section">
          <h3>{seat.task.identifier}</h3>
          <p>{seat.task.title}</p>
          <div className="chip-row">
            <span>{seat.task.priority}</span>
            <span>{statusLabel(seat.task.status)}</span>
          </div>
          <a href={seat.task.paperclipUrl}>Open in Paperclip</a>
        </section>
      ) : null}
      {seat.alertKinds.length > 0 ? (
        <section className="drawer-section alert-list">
          <h3>Alerts</h3>
          {seat.alertKinds.map((alert) => (
            <span key={alert}><AlertTriangle size={14} /> {statusLabel(alert)}</span>
          ))}
        </section>
      ) : null}
      <section className="drawer-section">
        <h3>Recent activity</h3>
        <div className="timeline">
          {(seat.timeline ?? []).map((event) => (
            <article key={event.id}>
              <strong>{event.action}</strong>
              <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}

function compactFilters(filters: Record<string, string>) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value && value !== "all"));
}

function getInitialViewState() {
  const params = new URLSearchParams(window.location.search);
  return {
    floorId: params.get("floor") ?? "floor-nova-1",
    filters: {
      query: params.get("query") ?? "",
      team: params.get("team") ?? "all",
      status: params.get("status") ?? "all",
      priority: params.get("priority") ?? "all",
      alert: params.get("alert") ?? "all",
    },
  };
}

function syncUrl(floorId: string, filters: Record<string, string>) {
  const params = new URLSearchParams();
  params.set("floor", floorId);
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== "all") params.set(key, value);
  }
  const next = `${window.location.pathname}?${params.toString()}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, "", next);
  }
}
