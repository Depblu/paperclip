import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { PreviewTokenService } from "../tunnel/preview-token.js";

const SECRET = Buffer.from("test-secret-32-bytes-long-enough");
const BASE_TIME = 1_700_000_000_000;

function makeService(ttlMs = 60_000, now = () => BASE_TIME) {
  return new PreviewTokenService({ ttlMs, secret: SECRET, now });
}

const PAYLOAD = {
  companyId: "co-1",
  issueId: "iss-1",
  key: "plan",
  revisionId: "rev-1",
};

function signedToken(json: string): string {
  const data = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

describe("PreviewTokenService", () => {
  describe("generate + verify round-trip", () => {
    it("produces a valid token that verifies successfully", () => {
      const svc = makeService();
      const token = svc.generate(PAYLOAD);
      const result = svc.verify(token);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.companyId).toBe("co-1");
        expect(result.payload.issueId).toBe("iss-1");
        expect(result.payload.key).toBe("plan");
        expect(result.payload.revisionId).toBe("rev-1");
        expect(result.payload.exp).toBe(BASE_TIME + 60_000);
      }
    });

    it("exp is integer", () => {
      const svc = makeService();
      const token = svc.generate(PAYLOAD);
      const result = svc.verify(token);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(Number.isInteger(result.payload.exp)).toBe(true);
      }
    });
  });

  describe("verify failures", () => {
    it("rejects malformed token without dot", () => {
      const svc = makeService();
      const result = svc.verify("nodothere");
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("malformed");
    });

    it("rejects tampered signature", () => {
      const svc = makeService();
      const token = svc.generate(PAYLOAD);
      const tampered = token.slice(0, -4) + "XXXX";
      const result = svc.verify(tampered);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("signature_mismatch");
    });

    it("rejects token signed with different secret", () => {
      const svc1 = new PreviewTokenService({ ttlMs: 60_000, secret: Buffer.from("secret-A"), now: () => BASE_TIME });
      const svc2 = new PreviewTokenService({ ttlMs: 60_000, secret: Buffer.from("secret-B"), now: () => BASE_TIME });
      const token = svc1.generate(PAYLOAD);
      const result = svc2.verify(token);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("signature_mismatch");
    });

    it("rejects expired token", () => {
      let clock = BASE_TIME;
      const svc = new PreviewTokenService({ ttlMs: 1000, secret: SECRET, now: () => clock });
      const token = svc.generate(PAYLOAD);
      clock = BASE_TIME + 2000;
      const result = svc.verify(token);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("expired");
    });

    it("rejects token with non-integer exp", () => {
      const svc = makeService();
      const payload = { ...PAYLOAD, exp: BASE_TIME + 60_000.5 };
      const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
      const result = svc.verify(`${data}.${sig}`);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("malformed");
    });

    it("rejects token with missing fields", () => {
      const svc = makeService();
      const payload = { companyId: "co-1", issueId: "", key: "plan", revisionId: "rev-1", exp: BASE_TIME + 60_000 };
      const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
      const result = svc.verify(`${data}.${sig}`);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("incomplete");
    });

    it("rejects garbage base64 payload", () => {
      const svc = makeService();
      const data = "!!!not-base64!!!";
      const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
      const result = svc.verify(`${data}.${sig}`);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("malformed");
    });

    it("rejects token with non-string identity fields", () => {
      const svc = makeService();
      const payload = { companyId: 123, issueId: "iss-1", key: "plan", revisionId: "rev-1", exp: BASE_TIME + 60_000 };
      const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
      const result = svc.verify(`${data}.${sig}`);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("incomplete");
    });

    it("rejects validly-signed token whose payload is JSON null", () => {
      const svc = makeService();
      const result = svc.verify(signedToken("null"));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("malformed");
    });

    it("rejects validly-signed token whose payload is an array", () => {
      const svc = makeService();
      const result = svc.verify(signedToken("[1,2,3]"));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe("malformed");
    });

    it("rejects validly-signed token whose payload is a primitive", () => {
      const svc = makeService();
      for (const json of ["42", '"hello"', "true"]) {
        const result = svc.verify(signedToken(json));
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.reason).toBe("malformed");
      }
    });
  });
});
