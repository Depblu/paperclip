import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { QuickTunnelManager, type SpawnFn } from "../tunnel/quick-tunnel-manager.js";

/** Fake ChildProcess: EventEmitter with stdout/stderr sub-emitters and kill(). */
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill(_signal?: string) {
    this.killed = true;
    return true;
  }
}

function makeSpawn(child: FakeChild): SpawnFn {
  return vi.fn(() => child) as unknown as SpawnFn;
}

describe("QuickTunnelManager", () => {
  let child: FakeChild;
  let spawnFn: SpawnFn;

  beforeEach(() => {
    child = new FakeChild();
    spawnFn = makeSpawn(child);
  });

  it("parses tunnel URL from stdout and reaches running state", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);

    // Simulate cloudflared output
    child.stdout.emit("data", Buffer.from("2025-01-01T00:00:00Z INF +--------------------------------------------------------------------------------------------+\n"));
    child.stdout.emit("data", Buffer.from("2025-01-01T00:00:00Z INF |  https://my-cool-tunnel.trycloudflare.com  |\n"));

    const url = await promise;
    expect(url).toBe("https://my-cool-tunnel.trycloudflare.com");

    const status = mgr.getStatus();
    expect(status.state).toBe("running");
    expect(status.url).toBe("https://my-cool-tunnel.trycloudflare.com");
    expect(status.startedAt).toBeTruthy();
    expect(status.error).toBeNull();
  });

  it("parses tunnel URL from stderr", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(3000);

    child.stderr.emit("data", Buffer.from("https://abc-123-def.trycloudflare.com"));

    const url = await promise;
    expect(url).toBe("https://abc-123-def.trycloudflare.com");
  });

  it("passes correct args to spawn", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, binary: "my-cloudflared", startTimeoutMs: 5000 });
    const promise = mgr.start(9999);
    child.stdout.emit("data", Buffer.from("https://x.trycloudflare.com"));
    await promise;

    expect(spawnFn).toHaveBeenCalledWith("my-cloudflared", ["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:9999"]);
  });

  it("rejects on unexpected exit during starting", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);

    child.emit("exit", 1);

    await expect(promise).rejects.toThrow("process exited with code 1");
    expect(mgr.getStatus().state).toBe("error");
    expect(mgr.getStatus().error).toContain("exit");
  });

  it("times out if no URL appears", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 50 });
    const promise = mgr.start(8080);

    await expect(promise).rejects.toThrow("tunnel start timeout");
    expect(mgr.getStatus().state).toBe("error");
    expect(mgr.getStatus().error).toBe("start timeout");
    expect(child.killed).toBe(true);
  });

  it("stop kills child and resets state", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);
    child.stdout.emit("data", Buffer.from("https://stop-test.trycloudflare.com"));
    await promise;

    await mgr.stop();
    expect(child.killed).toBe(true);
    const status = mgr.getStatus();
    expect(status.state).toBe("stopped");
    expect(status.url).toBeNull();
  });

  it("stop is idempotent when already stopped", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn });
    await mgr.stop();
    await mgr.stop();
    expect(mgr.getStatus().state).toBe("stopped");
  });

  it("start returns existing URL if already running", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);
    child.stdout.emit("data", Buffer.from("https://reuse.trycloudflare.com"));
    const url1 = await promise;

    const url2 = await mgr.start(8080);
    expect(url2).toBe(url1);
    // spawn called only once
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid URL patterns", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 100 });
    const promise = mgr.start(8080);

    // These should NOT match
    child.stdout.emit("data", Buffer.from("https://UPPER.trycloudflare.com"));
    child.stdout.emit("data", Buffer.from("https://has_underscore.trycloudflare.com"));
    child.stdout.emit("data", Buffer.from("http://insecure.trycloudflare.com"));
    child.stdout.emit("data", Buffer.from("https://wrong-domain.example.com"));

    await expect(promise).rejects.toThrow("tunnel start timeout");
  });

  it("transitions to error when running child exits unexpectedly", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);
    child.stdout.emit("data", Buffer.from("https://exit-later.trycloudflare.com"));
    await promise;

    expect(mgr.getStatus().state).toBe("running");

    // Simulate unexpected exit after running
    child.emit("exit", 0);

    // Give event loop a tick
    await new Promise((r) => setTimeout(r, 10));
    const status = mgr.getStatus();
    expect(status.state).toBe("error");
    expect(status.url).toBeNull();
    expect(status.startedAt).toBeNull();
    expect(status.error).toContain("exit");
  });

  it("handles sync throw from spawn", async () => {
    const throwSpawn = vi.fn(() => { throw new Error("ENOENT"); }) as unknown as SpawnFn;
    const mgr = new QuickTunnelManager({ spawn: throwSpawn, startTimeoutMs: 5000 });
    await expect(mgr.start(8080)).rejects.toThrow("spawn failed: ENOENT");
    expect(mgr.getStatus().state).toBe("error");
    expect(mgr.getStatus().error).toBe("ENOENT");
  });

  it("handles child error event (e.g. ENOENT)", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);
    child.emit("error", new Error("spawn cloudflared ENOENT"));
    await expect(promise).rejects.toThrow("spawn cloudflared ENOENT");
    expect(mgr.getStatus().state).toBe("error");
    expect(mgr.getStatus().error).toBe("spawn cloudflared ENOENT");
  });

  it("returns same promise for concurrent start calls during starting", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const p1 = mgr.start(8080);
    const p2 = mgr.start(8080);
    expect(p1).toBe(p2);
    child.stdout.emit("data", Buffer.from("https://dedup.trycloudflare.com"));
    const [url1, url2] = await Promise.all([p1, p2]);
    expect(url1).toBe("https://dedup.trycloudflare.com");
    expect(url2).toBe("https://dedup.trycloudflare.com");
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("transitions to error when running child emits error event", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);
    child.stdout.emit("data", Buffer.from("https://err-later.trycloudflare.com"));
    await promise;
    expect(mgr.getStatus().state).toBe("running");

    child.emit("error", new Error("boom after running"));
    await new Promise((r) => setTimeout(r, 10));

    const status = mgr.getStatus();
    expect(status.state).toBe("error");
    expect(status.url).toBeNull();
    expect(status.startedAt).toBeNull();
    expect(status.error).toBe("boom after running");
  });

  it("exit after explicit stop does not overwrite stopped state", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const promise = mgr.start(8080);
    child.stdout.emit("data", Buffer.from("https://stop-then-exit.trycloudflare.com"));
    await promise;

    await mgr.stop();
    expect(mgr.getStatus().state).toBe("stopped");

    // The killed child exits asynchronously after stop; must not flip to error.
    child.emit("exit", 0);
    await new Promise((r) => setTimeout(r, 10));

    const status = mgr.getStatus();
    expect(status.state).toBe("stopped");
    expect(status.url).toBeNull();
    expect(status.error).toBeNull();
  });

  it("stop during starting cancels the start promise and stays stopped", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const caught = mgr.start(8080).then(
      () => null,
      (err: Error) => err,
    );

    await mgr.stop();
    expect(child.killed).toBe(true);

    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("cancelled");

    const status = mgr.getStatus();
    expect(status.state).toBe("stopped");
    expect(status.url).toBeNull();
    expect(status.error).toBeNull();
  });

  it("stop during starting does not flip to error after the start timeout", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 20 });
    const caught = mgr.start(8080).then(
      () => null,
      (err: Error) => err,
    );
    await mgr.stop();
    await caught;

    // Wait past the start timeout; a leaked timer would flip state to error.
    await new Promise((r) => setTimeout(r, 60));
    expect(mgr.getStatus().state).toBe("stopped");
    expect(mgr.getStatus().error).toBeNull();
  });

  it("exit event after stop during starting is ignored", async () => {
    const mgr = new QuickTunnelManager({ spawn: spawnFn, startTimeoutMs: 5000 });
    const caught = mgr.start(8080).then(
      () => null,
      (err: Error) => err,
    );
    await mgr.stop();
    await caught;

    child.emit("exit", 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(mgr.getStatus().state).toBe("stopped");
    expect(mgr.getStatus().error).toBeNull();
  });
});
