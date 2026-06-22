import type {
  Building,
  Campus,
  Floor,
  Seat,
  SeatAssignment,
  UserRole,
} from "../shared/types";
import type {
  CampusAlert,
  CampusOverview,
  CompanyCampusMetrics,
  EmployeeProjection,
  FloorView,
  FloorViewSeat,
  TaskProjection,
  TimelineEvent,
  ViewerContext,
  WorkStateSnapshot,
} from "../shared/projections";
import type { PaperclipLiveEvent, PaperclipSnapshot } from "./paperclip-types";

export interface CampusFilters {
  query?: string;
  team?: string;
  status?: string;
  priority?: string;
  alert?: string;
}

export interface CampusStore {
  loadFromPaperclip(snapshot: PaperclipSnapshot): void;
  applyPaperclipEvent(event: PaperclipLiveEvent): boolean;
  getOverview(viewer: ViewerContext): CampusOverview;
  getFloorView(floorId: string, viewer: ViewerContext, filters?: CampusFilters): FloorView;
  getSeatDetail(seatId: string, viewer: ViewerContext): FloorViewSeat & { timeline: TimelineEvent[] };
  getEmployee(employeeId: string, viewer: ViewerContext): EmployeeProjection;
  getTask(taskId: string, viewer: ViewerContext): TaskProjection;
  getCompanyMetrics(companyId: string, viewer: ViewerContext): CompanyCampusMetrics;
  getTimeline(viewer: ViewerContext, entityType?: string, entityId?: string): TimelineEvent[];
}

export function createCampusStore(): CampusStore {
  const state = createInitialCampusState();
  const processedEvents = new Set<string>();

  return {
    loadFromPaperclip(snapshot) {
      syncPaperclipSnapshot(state, snapshot);
    },
    applyPaperclipEvent(event) {
      if (processedEvents.has(event.id)) return false;
      processedEvents.add(event.id);
      applyEvent(state, event);
      return true;
    },
    getOverview(viewer) {
      const campus = state.campuses[0];
      if (!campus) throw new Error("campus_missing");
      return {
        campusId: campus.id,
        campusName: campus.name,
        buildings: state.buildings
          .filter((building) => canReadCompany(viewer, building.companyId))
          .map((building) => ({
            id: building.id,
            companyId: building.companyId,
            floorId: state.floors.find((floor) => floor.buildingId === building.id)?.id ?? "",
            name: building.name,
            style: building.style,
            x: building.x,
            y: building.y,
            metrics: getCompanyMetrics(state, building.companyId, viewer.role),
          })),
      };
    },
    getFloorView(floorId, viewer, filters = {}) {
      const floor = mustFind(state.floors, floorId, "floor_not_found");
      const building = mustFind(state.buildings, floor.buildingId, "building_not_found");
      assertCompanyAccess(viewer, building.companyId);
      const seats = state.seats
        .filter((seat) => seat.floorId === floorId)
        .map((seat) => buildFloorSeat(state, seat, viewer.role))
        .filter((seat) => matchesFilters(seat, filters));
      return {
        floorId: floor.id,
        companyId: building.companyId,
        buildingName: building.name,
        floorName: floor.name,
        width: floor.width,
        height: floor.height,
        zones: [...new Set(seats.map((seat) => seat.zone))],
        seats,
        metrics: getCompanyMetrics(state, building.companyId, viewer.role),
      };
    },
    getSeatDetail(seatId, viewer) {
      const seat = mustFind(state.seats, seatId, "seat_not_found");
      const floor = mustFind(state.floors, seat.floorId, "floor_not_found");
      const building = mustFind(state.buildings, floor.buildingId, "building_not_found");
      assertCompanyAccess(viewer, building.companyId);
      const detail = buildFloorSeat(state, seat, viewer.role);
      const timeline = getVisibleTimeline(state, viewer)
        .filter((event) => {
          if (event.entityType === "seat" && event.entityId === seatId) return true;
          if (detail.employee && event.entityId === detail.employee.id) return true;
          if (detail.task && event.entityId === detail.task.id) return true;
          return false;
        })
        .slice(0, 20);
      return { ...detail, timeline };
    },
    getEmployee(employeeId, viewer) {
      const employee = mustFind(state.employees, employeeId, "employee_not_found");
      assertCompanyAccess(viewer, employee.companyId);
      return maskEmployee(employee, viewer.role);
    },
    getTask(taskId, viewer) {
      const task = mustFind(state.tasks, taskId, "task_not_found");
      assertCompanyAccess(viewer, task.companyId);
      return maskTask(task, viewer.role);
    },
    getCompanyMetrics(companyId, viewer) {
      assertCompanyAccess(viewer, companyId);
      return getCompanyMetrics(state, companyId, viewer.role);
    },
    getTimeline(viewer, entityType, entityId) {
      return getVisibleTimeline(state, viewer).filter((event) => {
        if (entityType && event.entityType !== entityType) return false;
        if (entityId && event.entityId !== entityId) return false;
        return true;
      });
    },
  };
}

