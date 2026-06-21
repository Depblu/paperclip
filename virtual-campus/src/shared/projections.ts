import type {
  AgentRunStatus,
  AlertKind,
  IssuePriority,
  IssueStatus,
  PrivacyLevel,
  SeatOccupancyStatus,
  UserRole,
} from "./types";

export interface EmployeeProjection {
  id: string;
  companyId: string;
  kind: "agent" | "human";
  paperclipAgentId: string | null;
  displayName: string;
  role: string;
  title: string | null;
  managerId: string | null;
  team: string;
  agentStatus: AgentRunStatus;
  privacyLevel: PrivacyLevel;
  spentMonthlyCents: number;
  budgetMonthlyCents: number;
}

export interface TaskProjection {
  id: string;
  companyId: string;
  paperclipIssueId: string;
  identifier: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeEmployeeId: string | null;
  blockedBy: string[];
  paperclipUrl: string;
  updatedAt: string;
}

export interface WorkStateSnapshot {
  id: string;
  companyId: string;
  employeeId: string | null;
  seatId: string | null;
  taskId: string | null;
  agentStatus: AgentRunStatus | null;
  issueStatus: IssueStatus | null;
  activeRunId: string | null;
  costCents: number;
  capturedAt: string;
}

export interface TimelineEvent {
  id: string;
  companyId: string;
  entityType: "company" | "employee" | "seat" | "task" | "approval" | "cost";
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  sourceEventId: string;
  createdAt: string;
}

export interface CampusAlert {
  id: string;
  companyId: string;
  kind: AlertKind;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  entityId: string;
  createdAt: string;
}

export interface ViewerContext {
  role: UserRole;
  companyIds: string[];
}

export interface CampusOverview {
  campusId: string;
  campusName: string;
  buildings: BuildingSummary[];
}

export interface BuildingSummary {
  id: string;
  companyId: string;
  floorId: string;
  name: string;
  style: string;
  x: number;
  y: number;
  metrics: CompanyCampusMetrics;
}

export interface CompanyCampusMetrics {
  companyId: string;
  companyName: string;
  agentCount: number;
  runningAgents: number;
  blockedTasks: number;
  pendingApprovals: number;
  spentMonthlyCents: number;
  budgetMonthlyCents: number;
  alerts: CampusAlert[];
}

export interface FloorViewSeat {
  id: string;
  code: string;
  zone: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  occupancyStatus: SeatOccupancyStatus;
  agentStatus: AgentRunStatus | null;
  issueStatus: IssueStatus | null;
  alertKinds: AlertKind[];
  employee: EmployeeProjection | null;
  task: TaskProjection | null;
}

export interface FloorView {
  floorId: string;
  companyId: string;
  buildingName: string;
  floorName: string;
  width: number;
  height: number;
  zones: string[];
  seats: FloorViewSeat[];
  metrics: CompanyCampusMetrics;
}
