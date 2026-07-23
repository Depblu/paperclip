import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const uiDir = resolve(import.meta.dirname, "../../ui");
const app = readFileSync(resolve(uiDir, "app.js"), "utf-8");
const html = readFileSync(resolve(uiDir, "index.html"), "utf-8");

describe("route test wait UI", () => {
  it("polls test sessions and exposes manual cancellation", () => {
    expect(app).toContain("/api/feishu/test-sessions/${encodeURIComponent(state.sessionId)}");
    expect(app).toContain("/cancel");
    expect(app).toContain("取消等待");
    expect(app).toContain("审批结果：");
  });

  it("shows timeout and terminal result states in each route block", () => {
    expect(app).toContain("等待超时（600 秒）");
    expect(app).toContain("test-card-status");
    expect(html).toContain(".test-status-pending");
    expect(html).toContain(".test-status-approved");
    expect(html).toContain(".test-status-rejected");
    expect(html).toContain(".test-status-cancelled");
    expect(html).toContain(".test-status-timed_out");
  });
});