interface CampusState {
  campuses: Campus[];
  buildings: Building[];
  floors: Floor[];
  seats: Seat[];
  assignments: SeatAssignment[];
  employees: EmployeeProjection[];
  tasks: TaskProjection[];
  snapshots: WorkStateSnapshot[];
  timeline: TimelineEvent[];
  alerts: CampusAlert[];
  companies: Map<string, { id: string; name: string; budgetMonthlyCents: number; spentMonthlyCents: number }>;
  pendingApprovals: Map<string, number>;
}

function createInitialCampusState(): CampusState {
  return {
    campuses: [{ id: "campus-main", name: "Virtual Software Campus", timezone: "UTC", theme: "paperclip", layoutVersion: 1 }],
    buildings: [
      { id: "building-nova", campusId: "campus-main", companyId: "company-nova", name: "Nova Apps Tower", x: 140, y: 120, style: "tower" },
      { id: "building-orbit", campusId: "campus-main", companyId: "company-orbit", name: "Orbit Systems Lab", x: 420, y: 170, style: "lab" },
    ],
    floors: [
      { id: "floor-nova-1", buildingId: "building-nova", level: 1, name: "Nova Engineering Floor", capacity: 1000, width: 1200, height: 720, status: "active" },
      { id: "floor-orbit-1", buildingId: "building-orbit", level: 1, name: "Orbit Operations Floor", capacity: 200, width: 980, height: 620, status: "active" },
    ],
    seats: createSeats(),
    assignments: [],
    employees: [],
    tasks: [],
    snapshots: [],
    timeline: [],
    alerts: [],
    companies: new Map(),
    pendingApprovals: new Map(),
  };
}

function createSeats(): Seat[] {
  const seats: Seat[] = [];
  const zones = ["Platform", "Product", "Ops", "Review"];
  for (let row = 0; row < 25; row += 1) {
    for (let col = 0; col < 40; col += 1) {
      seats.push({
        id: `seat-nova-${row}-${col}`,
        floorId: "floor-nova-1",
        code: `N-${row + 1}-${col + 1}`,
        zone: zones[Math.floor(col / 10)] ?? "Platform",
        x: 36 + col * 28,
        y: 42 + row * 24,
        width: 18,
        height: 14,
        type: col % 11 === 0 ? "pod" : "desk",
        status: "empty",
      });
    }
  }

  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 20; col += 1) {
      seats.push({
        id: `seat-orbit-${row}-${col}`,
        floorId: "floor-orbit-1",
        code: `O-${row + 1}-${col + 1}`,
        zone: col < 10 ? "Research" : "Operations",
        x: 42 + col * 42,
        y: 52 + row * 44,
        width: 24,
        height: 22,
        type: col % 9 === 0 ? "war_room" : "desk",
        status: "empty",
      });
    }
  }
  return seats;
}

function buildLayout(snapshot: PaperclipSnapshot) {
  if (snapshot.companies.length === 0) {
    return { buildings: createInitialCampusState().buildings, floors: createInitialCampusState().floors, seats: createSeats() };
  }
  const buildings: Building[] = [];
  const floors: Floor[] = [];
  const seats: Seat[] = [];
  snapshot.companies.forEach((company, index) => {
    const buildingId = `building-${company.id}`;
    const floorId = `floor-${company.id}-1`;
    const agentCount = snapshot.agents.filter((agent) => agent.companyId === company.id).length;
    const capacity = company.id === "company-nova" ? 1000 : Math.max(120, Math.ceil(Math.max(agentCount, 1) / 20) * 40);
    buildings.push({
      id: buildingId,
      campusId: "campus-main",
      companyId: company.id,
      name: `${company.name} Building`,
      x: 120 + (index % 4) * 280,
      y: 120 + Math.floor(index / 4) * 180,
      style: index % 3 === 0 ? "tower" : index % 3 === 1 ? "lab" : "studio",
    });
    floors.push({
      id: floorId,
      buildingId,
      level: 1,
      name: `${company.name} Operations Floor`,
      capacity,
      width: capacity >= 1000 ? 1200 : 980,
      height: capacity >= 1000 ? 720 : 620,
      status: "active",
    });
    seats.push(...createCompanySeats(company.id, floorId, capacity));
  });
  return { buildings, floors, seats };
}

