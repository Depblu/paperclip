import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listOpenCodeSkills,
  syncOpenCodeSkills,
} from "@paperclipai/adapter-opencode-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("opencode local skill sync", () => {
  const paperclipKey = "paperclipai/paperclip/paperclip";
  const createAgentKey = "paperclipai/paperclip/paperclip-create-agent";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Paperclip skills and installs them into the shared Claude/OpenCode skills home", async () => {
    const home = await makeTempDir("paperclip-opencode-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        env: {
          HOME: home,
        },
        paperclipSkillSync: {
          desiredSkills: [paperclipKey],
        },
      },
    } as const;

    const before = await listOpenCodeSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(paperclipKey);
    expect(before.entries.find((entry) => entry.key === paperclipKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === paperclipKey)?.state).toBe("missing");

    const after = await syncOpenCodeSkills(ctx, [paperclipKey]);
    expect(after.entries.find((entry) => entry.key === paperclipKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".agents", "skills", "paperclip"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled Paperclip skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("paperclip-opencode-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        env: {
          HOME: home,
        },
        paperclipSkillSync: {
          desiredSkills: [paperclipKey],
        },
      },
    } as const;

    await syncOpenCodeSkills(configuredCtx, [paperclipKey]);

    const clearedCtx = {
      ...configuredCtx,
      config: {
        env: {
          HOME: home,
        },
        paperclipSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncOpenCodeSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(paperclipKey);
    expect(after.entries.find((entry) => entry.key === paperclipKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".agents", "skills", "paperclip"))).isSymbolicLink()).toBe(true);
  });

  it("repairs stale bundled skill links that still point at an older Paperclip package", async () => {
    const home = await makeTempDir("paperclip-opencode-stale-skill-");
    const currentSource = await makeTempDir("paperclip-opencode-current-skill-");
    const oldPackage = await makeTempDir("paperclip-opencode-old-package-");
    cleanupDirs.add(home);
    cleanupDirs.add(currentSource);
    cleanupDirs.add(oldPackage);

    const currentSkill = path.join(currentSource, "paperclip-create-agent");
    const oldSkill = path.join(
      oldPackage,
      "node_modules",
      "@paperclipai",
      "server",
      "skills",
      "paperclip-create-agent",
    );
    const skillsHome = path.join(home, ".agents", "skills");
    await fs.mkdir(currentSkill, { recursive: true });
    await fs.mkdir(oldSkill, { recursive: true });
    await fs.mkdir(skillsHome, { recursive: true });
    await fs.writeFile(path.join(currentSkill, "SKILL.md"), "---\nname: paperclip-create-agent\n---\n", "utf8");
    await fs.writeFile(path.join(oldSkill, "SKILL.md"), "---\nname: paperclip-create-agent\n---\n", "utf8");
    await fs.symlink(oldSkill, path.join(skillsHome, "paperclip-create-agent"));

    const after = await syncOpenCodeSkills({
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        env: { HOME: home },
        paperclipRuntimeSkills: [{
          key: createAgentKey,
          runtimeName: "paperclip-create-agent",
          source: currentSkill,
          required: true,
        }],
        paperclipSkillSync: {
          desiredSkills: [createAgentKey],
        },
      },
    }, [createAgentKey]);

    expect(after.entries.find((entry) => entry.key === createAgentKey)?.state).toBe("installed");
    expect(await fs.realpath(path.join(skillsHome, "paperclip-create-agent"))).toBe(
      await fs.realpath(currentSkill),
    );
  });
});
