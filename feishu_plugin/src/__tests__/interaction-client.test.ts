import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PaperclipClient } from "../paperclip/client.js";

const BASE = "http://paperclip.test:3100";
const API_KEY = "test-key-123";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PaperclipClient interaction endpoints", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PaperclipClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new PaperclipClient(BASE, API_KEY, 5000);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listCompanyIssues", () => {
    it("calls GET /api/companies/:companyId/issues with limit and offset", async () => {
      const issues = [{ id: "i-1", title: "Issue 1", identifier: "T-1" }];
      fetchMock.mockResolvedValueOnce(jsonResponse(issues));

      const result = await client.listCompanyIssues("co-1", 50, 100);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/companies/co-1/issues?limit=50&offset=100`);
      expect(opts.method).toBe("GET");
      expect(opts.headers.Authorization).toBe(`Bearer ${API_KEY}`);
      expect(opts.body).toBeUndefined();
      expect(result).toEqual(issues);
    });
  });

  describe("listIssueInteractions", () => {
    it("calls GET /api/issues/:issueId/interactions", async () => {
      const interactions = [{ id: "int-1", kind: "request_confirmation", status: "pending" }];
      fetchMock.mockResolvedValueOnce(jsonResponse(interactions));

      const result = await client.listIssueInteractions("issue-42");

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/issues/issue-42/interactions`);
      expect(opts.method).toBe("GET");
      expect(result).toEqual(interactions);
    });
  });

  describe("findInteraction", () => {
    it("returns matching interaction from list", async () => {
      const interactions = [
        { id: "int-1", kind: "request_confirmation", status: "pending" },
        { id: "int-2", kind: "request_confirmation", status: "accepted" },
      ];
      fetchMock.mockResolvedValueOnce(jsonResponse(interactions));

      const result = await client.findInteraction("issue-1", "int-2");

      expect(result).toEqual(interactions[1]);
    });

    it("returns null when interaction not in list", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([]));

      const result = await client.findInteraction("issue-1", "int-missing");

      expect(result).toBeNull();
    });
  });

  describe("acceptInteraction", () => {
    it("calls POST /api/issues/:issueId/interactions/:id/accept with empty body", async () => {
      const accepted = { id: "int-1", status: "accepted" };
      fetchMock.mockResolvedValueOnce(jsonResponse(accepted));

      const result = await client.acceptInteraction("issue-1", "int-1");

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/issues/issue-1/interactions/int-1/accept`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({});
      expect(result).toEqual(accepted);
    });
  });

  describe("rejectInteraction", () => {
    it("calls POST /api/issues/:issueId/interactions/:id/reject with reason", async () => {
      const rejected = { id: "int-1", status: "rejected" };
      fetchMock.mockResolvedValueOnce(jsonResponse(rejected));

      const result = await client.rejectInteraction("issue-1", "int-1", "not needed");

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/issues/issue-1/interactions/int-1/reject`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({ reason: "not needed" });
      expect(result).toEqual(rejected);
    });

    it("sends empty body when no reason provided", async () => {
      const rejected = { id: "int-1", status: "rejected" };
      fetchMock.mockResolvedValueOnce(jsonResponse(rejected));

      await client.rejectInteraction("issue-1", "int-1");

      const [, opts] = fetchMock.mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({});
    });
  });
});
