import { describe, expect, it } from "vitest";
import type { AdapterConfigSchema, ConfigFieldSchema } from "@paperclipai/adapter-utils";
import { fieldMatchesVisibleWhen, getRemoteOptionConfigWrites } from "./schema-config-fields";

const sourceField: ConfigFieldSchema = {
  key: "provider",
  label: "Provider",
  type: "select",
  options: [
    { label: "Claude", value: "claude" },
    { label: "Codex", value: "codex" },
  ],
};

const schema: AdapterConfigSchema = {
  fields: [sourceField],
};

function targetWithVisibleWhen(visibleWhen: Record<string, unknown>): ConfigFieldSchema {
  return {
    key: "model",
    label: "Model",
    type: "text",
    meta: { visibleWhen },
  };
}

describe("fieldMatchesVisibleWhen", () => {
  it("treats an empty values array as no match", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: [] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(false);
  });

  it("treats all non-string values as no match", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: [null, 42] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(false);
  });

  it("matches non-empty string values", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: ["claude"] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(true);
    expect(fieldMatchesVisibleWhen(field, () => "codex", schema)).toBe(false);
  });
});

describe("getRemoteOptionConfigWrites", () => {
  it("writes the selected remote option and hidden Clawith link ids", () => {
    const field: ConfigFieldSchema = {
      key: "clawithAgentLink",
      label: "Clawith agent",
      type: "select",
    };

    expect(getRemoteOptionConfigWrites(field, "tenant-1:agent-1", {
      label: "Support Agent (Tenant One)",
      value: "tenant-1:agent-1",
      setConfig: {
        clawithTenantId: "tenant-1",
        clawithAgentId: "agent-1",
      },
    })).toEqual({
      clawithAgentLink: "tenant-1:agent-1",
      clawithTenantId: "tenant-1",
      clawithAgentId: "agent-1",
    });
  });

  it("writes native Clawith agent dropdown selection to the hidden agent id", () => {
    const field: ConfigFieldSchema = {
      key: "nativeClawithAgentLink",
      label: "Clawith agent",
      type: "select",
    };

    expect(getRemoteOptionConfigWrites(field, "agent-1", {
      label: "QA Agent",
      value: "agent-1",
      setConfig: {
        clawithAgentId: "agent-1",
      },
    })).toEqual({
      nativeClawithAgentLink: "agent-1",
      clawithAgentId: "agent-1",
    });
  });
});
