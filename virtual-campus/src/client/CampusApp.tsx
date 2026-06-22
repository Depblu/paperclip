import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Grid3X3,
  LayoutDashboard,
  List,
  Maximize2,
  RefreshCw,
  Search,
  Settings,
  Shield,
  User,
  Users,
  Zap,
} from "lucide-react";
import type { BuildingSummary, CampusOverview, FloorView, FloorViewSeat, TimelineEvent } from "../shared/projections";
import { createCampusApi } from "./api";
import { FloorCanvas } from "./FloorCanvas";
import { formatMoney, statusLabel } from "./format";
import { t, type I18nKey } from "./i18n";

const api = createCampusApi();

type FiltersState = {
  query: string;
  team: string;
  status: string;
  priority: string;
  alert: string;
};

type ViewMode = "cards" | "plan" | "list";
type DetailTab = "status" | "task" | "activity" | "cost";
type LiveState = "connected" | "stale" | "error";
type SidePanel = "overview" | "company" | "buildings" | "floors" | "seats" | "roles" | "agents" | "tasks" | "permissions" | "settings" | "sync";
type TopPanel = "notifications" | "user" | null;
type SidebarItem = {
  id: SidePanel;
  label: string;
  icon: typeof LayoutDashboard;
};

const blockTabs = [
  { id: "A座", label: t("blockA") },
  { id: "B座", label: t("blockB") },
  { id: "C座", label: t("blockC") },
];
const floorTabs = ["5楼", "4楼", "3楼", "2楼", "1楼"];

const navSections: Array<{ title: string; items: SidebarItem[] }> = [
  { title: t("campus"), items: [{ id: "overview", label: t("campusOverview"), icon: LayoutDashboard }] },
  {
    title: t("organization"),
    items: [
      { id: "company", label: t("companies"), icon: Building2 },
      { id: "buildings", label: t("buildings"), icon: Grid3X3 },
      { id: "floors", label: t("floors"), icon: List },
      { id: "seats", label: t("seats"), icon: CircleDot },
    ],
  },
  {
    title: t("people"),
    items: [
      { id: "roles", label: t("roles"), icon: Shield },
      { id: "agents", label: t("agents"), icon: Users },
    ],
  },
  { title: t("work"), items: [{ id: "tasks", label: t("tasks"), icon: ClipboardList }] },
  {
    title: t("system"),
    items: [
      { id: "permissions", label: t("permissions"), icon: Shield },
      { id: "settings", label: t("settings"), icon: Settings },
      { id: "sync", label: t("sync"), icon: RefreshCw },
    ],
  },
];

