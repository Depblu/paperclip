import { describe, it, expect } from "vitest";
import { renderConfirmationCard } from "../feishu/card-renderer.js";
import type { PaperclipInteraction } from "../types.js";

const DOC_URL = "https://abc-123.trycloudflare.com/preview/document?token=signed";

function makeInteraction(detailsMarkdown: string, withKey = true): PaperclipInteraction {
  const target: Record<string, unknown> = withKey
    ? { type: "issue_document", label: "plan.md", key: "plan", revisionId: "rev-1" }
    : { type: "issue_document", revisionId: "rev-1" };
  return {
    id: "int-1",
    companyId: "co-1",
    issueId: "issue-1",
    kind: "request_confirmation",
    status: "pending",
    payload: { prompt: "Confirm?", detailsMarkdown, target },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function detailsContent(cardJson: string): string {
  const card = JSON.parse(cardJson) as { elements: { tag: string; content?: string }[] };
  const el = card.elements.find((e) => e.tag === "markdown" && typeof e.content === "string" && e.content.startsWith("**详情**"));
  return el?.content ?? "";
}

describe("renderConfirmationCard documentUrl link rewriting", () => {
  it("replaces matching fragment link href with documentUrl", () => {
    const json = renderConfirmationCard(makeInteraction("请看 [查看文档](#document-plan) 谢谢"), "tok", undefined, DOC_URL);
    const content = detailsContent(json);
    expect(content).toContain(`[查看文档](${DOC_URL})`);
    expect(content).not.toContain("(#document-plan)");
  });

  it("degrades matching fragment link to plain text when no documentUrl", () => {
    const json = renderConfirmationCard(makeInteraction("请看 [查看文档](#document-plan) 谢谢"), "tok");
    const content = detailsContent(json);
    expect(content).toContain("查看文档");
    expect(content).not.toContain("[查看文档](");
    expect(content).not.toContain("(#document-plan)");
  });

  it("leaves absolute links unchanged even with documentUrl", () => {
    const md = "[ext](https://example.com/#document-plan)";
    const json = renderConfirmationCard(makeInteraction(md), "tok", undefined, DOC_URL);
    expect(detailsContent(json)).toContain("[ext](https://example.com/#document-plan)");
  });

  it("leaves protocol-relative host links unchanged", () => {
    const md = "[ext](//cdn.example.com/#document-plan)";
    const json = renderConfirmationCard(makeInteraction(md), "tok", undefined, DOC_URL);
    expect(detailsContent(json)).toContain("[ext](//cdn.example.com/#document-plan)");
  });

  it("leaves links with a different fragment unchanged", () => {
    const md = "[x](#document-other)";
    const json = renderConfirmationCard(makeInteraction(md), "tok", undefined, DOC_URL);
    expect(detailsContent(json)).toContain("[x](#document-other)");
  });

  it("rewrites relative path links whose fragment matches", () => {
    const md = "[x](/preview#document-plan)";
    const json = renderConfirmationCard(makeInteraction(md), "tok", undefined, DOC_URL);
    expect(detailsContent(json)).toContain(`[x](${DOC_URL})`);
  });

  it("preserves link title when replacing href", () => {
    const md = `[x](#document-plan "标题")`;
    const json = renderConfirmationCard(makeInteraction(md), "tok", undefined, DOC_URL);
    expect(detailsContent(json)).toContain(`[x](${DOC_URL} "标题")`);
  });

  it("leaves markdown unchanged when target has no key", () => {
    const md = "[查看文档](#document-plan)";
    const json = renderConfirmationCard(makeInteraction(md, false), "tok", undefined, DOC_URL);
    expect(detailsContent(json)).toContain("[查看文档](#document-plan)");
  });

  it("leaves matching fragment link unchanged when target.type is not issue_document", () => {
    const interaction: PaperclipInteraction = {
      id: "int-1",
      companyId: "co-1",
      issueId: "issue-1",
      kind: "request_confirmation",
      status: "pending",
      payload: {
        prompt: "Confirm?",
        detailsMarkdown: "请看 [查看文档](#document-plan) 谢谢",
        target: { type: "issue", label: "plan.md", key: "plan", revisionId: "rev-1" },
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const json = renderConfirmationCard(interaction, "tok", undefined, DOC_URL);
    const content = detailsContent(json);
    expect(content).toContain("[查看文档](#document-plan)");
    expect(content).not.toContain(DOC_URL);
  });

  it("leaves matching fragment link unchanged when target is an array", () => {
    const interaction: PaperclipInteraction = {
      id: "int-1",
      companyId: "co-1",
      issueId: "issue-1",
      kind: "request_confirmation",
      status: "pending",
      payload: {
        prompt: "Confirm?",
        detailsMarkdown: "请看 [查看文档](#document-plan) 谢谢",
        target: [{ type: "issue_document", key: "plan" }],
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const json = renderConfirmationCard(interaction, "tok", undefined, DOC_URL);
    expect(detailsContent(json)).toContain("[查看文档](#document-plan)");
  });
});
