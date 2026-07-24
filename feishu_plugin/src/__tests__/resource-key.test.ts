import { describe, it, expect } from "vitest";
import {
  buildInteractionResourceKey,
  parseInteractionResourceKey,
  isInteractionResourceKey,
} from "../approvals/resource-key.js";

describe("resource-key", () => {
  it("builds and parses a valid interaction resource key", () => {
    const key = buildInteractionResourceKey("issue-123", "int-456");
    expect(key).toBe("interaction:issue-123:int-456");
    const parts = parseInteractionResourceKey(key);
    expect(parts).toEqual({ issueId: "issue-123", interactionId: "int-456" });
  });

  it("returns null for approval-style UUID keys", () => {
    expect(parseInteractionResourceKey("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    expect(isInteractionResourceKey("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("returns null for malformed interaction keys", () => {
    expect(parseInteractionResourceKey("interaction:")).toBeNull();
    expect(parseInteractionResourceKey("interaction::int-1")).toBeNull();
    expect(parseInteractionResourceKey("interaction:issue-1:")).toBeNull();
    expect(parseInteractionResourceKey("interaction:issue-1:int-1:extra")).toBeNull();
  });

  it("identifies interaction keys correctly", () => {
    expect(isInteractionResourceKey("interaction:a:b")).toBe(true);
    expect(isInteractionResourceKey("plain-uuid")).toBe(false);
    expect(isInteractionResourceKey("")).toBe(false);
  });
});
