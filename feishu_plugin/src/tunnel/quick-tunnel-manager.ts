import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import type { TunnelState, TunnelStatus } from "../types.js";

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export type SpawnFn = (cmd: string, args: string[]) => ChildProcess;

export interface QuickTunnelManagerOptions {
  binary?: string;
  spawn?: SpawnFn;
  /** Timeout in ms waiting for tunnel URL. Default 15000. */
  startTimeoutMs?: number;
}

export class QuickTunnelManager {
  private binary: string;
  private spawnFn: SpawnFn;
  private startTimeoutMs: number;
  private child: ChildProcess | null = null;
  private startPromise: Promise<string> | null = null;
  private state: TunnelState = "stopped";
  private url: string | null = null;
  private startedAt: string | null = null;
  private error: string | null = null;
  /** Settles an in-flight start() when stop() is called during "starting". */
  private cancelStart: ((reason: Error) => void) | null = null;

  constructor(opts: QuickTunnelManagerOptions = {}) {
    this.binary = opts.binary ?? "cloudflared";
    this.spawnFn = opts.spawn ?? defaultSpawn;
    this.startTimeoutMs = opts.startTimeoutMs ?? 15_000;
  }

  getStatus(): TunnelStatus {
    return { state: this.state, url: this.url, startedAt: this.startedAt, error: this.error };
  }

  start(port: number): Promise<string> {
    if (this.state === "running" && this.url) return Promise.resolve(this.url);
    if (this.state === "starting" && this.startPromise) return this.startPromise;

    this.state = "starting";
    this.error = null;
    this.url = null;
    this.startedAt = null;

    let child: ChildProcess;
    try {
      child = this.spawnFn(this.binary, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`]);
    } catch (err) {
      this.state = "error";
      this.error = err instanceof Error ? err.message : String(err);
      return Promise.reject(new Error(`spawn failed: ${this.error}`));
    }
    this.child = child;

    this.startPromise = new Promise<string>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        this.startPromise = null;
        this.cancelStart = null;
      };

      const detach = () => {
        child.stdout?.removeListener("data", onData);
        child.stderr?.removeListener("data", onData);
        child.removeListener("exit", onExit);
        child.removeListener("error", onError);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.stdout?.removeListener("data", onData);
        child.stderr?.removeListener("data", onData);
        child.removeListener("exit", onExit);
        child.removeListener("error", onError);
        cleanup();
        this.killChild();
        this.state = "error";
        this.error = "start timeout";
        reject(new Error("tunnel start timeout"));
      }, this.startTimeoutMs);

      const onData = (chunk: Buffer | string) => {
        if (settled) return;
        const text = chunk.toString();
        const match = text.match(TUNNEL_URL_RE);
        if (match) {
          settled = true;
          clearTimeout(timer);
          child.stdout?.removeListener("data", onData);
          child.stderr?.removeListener("data", onData);
          cleanup();
          this.url = match[0];
          this.state = "running";
          this.startedAt = new Date().toISOString();
          resolve(this.url);
        }
      };

      const onError = (err: Error) => {
        if (child !== this.child) {
          detach();
          return;
        }
        clearTimeout(timer);
        detach();
        cleanup();
        if (!settled) {
          settled = true;
          this.child = null;
          this.state = "error";
          this.error = err.message;
          reject(err);
        } else {
          this.child = null;
          this.failRunning(err.message);
        }
      };

      const onExit = (code: number | null) => {
        if (child !== this.child) {
          detach();
          return;
        }
        clearTimeout(timer);
        detach();
        cleanup();
        const message = `process exited with code ${code}`;
        if (!settled) {
          settled = true;
          this.child = null;
          this.state = "error";
          this.error = message;
          reject(new Error(message));
        } else {
          this.child = null;
          this.failRunning(message);
        }
      };

      this.cancelStart = (reason: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        detach();
        cleanup();
        reject(reason);
      };

      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("exit", onExit);
      child.on("error", onError);
    });

    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (this.cancelStart) {
      this.cancelStart(new Error("tunnel start cancelled"));
    }
    this.killChild();
    this.state = "stopped";
    this.url = null;
    this.startedAt = null;
    this.error = null;
  }

  private failRunning(message: string): void {
    this.state = "error";
    this.url = null;
    this.startedAt = null;
    this.error = message;
  }

  private killChild(): void {
    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
  }
}

function defaultSpawn(cmd: string, args: string[]): ChildProcess {
  return cpSpawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
}
