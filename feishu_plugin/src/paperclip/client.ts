import type { PaperclipApproval, PaperclipComment, PaperclipCompany, PaperclipCompanyDetail, PaperclipDirectoryUser, PaperclipIssue, UserDirectoryResponse } from "../types.js";
import { logger } from "../observability/logger.js";

export class PaperclipClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "PaperclipClientError";
  }
}

export class PaperclipClient {
  private baseUrl: string;

  constructor(
    baseUrl: string,
    private apiKey: string,
    private timeoutMs: number,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429;
        const text = await res.text().catch(() => "");
        logger.warn("paperclip api error", { method, path, status: res.status });
        throw new PaperclipClientError(
          `Paperclip API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`,
          res.status,
          retryable,
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof PaperclipClientError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new PaperclipClientError(`Timeout: ${method} ${path}`, 0, true);
      }
      throw new PaperclipClientError(`Network error: ${method} ${path}: ${err}`, 0, true);
    } finally {
      clearTimeout(timer);
    }
  }

  async listPendingApprovals(companyId: string): Promise<PaperclipApproval[]> {
    return this.request<PaperclipApproval[]>(
      "GET",
      `/api/companies/${companyId}/approvals?status=pending`,
    );
  }

  async getApproval(approvalId: string): Promise<PaperclipApproval> {
    return this.request<PaperclipApproval>("GET", `/api/approvals/${approvalId}`);
  }

  async getApprovalIssues(approvalId: string): Promise<PaperclipIssue[]> {
    return this.request<PaperclipIssue[]>(
      "GET",
      `/api/approvals/${approvalId}/issues`,
    );
  }

  async getApprovalComments(approvalId: string): Promise<PaperclipComment[]> {
    return this.request<PaperclipComment[]>(
      "GET",
      `/api/approvals/${approvalId}/comments`,
    );
  }

  async approve(approvalId: string, decisionNote?: string): Promise<PaperclipApproval> {
    return this.request<PaperclipApproval>("POST", `/api/approvals/${approvalId}/approve`, {
      decisionNote: decisionNote ?? null,
    });
  }

  async reject(approvalId: string, decisionNote?: string): Promise<PaperclipApproval> {
    return this.request<PaperclipApproval>("POST", `/api/approvals/${approvalId}/reject`, {
      decisionNote: decisionNote ?? null,
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<unknown>("GET", "/api/health");
      return true;
    } catch {
      return false;
    }
  }

  async listCompanies(): Promise<PaperclipCompany[]> {
    return this.request<PaperclipCompany[]>("GET", "/api/companies");
  }

  async getCompany(companyId: string): Promise<PaperclipCompanyDetail> {
    return this.request<PaperclipCompanyDetail>("GET", `/api/companies/${companyId}`);
  }

  async listCompanyUsers(companyId: string): Promise<PaperclipDirectoryUser[]> {
    const resp = await this.request<UserDirectoryResponse>(
      "GET",
      `/api/companies/${companyId}/user-directory`,
    );
    return (resp.users ?? [])
      .filter((entry) => entry.user !== null)
      .map((entry) => ({
        id: entry.user!.id,
        name: entry.user!.name,
        email: entry.user!.email,
      }));
  }
}