export function CampusApp() {
  const initialState = getInitialViewState();
  const [overview, setOverview] = useState<CampusOverview | null>(null);
  const [floor, setFloor] = useState<FloorView | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<(FloorViewSeat & { timeline?: TimelineEvent[] }) | null>(null);
  const [filters, setFilters] = useState<FiltersState>(initialState.filters);
  const [selectedFloorId, setSelectedFloorId] = useState(initialState.floorId);
  const [selectedBlock, setSelectedBlock] = useState(initialState.block);
  const [selectedLevel, setSelectedLevel] = useState(initialState.level);
  const [viewMode, setViewMode] = useState<ViewMode>(initialState.view);
  const [detailTab, setDetailTab] = useState<DetailTab>("status");
  const [liveState, setLiveState] = useState<LiveState>("stale");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(initialState.panel);
  const [topPanel, setTopPanel] = useState<TopPanel>(null);

  const load = async () => {
    try {
      const overviewResult = await api.getOverview();
      const firstFloorId = overviewResult.buildings[0]?.floorId ?? selectedFloorId;
      const effectiveFloorId = overviewResult.buildings.some((building) => building.floorId === selectedFloorId)
        ? selectedFloorId
        : firstFloorId;
      const floorResult = await api.getFloor(effectiveFloorId, compactFilters(filters));
      if (effectiveFloorId !== selectedFloorId) setSelectedFloorId(effectiveFloorId);
      setOverview(overviewResult);
      setFloor(floorResult);
      setLiveState((current) => (current === "error" ? "stale" : current));
      setLastSyncedAt(new Date().toISOString());
      if (selectedSeat && !floorResult.seats.some((seat) => seat.id === selectedSeat.id)) {
        setSelectedSeat(null);
      } else if (!selectedSeat) {
        const firstOccupiedSeat = floorResult.seats.find((seat) => seat.employee);
        if (firstOccupiedSeat) setSelectedSeat(await api.getSeat(firstOccupiedSeat.id));
      }
    } catch {
      setLiveState("error");
    }
  };

  const clearFilters = () => setFilters(createEmptyFilters());

  const openPaperclip = (path: string) => {
    window.open(path, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    void load();
    syncUrl({ floorId: selectedFloorId, filters, block: selectedBlock, level: selectedLevel, view: viewMode, panel: sidePanel });
  }, [selectedFloorId, selectedBlock, selectedLevel, viewMode, sidePanel, filters.query, filters.team, filters.status, filters.priority, filters.alert]);

  useEffect(() => {
    const close = api.openEvents(() => {
      setLiveState("connected");
      void load();
    });
    return close;
  }, [selectedFloorId, filters.query, filters.team, filters.status, filters.priority, filters.alert]);

  const activeBuilding = useMemo(() => {
    if (!overview || !floor) return overview?.buildings[0] ?? null;
    return overview.buildings.find((building) => building.companyId === floor.companyId) ?? overview.buildings[0] ?? null;
  }, [overview, floor]);

  const floors = overview?.buildings.map((building, index) => ({ id: building.floorId, label: `${index + 1}F`, building })) ?? [];
  const effectiveBuilding = activeBuilding ?? overview?.buildings[0] ?? null;
  const currentSeat = selectedSeat;

  return (
    <main className="campus-shell">
      <Sidebar activePanel={sidePanel} setActivePanel={setSidePanel} />
      <section className="campus-main">
        <Topbar
          floor={floor}
          building={effectiveBuilding}
          liveState={liveState}
          lastSyncedAt={lastSyncedAt}
          filters={filters}
          setFilters={setFilters}
          activePanel={topPanel}
          setActivePanel={setTopPanel}
          alertCount={effectiveBuilding?.metrics.alerts.length ?? 0}
          onRefresh={() => void load()}
        />
        {overview && effectiveBuilding ? (
          <CompanyOverview building={effectiveBuilding} floor={floor} openPaperclip={openPaperclip} />
        ) : (
          <div className="overview-card loading">{t("loadingCompany")}</div>
        )}
        <section className="operations-panel">
          <div className="block-tabs">
            {blockTabs.map((block) => (
              <button key={block.id} className={block.id === selectedBlock ? "active" : ""} onClick={() => setSelectedBlock(block.id)}>
                {block.label}
              </button>
            ))}
          </div>
          <div className="floor-workspace">
            <section className="floor-content">
              <FloorToolbar
                floors={floors}
                selectedFloorId={selectedFloorId}
                setSelectedFloorId={setSelectedFloorId}
                selectedLevel={selectedLevel}
                setSelectedLevel={setSelectedLevel}
                filters={filters}
                setFilters={setFilters}
                clearFilters={clearFilters}
                viewMode={viewMode}
                setViewMode={setViewMode}
              />
              {floor ? (
                <SeatWorkspace
                  floor={floor}
                  selectedSeatId={selectedSeat?.id ?? null}
                  onSelectSeat={async (seat) => {
                    setSelectedSeat(await api.getSeat(seat.id));
                    setDetailTab("status");
                  }}
                  viewMode={viewMode}
                  clearFilters={clearFilters}
                />
              ) : (
                <div className="seat-empty-state">{t("loadingFloor")}</div>
              )}
            </section>
            <SeatInspector
              seat={currentSeat}
              tab={detailTab}
              setTab={setDetailTab}
              onClose={() => setSelectedSeat(null)}
              totalSeats={floor?.seats.length ?? 0}
              openPaperclip={openPaperclip}
            />
          </div>
        </section>
        <ContextPanel
          panel={sidePanel}
          floor={floor}
          building={effectiveBuilding}
          viewMode={viewMode}
          lastSyncedAt={lastSyncedAt}
          clearFilters={clearFilters}
          setViewMode={setViewMode}
          setDetailTab={setDetailTab}
          openPaperclip={openPaperclip}
        />
      </section>
    </main>
  );
}

