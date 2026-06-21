import type {
  PaperclipActivity,
  PaperclipAgent,
  PaperclipCompany,
  PaperclipDashboard,
  PaperclipIssue,
  PaperclipSnapshot,
} from "./paperclip-types";
import { createMockPaperclipSnapshot } from "./mock-paperclip";

export interface PaperclipClient {
  snapshot(): Promise<PaperclipSnapshot>;
}

export function createPaperclipClient(): PaperclipClient {
  const baseUrl = process.env.PAPERCLIP_API_BASE_URL;
  if (!baseUrl) {
    return { snapshot: async () => createMockPaperclipSnapshot() };
  }
  return new RestPaperclipClient(baseUrl, process.env.PAPERCLIP_API_TOKEN ?? null);
}

class RestPaperclipClient implements PaperclipClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null,
  ) {}

  async snapshot(): Promise<PaperclipSnapshot> {
    const companies = await this.get<PaperclipCompany[]>("/api/companies");
    const perCompany = await Promise.all(companies.map((company) => this.getCompanySnapshot(company)));
    return {
      companies,
      agents: perCompany.flatMap((item) => item.agents),
      issues: perCompany.flatMap((item) => item.issues),
      activity: perCompany.flatMap((item) => item.activity),
      dashboards: perCompany.map((item) => item.dashboard),
    };
  }

  private async getCompanySnapshot(company: PaperclipCompany) {
    const [agents, issues, activity, dashboard] = await Promise.all([
      this.get<PaperclipAgent[]>(`/api/companies/${company.id}/agents`),
      this.get<PaperclipIssue[]>(`/api/companies/${company.id}/issues`),
      this.get<PaperclipActivity[]>(`/api/companies/${company.id}/activity`),
      this.get<PaperclipDashboard>(`/api/companies/${company.id}/dashboard`),
    ]);
    return { agents, issues, activity, dashboard: { companyId: company.id, pendingApprovals: dashboard.pendingApprovals ?? 0 } };
  }

  private async get<T>(pathname: string): Promise<T> {
    const response = await fetch(new URL(pathname, this.baseUrl), {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : undefined,
    });
    if (!response.ok) {
      throw new Error(`paperclip_request_failed_${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}