function createCompanySeats(companyId: string, floorId: string, capacity: number): Seat[] {
  const seats: Seat[] = [];
  const columns = capacity >= 1000 ? 40 : 20;
  const seatWidth = capacity >= 1000 ? 18 : 24;
  const seatHeight = capacity >= 1000 ? 14 : 22;
  const stepX = capacity >= 1000 ? 28 : 42;
  const stepY = capacity >= 1000 ? 24 : 44;
  const zones = ["Leadership", "Engineering", "Operations", "Review"];
  for (let index = 0; index < capacity; index += 1) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    seats.push({
      id: `seat-${companyId}-${row}-${col}`,
      floorId,
      code: `${companyId.slice(0, 3).toUpperCase()}-${row + 1}-${col + 1}`,
      zone: zones[Math.min(Math.floor((col / columns) * zones.length), zones.length - 1)] ?? "Engineering",
      x: 36 + col * stepX,
      y: 42 + row * stepY,
      width: seatWidth,
      height: seatHeight,
      type: col % 11 === 0 ? "pod" : "desk",
      status: "empty",
    });
  }
  return seats;
}

function syncPaperclipSnapshot(state: CampusState, snapshot: PaperclipSnapshot) {
  state.companies.clear();
  state.pendingApprovals.clear();
  for (const company of snapshot.companies) {
    state.companies.set(company.id, {
      id: company.id,
      name: company.name,
      budgetMonthlyCents: company.budgetMonthlyCents,
      spentMonthlyCents: company.spentMonthlyCents,
    });
  }
  for (const dashboard of snapshot.dashboards) {
    state.pendingApprovals.set(dashboard.companyId, dashboard.pendingApprovals);
  }

  const layout = buildLayout(snapshot);
  state.buildings = layout.buildings;
  state.floors = layout.floors;
  state.seats = layout.seats;

  state.employees = snapshot.agents.map((agent) => ({
    id: `employee-${agent.id}`,
    companyId: agent.companyId,
    kind: "agent",
    paperclipAgentId: agent.id,
    displayName: agent.name,
    role: agent.role,
    title: agent.title,
    managerId: agent.reportsTo ? `employee-${agent.reportsTo}` : null,
    team: agent.role === "ceo" || agent.role === "cto" ? "Leadership" : "Engineering",
    agentStatus: agent.status,
    privacyLevel: agent.status === "error" ? "restricted" : "standard",
    spentMonthlyCents: agent.spentMonthlyCents,
    budgetMonthlyCents: agent.budgetMonthlyCents,
  }));

  state.tasks = snapshot.issues.map((issue) => ({
    id: `task-${issue.id}`,
    companyId: issue.companyId,
    paperclipIssueId: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assigneeEmployeeId: issue.assigneeAgentId ? `employee-${issue.assigneeAgentId}` : null,
    blockedBy: Array.isArray(issue.blockedBy) ? issue.blockedBy : [],
    paperclipUrl: `/issues/${issue.id}`,
    updatedAt: issue.updatedAt,
  }));

  state.assignments = buildAssignments(state.employees, state.seats);
  state.seats = state.seats.map((seat) => ({
    ...seat,
    status: state.assignments.some((assignment) => assignment.seatId === seat.id) ? "occupied" : seat.status,
  }));
  state.timeline = snapshot.activity.map((activity) => ({
    id: `timeline-${activity.id}`,
    companyId: activity.companyId,
    entityType: normalizeEntityType(activity.entityType),
    entityId: activity.entityId.startsWith("issue-") ? `task-${activity.entityId}` : activity.entityId,
    action: activity.action,
    payload: activity.details,
    sourceEventId: activity.id,
    createdAt: activity.createdAt,
  }));
  state.alerts = buildAlerts(state);
  state.snapshots = buildSnapshots(state);
}

function buildAssignments(employees: EmployeeProjection[], seats: Seat[]): SeatAssignment[] {
  const usedByCompany = new Map<string, number>();
  return employees.map((employee) => {
    const companySeats = seats.filter((seat) => seat.id.startsWith(`seat-${employee.companyId}-`));
    const index = usedByCompany.get(employee.companyId) ?? 0;
    usedByCompany.set(employee.companyId, index + 1);
    return {
      id: `assignment-${employee.id}`,
      seatId: companySeats[index]?.id ?? companySeats[0]?.id ?? seats[0]?.id ?? "seat-missing",
      employeeId: employee.id,
      validFrom: "2026-06-21T00:00:00.000Z",
      validTo: null,
      source: "seed",
    };
  });
}

