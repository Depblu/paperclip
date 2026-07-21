import type { ApproverConfig, CompanyConfig } from "../types.js";

const NON_ACTIONABLE_TYPES = new Set(["budget_override_required"]);

export function isActionable(approvalType: string): boolean {
  return !NON_ACTIONABLE_TYPES.has(approvalType);
}

export function resolveApprovers(company: CompanyConfig, approvalType: string): ApproverConfig[] {
  const typeRouting = company.routing[approvalType];
  if (typeRouting && Array.isArray(typeRouting.approvers) && typeRouting.approvers.length > 0) {
    return typeRouting.approvers;
  }
  return company.defaultApprovers;
}

export function isAuthorizedApprover(
  company: CompanyConfig,
  approvalType: string,
  openId: string,
): boolean {
  const approvers = resolveApprovers(company, approvalType);
  return approvers.some((a) => a.openId === openId);
}

export function findCompanyConfig(
  companies: CompanyConfig[],
  companyId: string,
): CompanyConfig | undefined {
  return companies.find((c) => c.companyId === companyId);
}
