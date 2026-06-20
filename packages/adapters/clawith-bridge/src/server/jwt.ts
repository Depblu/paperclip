import crypto from "node:crypto";

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function signBridgeJwt(input: {
  secret: string;
  issuer: string;
  audience: string;
  subject: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  runId: string;
  expiresInSec?: number;
  nowSec?: number;
  jwtId?: string;
}): string {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const payload = {
    iss: input.issuer,
    aud: input.audience,
    sub: input.subject,
    company_id: input.companyId,
    agent_id: input.agentId,
    issue_id: input.issueId,
    run_id: input.runId,
    jti: input.jwtId ?? crypto.randomUUID(),
    iat: now,
    exp: now + (input.expiresInSec ?? 300),
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", input.secret)
    .update(signingInput)
    .digest();
  return `${signingInput}.${base64Url(signature)}`;
}