function buildSnapshots(state: CampusState): WorkStateSnapshot[] {
  return state.assignments.map((assignment) => {
    const employee = state.employees.find((item) => item.id === assignment.employeeId) ?? null;
    const task = employee ? state.tasks.find((item) => item.assigneeEmployeeId === employee.id) ?? null : null;
    return {
      id: `snapshot-${assignment.id}`,
      companyId: employee?.companyId ?? "unknown",
      employeeId: employee?.id ?? null,
      seatId: assignment.seatId,
      taskId: task?.id ?? null,
      agentStatus: employee?.agentStatus ?? null,
      issueStatus: task?.status ?? null,
      activeRunId: employee?.agentStatus === "running" ? `run-${employee.id}` : null,
      costCents: employee?.spentMonthlyCents ?? 0,
      capturedAt: new Date().toISOString(),
    };
  });
}

function buildAlerts(state: CampusState): CampusAlert[] {
  const alerts: CampusAlert[] = [];
  for (const task of state.tasks) {
    if (task.status === "blocked") {
      alerts.push({
        id: `alert-blocked-${task.id}`,
        companyId: task.companyId,
        kind: "blocked_too_long",
        severity: task.priority === "critical" ? "critical" : "high",
        title: `${task.identifier} blocked`,
        entityId: task.id,
        createdAt: task.updatedAt,
      });
    }
  }
  for (const employee of state.employees) {
    if (employee.agentStatus === "error") {
      alerts.push({
        id: `alert-agent-${employee.id}`,
        companyId: employee.companyId,
        kind: "agent_error",
        severity: "high",
        title: `${employee.displayName} needs attention`,
        entityId: employee.id,
        createdAt: new Date().toISOString(),
      });
    }
  }
  for (const company of state.companies.values()) {
    if (company.budgetMonthlyCents > 0 && company.spentMonthlyCents / company.budgetMonthlyCents >= 0.9) {
      alerts.push({
        id: `alert-cost-${company.id}`,
        companyId: company.id,
        kind: "cost_overrun",
        severity: "medium",
        title: "Monthly spend is above 90%",
        entityId: company.id,
        createdAt: new Date().toISOString(),
      });
    }
    const approvals = state.pendingApprovals.get(company.id) ?? 0;
    if (approvals > 0) {
      alerts.push({
        id: `alert-approval-${company.id}`,
        companyId: company.id,
        kind: "approval_pending",
        severity: "medium",
        title: `${approvals} approvals pending`,
        entityId: company.id,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return alerts;
}

function applyEvent(state: CampusState, event: PaperclipLiveEvent) {
  if (event.type === "agent.status") {
    state.employees = state.employees.map((employee) =>
      employee.paperclipAgentId === event.agentId ? { ...employee, agentStatus: event.status } : employee,
    );
    state.timeline.unshift({
      id: `timeline-${event.id}`,
      companyId: event.companyId,
      entityType: "employee",
      entityId: `employee-${event.agentId}`,
      action: event.type,
      payload: { status: event.status },
      sourceEventId: event.id,
      createdAt: event.createdAt,
    });
  }
  if (event.type === "issue.updated") {
    state.tasks = state.tasks.map((task) =>
      task.paperclipIssueId === event.issueId ? { ...task, status: event.status, updatedAt: event.createdAt } : task,
    );
    state.timeline.unshift({
      id: `timeline-${event.id}`,
      companyId: event.companyId,
      entityType: "task",
      entityId: `task-${event.issueId}`,
      action: event.type,
      payload: { status: event.status },
      sourceEventId: event.id,
      createdAt: event.createdAt,
    });
  }
  if (event.type === "activity.logged") {
    state.timeline.unshift({
      id: `timeline-${event.activity.id}`,
      companyId: event.companyId,
      entityType: normalizeEntityType(event.activity.entityType),
      entityId: event.activity.entityId,
      action: event.activity.action,
      payload: event.activity.details,
      sourceEventId: event.activity.id,
      createdAt: event.activity.createdAt,
    });
  }
  state.alerts = buildAlerts(state);
  state.snapshots = buildSnapshots(state);
}

function buildFloorSeat(state: CampusState, seat: Seat, role: UserRole): FloorViewSeat {
  const assignment = state.assignments.find((item) => item.seatId === seat.id && !item.validTo) ?? null;
  const employee = assignment ? state.employees.find((item) => item.id === assignment.employeeId) ?? null : null;
  const task = employee ? state.tasks.find((item) => item.assigneeEmployeeId === employee.id) ?? null : null;
  const alertKinds = state.alerts
    .filter((alert) => alert.entityId === employee?.id || alert.entityId === task?.id || alert.entityId === employee?.companyId)
    .map((alert) => alert.kind);
  return {
    id: seat.id,
    code: seat.code,
    zone: seat.zone,
    x: seat.x,
    y: seat.y,
    width: seat.width,
    height: seat.height,
    type: seat.type,
    occupancyStatus: seat.status,
    agentStatus: employee?.agentStatus ?? null,
    issueStatus: task?.status ?? null,
    alertKinds,
    employee: employee ? maskEmployee(employee, role) : null,
    task: task ? maskTask(task, role) : null,
  };
}

function getCompanyMetrics(state: CampusState, companyId: string, role: UserRole): CompanyCampusMetrics {
  const company = state.companies.get(companyId);
  const employees = state.employees.filter((employee) => employee.companyId === companyId);
  const tasks = state.tasks.filter((task) => task.companyId === companyId);
  const alerts = state.alerts.filter((alert) => alert.companyId === companyId);
  return {
    companyId,
    companyName: company?.name ?? companyId,
    agentCount: employees.length,
    runningAgents: employees.filter((employee) => employee.agentStatus === "running").length,
    blockedTasks: tasks.filter((task) => task.status === "blocked").length,
    pendingApprovals: state.pendingApprovals.get(companyId) ?? 0,
    spentMonthlyCents: role === "observer" ? Math.round((company?.spentMonthlyCents ?? 0) / 10000) * 10000 : company?.spentMonthlyCents ?? 0,
    budgetMonthlyCents: company?.budgetMonthlyCents ?? 0,
    alerts,
  };
}

function matchesFilters(seat: FloorViewSeat, filters: CampusFilters) {
  const query = filters.query?.trim().toLowerCase();
  if (query) {
    const haystack = [seat.code, seat.zone, seat.employee?.displayName, seat.employee?.role, seat.task?.identifier, seat.task?.title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (filters.team && filters.team !== "all" && seat.employee?.team !== filters.team) return false;
  if (filters.status && filters.status !== "all") {
    if (seat.agentStatus !== filters.status && seat.issueStatus !== filters.status && seat.occupancyStatus !== filters.status) return false;
  }
  if (filters.priority && filters.priority !== "all" && seat.task?.priority !== filters.priority) return false;
  if (filters.alert && filters.alert !== "all" && !seat.alertKinds.includes(filters.alert as never)) return false;
  return true;
}

function maskEmployee(employee: EmployeeProjection, role: UserRole): EmployeeProjection {
  if (role !== "observer") return employee;
  return {
    ...employee,
    displayName: employee.privacyLevel === "restricted" ? "Restricted agent" : employee.title ?? employee.role,
    spentMonthlyCents: Math.round(employee.spentMonthlyCents / 10000) * 10000,
  };
}

function maskTask(task: TaskProjection, role: UserRole): TaskProjection {
  if (role !== "observer") return task;
  return {
    ...task,
    title: task.priority === "critical" ? "Restricted high-priority task" : task.title,
  };
}

function getVisibleTimeline(state: CampusState, viewer: ViewerContext) {
  return state.timeline
    .filter((event) => canReadCompany(viewer, event.companyId))
    .map((event) => (viewer.role === "observer" ? { ...event, payload: maskPayload(event.payload) } : event))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function maskPayload(payload: Record<string, unknown>) {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/secret|token|email|account|payload/i.test(key)) {
      masked[key] = "[masked]";
      continue;
    }
    masked[key] = value;
  }
  return masked;
}

function normalizeEntityType(entityType: string): TimelineEvent["entityType"] {
  if (entityType === "issue") return "task";
  if (entityType === "agent") return "employee";
  if (entityType === "approval") return "approval";
  if (entityType === "cost") return "cost";
  return "company";
}

function canReadCompany(viewer: ViewerContext, companyId: string) {
  return viewer.role === "platform_admin" || viewer.companyIds.length === 0 || viewer.companyIds.includes(companyId);
}

function assertCompanyAccess(viewer: ViewerContext, companyId: string) {
  if (!canReadCompany(viewer, companyId)) throw new Error("forbidden");
}

function mustFind<T extends { id: string }>(items: T[], id: string, message: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(message);
  return item;
}