function Sidebar({ activePanel, setActivePanel }: { activePanel: SidePanel; setActivePanel: (panel: SidePanel) => void }) {
  return (
    <aside className="campus-sidebar">
      <div className="campus-brand">
        <div className="brand-mark"><Building2 size={18} /></div>
        <strong>{t("appName")}</strong>
      </div>
      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.items.map((item: SidebarItem) => {
              const Icon = item.icon;
              return (
                <button key={item.label} className={activePanel === item.id ? "active" : ""} onClick={() => setActivePanel(item.id)}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </section>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({
  floor,
  building,
  liveState,
  lastSyncedAt,
  filters,
  setFilters,
  activePanel,
  setActivePanel,
  alertCount,
  onRefresh,
}: {
  floor: FloorView | null;
  building: BuildingSummary | null;
  liveState: LiveState;
  lastSyncedAt: string | null;
  filters: FiltersState;
  setFilters: (filters: FiltersState) => void;
  activePanel: TopPanel;
  setActivePanel: (panel: TopPanel) => void;
  alertCount: number;
  onRefresh: () => void;
}) {
  return (
    <header className="campus-topbar">
      <nav className="breadcrumbs" aria-label="面包屑">
        <button onClick={() => setFilters({ ...filters, query: "" })}>{t("campusOverview")}</button>
        <span>/</span>
        <span>{building?.metrics.companyName ?? t("company")}</span>
        <span>/</span>
        <span>{t("blockA")}</span>
        <span>/</span>
        <strong>{floor?.floorName ?? t("floor")}</strong>
      </nav>
      <label className="global-search">
        <Search size={16} />
        <input
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          placeholder={t("searchGlobal")}
        />
      </label>
      <button className={`live-pill ${liveState}`} onClick={onRefresh}>
        <Zap size={15} />
        <span>{liveLabel(liveState, lastSyncedAt)}</span>
      </button>
      <button className={`notification-button ${activePanel === "notifications" ? "active" : ""}`} aria-label={t("notificationLabel")} onClick={() => setActivePanel(activePanel === "notifications" ? null : "notifications")}>
        <Bell size={18} />
        <span>{alertCount}</span>
      </button>
      <button className={`user-menu ${activePanel === "user" ? "active" : ""}`} onClick={() => setActivePanel(activePanel === "user" ? null : "user")}>
        <span className="avatar">管</span>
        <span>
          <strong>{t("boardAdmin")}</strong>
          <small>{t("companyOwner")}</small>
        </span>
        <ChevronDown size={14} />
      </button>
      {activePanel === "notifications" ? <NotificationsPopover building={building} /> : null}
      {activePanel === "user" ? <UserPopover /> : null}
    </header>
  );
}

function NotificationsPopover({ building }: { building: BuildingSummary | null }) {
  const alerts = building?.metrics.alerts ?? [];
  return (
    <section className="top-popover notifications-popover">
      <h2>{t("notificationLabel")}</h2>
      {alerts.length > 0 ? alerts.slice(0, 6).map((alert) => (
        <article key={alert.id}>
          <AlertTriangle size={15} />
          <div>
            <strong>{statusLabel(alert.kind)}</strong>
            <small>{alert.title}</small>
          </div>
        </article>
      )) : <p>{t("noRecentActivity")}</p>}
    </section>
  );
}

function UserPopover() {
  return (
    <section className="top-popover user-popover">
      <h2>{t("boardAdmin")}</h2>
      <p>{t("companyOwner")}</p>
      <div className="language-row">
        <span>{t("language")}</span>
        <strong>{t("chinese")}</strong>
      </div>
      <small>{t("i18nReady")}</small>
    </section>
  );
}

function CompanyOverview({ building, floor, openPaperclip }: { building: BuildingSummary; floor: FloorView | null; openPaperclip: (path: string) => void }) {
  const teams = buildTeamSummaries(floor);
  return (
    <section className="overview-card company-summary">
      <div className="building-photo" aria-hidden="true">
        <Building2 size={34} />
      </div>
      <div className="company-copy">
        <div className="title-row">
          <h1>{building.metrics.companyName}</h1>
          <span className="status-badge healthy">{t("healthy")}</span>
        </div>
        <dl>
          <div><dt>{t("employeeCount")}</dt><dd>{building.metrics.agentCount}</dd></div>
          <div><dt>{t("createdAt")}</dt><dd>2026-06-21</dd></div>
        </dl>
        <div className="quick-actions">
          <button onClick={() => openPaperclip(`/companies/${building.companyId}`)}>{t("openCompany")}</button>
          <button onClick={() => openPaperclip(`/issues?companyId=${building.companyId}`)}>{t("openIssue")}</button>
        </div>
      </div>
      <div className="org-summary">
        <h2>{t("orgChart")}</h2>
        <div className="org-node root"><Building2 size={14} /> {building.metrics.companyName}</div>
        <div className="org-branches">
          {teams.map((team) => (
            <span key={team.name}>
              <strong>{teamLabel(team.name)}</strong>
              <small>{team.count} 人</small>
            </span>
          ))}
        </div>
      </div>
      <div className="kpi-grid">
        <OverviewKpi icon={<ClipboardList size={20} />} label={t("runningTasks")} value={building.metrics.runningAgents.toString()} tone="blue" />
        <OverviewKpi icon={<AlertTriangle size={20} />} label={t("blockedTasks")} value={building.metrics.blockedTasks.toString()} tone="red" />
        <OverviewKpi icon={<BriefcaseBusiness size={20} />} label={t("monthlySpend")} value={formatMoney(building.metrics.spentMonthlyCents)} tone="green" />
        <OverviewKpi icon={<Bell size={20} />} label={t("approvals")} value={building.metrics.pendingApprovals.toString()} tone="amber" />
      </div>
    </section>
  );
}

function OverviewKpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className={`overview-kpi ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function FloorToolbar({
  floors,
  selectedFloorId,
  setSelectedFloorId,
  selectedLevel,
  setSelectedLevel,
  filters,
  setFilters,
  clearFilters,
  viewMode,
  setViewMode,
}: {
  floors: Array<{ id: string; label: string; building: BuildingSummary }>;
  selectedFloorId: string;
  setSelectedFloorId: (floorId: string) => void;
  selectedLevel: string;
  setSelectedLevel: (level: string) => void;
  filters: FiltersState;
  setFilters: (filters: FiltersState) => void;
  clearFilters: () => void;
  viewMode: ViewMode;
  setViewMode: (viewMode: ViewMode) => void;
}) {
  const update = (key: keyof FiltersState, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <header className="floor-header">
      <div className="floor-switch-row">
        <span>{t("floor")}:</span>
        {floorTabs.map((level, index) => (
          <button
            key={level}
            className={level === selectedLevel ? "active" : ""}
            onClick={() => {
              setSelectedLevel(level);
              const floor = floors[index % Math.max(floors.length, 1)];
              if (floor) setSelectedFloorId(floor.id);
            }}
          >
            {level}
          </button>
        ))}
        {floors.length > 1 ? (
          <select value={selectedFloorId} onChange={(event) => setSelectedFloorId(event.target.value)} aria-label={t("companyFloor")}>
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.building.metrics.companyName}</option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="filter-row">
        <select value={filters.team} onChange={(event) => update("team", event.target.value)}>
          <option value="all">{t("allTeams")}</option>
          <option value="Leadership">{t("teamLeadership")}</option>
          <option value="Engineering">{t("teamEngineering")}</option>
          <option value="Operations">{t("teamOperations")}</option>
          <option value="Review">{t("teamReview")}</option>
        </select>
        <label className="inline-search">
          <Search size={15} />
          <input value={filters.query} onChange={(event) => update("query", event.target.value)} placeholder={t("searchSeat")} />
        </label>
        <select value={filters.status} onChange={(event) => update("status", event.target.value)}>
          <option value="all">{t("allStatuses")}</option>
          <option value="occupied">{t("occupied")}</option>
          <option value="running">{t("running")}</option>
          <option value="idle">{t("idle")}</option>
          <option value="blocked">{t("blocked")}</option>
          <option value="error">{t("error")}</option>
        </select>
        <select value={filters.priority} onChange={(event) => update("priority", event.target.value)}>
          <option value="all">{t("allPriorities")}</option>
          <option value="critical">{t("priorityCritical")}</option>
          <option value="high">{t("priorityHigh")}</option>
          <option value="medium">{t("priorityMedium")}</option>
          <option value="low">{t("priorityLow")}</option>
        </select>
        <select value={filters.alert} onChange={(event) => update("alert", event.target.value)}>
          <option value="all">{t("allAlerts")}</option>
          <option value="cost_overrun">{t("costOverrun")}</option>
          <option value="blocked_too_long">{t("blockedTooLong")}</option>
          <option value="agent_error">{t("agentError")}</option>
          <option value="approval_pending">{t("approvalPending")}</option>
        </select>
        <button className="secondary-action" onClick={clearFilters}>{t("clearFilters")}</button>
        <div className="view-toggle" aria-label="视图模式">
          <button className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")} aria-label={t("cardGrid")} title={t("cardGrid")}><Grid3X3 size={16} /></button>
          <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-label={t("listView")} title={t("listView")}><List size={16} /></button>
          <button className={viewMode === "plan" ? "active" : ""} onClick={() => setViewMode("plan")} aria-label={t("floorPlan")} title={t("floorPlan")}><Maximize2 size={16} /></button>
        </div>
      </div>
    </header>
  );
}

function SeatWorkspace({
  floor,
  selectedSeatId,
  onSelectSeat,
  viewMode,
  clearFilters,
}: {
  floor: FloorView;
  selectedSeatId: string | null;
  onSelectSeat: (seat: FloorViewSeat) => void;
  viewMode: ViewMode;
  clearFilters: () => void;
}) {
  if (viewMode === "plan") {
    return <FloorCanvas floor={floor} selectedSeatId={selectedSeatId} onSelectSeat={onSelectSeat} />;
  }

  if (floor.seats.length === 0) {
    return (
      <div className="seat-empty-state">
        {t("noSeatMatches")}
        <span>{t("seeFullFloor")}</span>
        <button onClick={clearFilters}>{t("clearFilters")}</button>
      </div>
    );
  }

  return (
    <section className="seat-board">
      <div className="seat-board-title">
        <strong>{floor.floorName}</strong>
        <StatusLegend />
      </div>
      {viewMode === "list" ? (
        <div className="seat-list">
          {floor.seats.map((seat) => (
            <button key={seat.id} className={seat.id === selectedSeatId ? "active" : ""} onClick={() => onSelectSeat(seat)}>
              <span>{seat.code}</span>
              <strong>{seat.employee?.displayName ?? t("emptySeat")}</strong>
              <small>{seat.employee?.title ?? seat.employee?.role ?? seat.zone}</small>
              <SeatStateBadge seat={seat} />
            </button>
          ))}
        </div>
      ) : (
        <div className="seat-grid">
          {floor.seats.slice(0, 120).map((seat, index) => (
            <SeatCard key={seat.id} seat={seat} selected={seat.id === selectedSeatId} index={index} onSelect={() => onSelectSeat(seat)} />
          ))}
        </div>
      )}
    </section>
  );
}

function StatusLegend() {
  return (
    <div className="status-legend">
      <span><i className="empty" /> {t("statusEmpty")}</span>
      <span><i className="running" /> {t("working")}</span>
      <span><i className="busy" /> {t("busy")}</span>
      <span><i className="offline" /> {t("away")}</span>
      <span><i className="error" /> {t("exception")}</span>
    </div>
  );
}

function SeatCard({ seat, selected, index, onSelect }: { seat: FloorViewSeat; selected: boolean; index: number; onSelect: () => void }) {
  const state = deriveSeatState(seat);
  const blockedBy = getBlockedBy(seat);
  return (
    <button className={`seat-card ${selected ? "active" : ""}`} onClick={onSelect}>
      <header>
        <strong>{seat.code}</strong>
        {selected ? <ChevronDown size={16} /> : null}
      </header>
      <DeskIllustration seat={seat} index={index} />
      <div className="seat-person">
        <strong>{seat.employee?.displayName ?? t("emptySeat")}</strong>
        <span>{seat.employee?.title ?? seat.employee?.role ?? seat.zone}</span>
      </div>
      <footer>
        <SeatStateBadge seat={seat} />
        <span><ClipboardList size={13} /> {seat.task ? blockedBy.length + 1 : 0}</span>
        <span><List size={13} /> {seat.alertKinds.length + (seat.issueStatus ? 1 : 0)}</span>
      </footer>
      <span className={`seat-state-line ${state}`} />
    </button>
  );
}

function DeskIllustration({ seat, index }: { seat: FloorViewSeat; index: number }) {
  const occupied = Boolean(seat.employee);
  const palette = ["blue", "green", "amber", "slate"][index % 4];
  return (
    <div className={`desk-scene ${occupied ? palette : "empty"}`} aria-hidden="true">
      <div className="desk-top">
        <span className="plant" />
        <span className="monitor" />
        <span className="laptop" />
        <span className="paper" />
      </div>
      {occupied ? <span className="agent-head" /> : null}
      <span className="chair" />
    </div>
  );
}

function SeatStateBadge({ seat }: { seat: FloorViewSeat }) {
  const state = deriveSeatState(seat);
  return (
    <span className={`state-badge ${state}`}>
      <i />
      {stateLabel(state)}
    </span>
  );
}

function SeatInspector({
  seat,
  tab,
  setTab,
  onClose,
  totalSeats,
  openPaperclip,
}: {
  seat: (FloorViewSeat & { timeline?: TimelineEvent[] }) | null;
  tab: DetailTab;
  setTab: (tab: DetailTab) => void;
  onClose: () => void;
  totalSeats: number;
  openPaperclip: (path: string) => void;
}) {
  if (!seat) {
    return (
      <aside className="seat-inspector empty">
        <Users size={24} />
        <h2>{t("seatDetails")}</h2>
        <p>{t("selectSeatHint")}</p>
        <small>{t("currentFloorSeats")}：{totalSeats}</small>
      </aside>
    );
  }

  return (
    <aside className="seat-inspector">
      <button className="icon-button close" onClick={onClose} aria-label={t("close")}>x</button>
      <header className="inspector-header">
        <span>{t("seatDetails")}</span>
        <h2>{seat.code}</h2>
        <SeatStateBadge seat={seat} />
        <div className="inspector-agent">
          <div className="large-avatar"><User size={28} /></div>
          <div>
            <strong>{seat.employee?.displayName ?? t("emptySeat")}</strong>
            <small>{seat.employee ? `${seat.employee.team} / ${seat.employee.title ?? seat.employee.role}` : seat.zone}</small>
          </div>
        </div>
      </header>
      <nav className="detail-tabs">
        <button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>{t("status")}</button>
        <button className={tab === "task" ? "active" : ""} onClick={() => setTab("task")}>{t("task")}</button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>{t("activity")}</button>
        <button className={tab === "cost" ? "active" : ""} onClick={() => setTab("cost")}>{t("cost")}</button>
      </nav>
      {tab === "status" ? <StatusPanel seat={seat} /> : null}
      {tab === "task" ? <TaskPanel seat={seat} openPaperclip={openPaperclip} /> : null}
      {tab === "activity" ? <ActivityPanel seat={seat} /> : null}
      {tab === "cost" ? <CostPanel seat={seat} /> : null}
    </aside>
  );
}

function StatusPanel({ seat }: { seat: FloorViewSeat & { timeline?: TimelineEvent[] } }) {
  const activeTaskCount = seat.task ? 1 : 0;
  return (
    <section className="detail-panel">
      <dl className="status-list">
        <div><dt>{t("agentStatus")}</dt><dd><span className={`dot ${deriveSeatState(seat)}`} /> {statusLabel(seat.agentStatus)}</dd></div>
        <div><dt>{t("activeTasks")}</dt><dd>{activeTaskCount}</dd></div>
        <div><dt>{t("blockedTasks")}</dt><dd>{seat.issueStatus === "blocked" ? 1 : 0}</dd></div>
        <div><dt>{t("todayUpdates")}</dt><dd>{Math.max((seat.timeline?.length ?? 0), seat.task ? 1 : 0)}</dd></div>
        <div><dt>{t("monthlySpend")}</dt><dd>{formatMoney(seat.employee?.spentMonthlyCents ?? 0)}</dd></div>
        <div><dt>{t("onlineTime")}</dt><dd>{seat.agentStatus === "running" ? "6.2 小时" : "0 小时"}</dd></div>
        <div><dt>{t("lastActive")}</dt><dd>{seat.agentStatus ? t("minutesAgo") : t("none")}</dd></div>
      </dl>
      {seat.alertKinds.length > 0 ? (
        <div className="alert-stack">
          {seat.alertKinds.map((alert) => (
            <span key={alert}><AlertTriangle size={14} /> {statusLabel(alert)}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TaskPanel({ seat, openPaperclip }: { seat: FloorViewSeat; openPaperclip: (path: string) => void }) {
  if (!seat.task) {
    return <section className="detail-panel empty-panel">{t("noActiveTask")}</section>;
  }
  const blockedBy = getBlockedBy(seat);
  return (
    <section className="detail-panel task-cards">
      <article>
        <span className={`task-status ${seat.task.status}`}>{statusLabel(seat.task.status)}</span>
        <strong>{seat.task.title}</strong>
        <small>{t("issueId")}: {seat.task.identifier}</small>
        <small>{t("priority")}: {statusLabel(seat.task.priority)}</small>
        <button className="link-button" onClick={() => openPaperclip(seat.task?.paperclipUrl ?? "/issues")}>{t("openPaperclip")}</button>
      </article>
      {blockedBy.length > 0 ? (
        <article className="blocked">
          <span className="task-status blocked">{t("blocked")}</span>
          <strong>{t("blockedByDependencies")}</strong>
          <small>{blockedBy.join(", ")}</small>
        </article>
      ) : null}
    </section>
  );
}

function ActivityPanel({ seat }: { seat: FloorViewSeat & { timeline?: TimelineEvent[] } }) {
  const events = seat.timeline ?? [];
  if (events.length === 0) {
    return <section className="detail-panel empty-panel">{t("noRecentActivity")}</section>;
  }
  return (
    <section className="detail-panel timeline">
      {events.slice(0, 8).map((event) => (
        <article key={event.id}>
          <strong>{event.action}</strong>
          <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
        </article>
      ))}
    </section>
  );
}

function CostPanel({ seat }: { seat: FloorViewSeat }) {
  const spent = seat.employee?.spentMonthlyCents ?? 0;
  const budget = seat.employee?.budgetMonthlyCents ?? 0;
  const ratio = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  return (
    <section className="detail-panel cost-panel">
      <div className="cost-total">
        <span>{t("monthlySpendShort")}</span>
        <strong>{formatMoney(spent)}</strong>
        <small>{budget > 0 ? `${t("budgetUsed")} ${ratio}% / ${formatMoney(budget)}` : t("noBudget")}</small>
      </div>
      <div className="progress-track"><span style={{ width: `${ratio}%` }} /></div>
      <p>{t("observerCostHint")}</p>
    </section>
  );
}

function ContextPanel({
  panel,
  floor,
  building,
  viewMode,
  lastSyncedAt,
  clearFilters,
  setViewMode,
  setDetailTab,
  openPaperclip,
}: {
  panel: SidePanel;
  floor: FloorView | null;
  building: BuildingSummary | null;
  viewMode: ViewMode;
  lastSyncedAt: string | null;
  clearFilters: () => void;
  setViewMode: (viewMode: ViewMode) => void;
  setDetailTab: (tab: DetailTab) => void;
  openPaperclip: (path: string) => void;
}) {
  const seats = floor?.seats ?? [];
  const occupiedSeats = seats.filter((seat) => seat.employee).length;
  const title = panelTitle(panel);
  return (
    <section className="context-panel">
      <header>
        <h2>{title}</h2>
        <p>{t("sidePanelHint")}</p>
      </header>
      <div className="context-grid">
        <ContextMetric label={t("visibleSeats")} value={seats.length.toString()} />
        <ContextMetric label={t("occupied")} value={occupiedSeats.toString()} />
        <ContextMetric label={t("blockedTasks")} value={(building?.metrics.blockedTasks ?? 0).toString()} />
        <ContextMetric label={t("currentView")} value={viewModeLabel(viewMode)} />
      </div>
      <div className="context-actions">
        {panel === "overview" || panel === "company" ? <button onClick={() => openPaperclip(`/companies/${building?.companyId ?? ""}`)}>{t("openCompany")}</button> : null}
        {panel === "tasks" ? <button onClick={() => setDetailTab("task")}>{t("task")}</button> : null}
        {panel === "seats" ? <button onClick={() => setViewMode("cards")}>{t("cardGrid")}</button> : null}
        {panel === "floors" || panel === "buildings" ? <button onClick={() => setViewMode("plan")}>{t("floorPlan")}</button> : null}
        {panel === "agents" || panel === "roles" ? <button onClick={() => setDetailTab("status")}>{t("status")}</button> : null}
        {panel === "permissions" || panel === "settings" ? <button onClick={() => clearFilters()}>{t("clearFilters")}</button> : null}
        {panel === "sync" ? <span>{t("lastSyncTime")}：{lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : t("none")}</span> : null}
      </div>
    </section>
  );
}

function ContextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function panelTitle(panel: SidePanel) {
  const labels: Record<SidePanel, I18nKey> = {
    overview: "panelOverview",
    company: "panelCompany",
    buildings: "panelBuildings",
    floors: "panelFloors",
    seats: "panelSeats",
    roles: "panelRoles",
    agents: "panelAgents",
    tasks: "panelTasks",
    permissions: "panelPermissions",
    settings: "panelSettings",
    sync: "panelSync",
  };
  return t(labels[panel]);
}

function viewModeLabel(viewMode: ViewMode) {
  if (viewMode === "plan") return t("floorPlan");
  if (viewMode === "list") return t("listView");
  return t("cardGrid");
}

function buildTeamSummaries(floor: FloorView | null) {
  const counts = new Map<string, number>();
  for (const seat of floor?.seats ?? []) {
    if (!seat.employee) continue;
    counts.set(seat.employee.team, (counts.get(seat.employee.team) ?? 0) + 1);
  }
  const teams = Array.from(counts, ([name, count]) => ({ name, count })).slice(0, 5);
  return teams.length > 0 ? teams : [{ name: "Engineering", count: 0 }, { name: "Operations", count: 0 }];
}

function teamLabel(team: string) {
  if (team === "Leadership") return t("teamLeadership");
  if (team === "Engineering") return t("teamEngineering");
  if (team === "Operations") return t("teamOperations");
  if (team === "Review") return t("teamReview");
  return team;
}

function deriveSeatState(seat: FloorViewSeat): "empty" | "working" | "busy" | "away" | "offline" | "error" {
  if (seat.agentStatus === "error" || seat.alertKinds.includes("agent_error")) return "error";
  if (seat.issueStatus === "blocked") return "busy";
  if (seat.agentStatus === "running") return "working";
  if (seat.agentStatus === "paused") return "away";
  if (seat.occupancyStatus === "offline") return "offline";
  if (seat.occupancyStatus === "empty") return "empty";
  return "working";
}

function stateLabel(state: ReturnType<typeof deriveSeatState>) {
  if (state === "working") return t("working");
  if (state === "busy") return t("busy");
  if (state === "away") return t("away");
  if (state === "offline") return t("offline");
  if (state === "error") return t("exception");
  return t("emptySeat");
}

function getBlockedBy(seat: FloorViewSeat) {
  return Array.isArray(seat.task?.blockedBy) ? seat.task.blockedBy : [];
}

function liveLabel(liveState: LiveState, lastSyncedAt: string | null) {
  if (liveState === "error") return t("syncError");
  if (liveState === "connected") return t("liveSync");
  if (!lastSyncedAt) return t("waitingSync");
  return `${t("syncedAt")} ${new Date(lastSyncedAt).toLocaleTimeString()}`;
}

function compactFilters(filters: FiltersState) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value && value !== "all"));
}

function createEmptyFilters(): FiltersState {
  return {
    query: "",
    team: "all",
    status: "all",
    priority: "all",
    alert: "all",
  };
}

function getInitialViewState() {
  const params = new URLSearchParams(window.location.search);
  return {
    floorId: params.get("floor") ?? "floor-nova-1",
    block: params.get("block") ?? "A座",
    level: params.get("level") ?? "5楼",
    view: normalizeViewMode(params.get("view")),
    panel: normalizeSidePanel(params.get("panel")),
    filters: {
      query: params.get("query") ?? "",
      team: params.get("team") ?? "all",
      status: params.get("status") ?? "all",
      priority: params.get("priority") ?? "all",
      alert: params.get("alert") ?? "all",
    },
  };
}

function normalizeViewMode(value: string | null): ViewMode {
  if (value === "plan" || value === "list") return value;
  return "cards";
}

function normalizeSidePanel(value: string | null): SidePanel {
  const panels: SidePanel[] = ["overview", "company", "buildings", "floors", "seats", "roles", "agents", "tasks", "permissions", "settings", "sync"];
  return panels.includes(value as SidePanel) ? value as SidePanel : "overview";
}

function syncUrl({
  floorId,
  filters,
  block,
  level,
  view,
  panel,
}: {
  floorId: string;
  filters: FiltersState;
  block: string;
  level: string;
  view: ViewMode;
  panel: SidePanel;
}) {
  const params = new URLSearchParams();
  params.set("floor", floorId);
  params.set("block", block);
  params.set("level", level);
  params.set("view", view);
  params.set("panel", panel);
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== "all") params.set(key, value);
  }
  const next = `${window.location.pathname}?${params.toString()}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, "", next);
  }
}
