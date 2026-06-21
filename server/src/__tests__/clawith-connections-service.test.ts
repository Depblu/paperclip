import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  companies,
  companySecretBindings,
  companySecrets,
  companySecretVersions,
  createDb,
  secretAccessEvents,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { clawithConnectionService } from "../services/clawith-connections.ts";

const support = await getEmbeddedPostgresTestSupport();
const describeEmbedded = support.supported ? describe : describe.skip;
if (!support.supported) {
  console.warn(`Skipping Clawith connection service tests: ${support.reason ?? "embedded pg unsupported"}`);
}

describeEmbedded("clawithConnectionService", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const secretsTmpDir = path.join(os.tmpdir(), `paperclip-clawith-connections-${randomUUID()}`);
  const previousKeyFile = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;

  beforeAll(async () => {
    mkdirSync(secretsTmpDir, { recursive: true });
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = path.join(secretsTmpDir, "master.key");
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-clawith-connections-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(secretAccessEvents);
    await db.delete(companySecretBindings);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
    if (previousKeyFile === undefined) delete process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
    else process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = previousKeyFile;
    rmSync(secretsTmpDir, { recursive: true, force: true });
  });

  async function seedCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Clawith Test Co",
      issuePrefix: `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  it("stores Clawith login tokens as encrypted connection secrets without exposing them", async () => {
    const companyId = await seedCompany();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/auth/login") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({
          access_token: "clawith-access-token",
          user: {
            username: "qa",
            tenant_id: "tenant-1",
            tenant_name: "QA Tenant",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (pathname === "/api/agents/") {
        expect((init?.headers as Record<string, string>).authorization).toBe("Bearer clawith-access-token");
        return new Response(JSON.stringify([
          { id: "agent-1", name: "QA Agent", status: "active", creator_username: "qa" },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected ${pathname}` }), { status: 404 });
    });

    const service = clawithConnectionService(db);
    const connected = await service.connect(companyId, {
      baseUrl: "http://clawith.local/",
      loginIdentifier: "qa",
      password: "password",
    }, { userId: "board", agentId: null });

    expect(connected.requiresTenantSelection).toBe(false);
    expect(JSON.stringify(connected)).not.toContain("clawith-access-token");
    expect(connected.connection).toMatchObject({
      baseUrl: "http://clawith.local",
      username: "qa",
      tenantId: "tenant-1",
      tenantName: "QA Tenant",
      status: "connected",
    });

    const secretRows = await db.select().from(companySecrets);
    const versionRows = await db.select().from(companySecretVersions);
    const bindingRows = await db.select().from(companySecretBindings);
    expect(secretRows).toHaveLength(1);
    expect(versionRows).toHaveLength(1);
    expect(bindingRows).toMatchObject([{
      targetType: "system",
      targetId: `clawith_connection:${connected.connection.id}`,
      configPath: "clawith.accessToken",
    }]);
    expect(JSON.stringify(secretRows)).not.toContain("clawith-access-token");
    expect(JSON.stringify(versionRows)).not.toContain("clawith-access-token");

    const agents = await service.listAgents(companyId, connected.connection.id);
    expect(agents).toEqual([{
      id: "agent-1",
      name: "QA Agent",
      status: "active",
      creatorUsername: "qa",
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const events = await db.select().from(secretAccessEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      consumerType: "system",
      consumerId: `clawith_connection:${connected.connection.id}`,
      configPath: "clawith.accessToken",
      outcome: "success",
    });
    expect(JSON.stringify(events[0])).not.toContain("clawith-access-token");
  });
});
