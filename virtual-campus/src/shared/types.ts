export type UserRole = "platform_admin" | "company_owner" | "team_lead" | "observer" | "auditor";

export type SeatOccupancyStatus = "empty" | "occupied" | "reserved" | "offline";
export type AgentRunStatus = "idle" | "running" | "paused" | "error";
export type IssueStatus = "todo" | "in_progress" | "blocked" | "in_review" | "done";
export type IssuePriority = "critical" | "high" | "medium" | "low";
export type AlertKind = "cost_overrun" | "blocked_too_long" | "agent_error" | "approval_pending";
export type PrivacyLevel = "standard" | "restricted";

export interface Campus {
  id: string;
  name: string;
  timezone: string;
  theme: string;
  layoutVersion: number;
}

export interface Building {
  id: string;
  campusId: string;
  companyId: string;
  name: string;
  x: number;
  y: number;
  style: "tower" | "lab" | "studio";
}

export interface Floor {
  id: string;
  buildingId: string;
  level: number;
  name: string;
  capacity: number;
  width: number;
  height: number;
  status: "active" | "draft" | "archived";
}

export interface Seat {
  id: string;
  floorId: string;
  code: string;
  zone: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "desk" | "pod" | "war_room";
  status: SeatOccupancyStatus;
}

export interface SeatAssignment {
  id: string;
  seatId: string;
  employeeId: string;
  validFrom: string;
  validTo: string | null;
  source: "seed" | "layout_import" | "sync";
}
