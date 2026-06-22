import type { AgentRunStatus, IssuePriority, IssueStatus } from "../shared/types";

export interface PaperclipCompany {
  id: string;
  name: string;
  issuePrefix: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
}

export interface PaperclipAgent {
  id: string;
  companyId: string;
  name: string;
  role: string;
  title: string | null;
  status: AgentRunStatus;
  reportsTo: string | null;
  spentMonthlyCents: number;
  budgetMonthlyCents: number;
}

export interface PaperclipIssue {
  id: string;
  companyId: string;
  identifier: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeAgentId: string | null;
  blockedBy?: string[];
  updatedAt: string;
}

export interface PaperclipActivity {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface PaperclipDashboard {
  companyId: string;
  pendingApprovals: number;
}

export interface PaperclipSnapshot {
  companies: PaperclipCompany[];
  agents: PaperclipAgent[];
  issues: PaperclipIssue[];
  activity: PaperclipActivity[];
  dashboards: PaperclipDashboard[];
}

export type PaperclipLiveEvent =
  | {
      id: string;
      companyId: string;
      type: "agent.status";
      agentId: string;
      status: AgentRunStatus;
      createdAt: string;
    }
  | {
      id: string;
      companyId: string;
      type: "issue.updated";
      issueId: string;
      status: IssueStatus;
      createdAt: string;
    }
  | {
      id: string;
      companyId: string;
      type: "activity.logged";
      activity: PaperclipActivity;
      createdAt: string;
    };
