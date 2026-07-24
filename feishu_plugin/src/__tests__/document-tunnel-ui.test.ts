import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const uiDir = resolve(import.meta.dirname, "../../ui");
const app = readFileSync(resolve(uiDir, "app.js"), "utf-8");
const html = readFileSync(resolve(uiDir, "index.html"), "utf-8");

describe("document tunnel admin UI (static)", () => {
  it("index.html exposes the tunnel card DOM ids", () => {
    for (const id of [
      "tunnel-status-badge",
      "tunnel-url",
      "btn-tunnel-start",
      "btn-tunnel-stop",
      "btn-tunnel-copy",
      "g-tunnel-auto-start",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("index.html renders an independent tunnel card under global settings", () => {
    expect(html).toContain("临时文档 Tunnel");
    expect(html).toContain('id="g-tunnel-auto-start"');
  });

  it("index.html wires the tunnel button handlers", () => {
    expect(html).toContain('id="btn-tunnel-start" onclick="startDocumentTunnel()"');
    expect(html).toContain('id="btn-tunnel-stop" onclick="stopDocumentTunnel()"');
    expect(html).toContain('id="btn-tunnel-copy"');
    expect(html).toContain("copyTunnelUrl()");
  });

  it("index.html bumps the app.js cache-bust version", () => {
    expect(html).toContain("app.js?v=5");
    expect(html).not.toContain("app.js?v=4");
  });

  it("app.js calls the tunnel admin API paths", () => {
    expect(app).toContain("'/api/tunnel/status'");
    expect(app).toContain("'/api/tunnel/start'");
    expect(app).toContain("'/api/tunnel/stop'");
  });

  it("app.js defines the tunnel control functions", () => {
    for (const fn of [
      "function refreshTunnelStatus",
      "function startDocumentTunnel",
      "function stopDocumentTunnel",
      "function copyTunnelUrl",
    ]) {
      expect(app).toContain(fn);
    }
  });

  it("app.js saves and loads documentTunnelAutoStart", () => {
    expect(app).toContain(
      "documentTunnelAutoStart: document.getElementById('g-tunnel-auto-start').checked",
    );
    expect(app).toContain(
      "document.getElementById('g-tunnel-auto-start').checked = !!g.documentTunnelAutoStart",
    );
  });

  it("app.js polls tunnel status every 5 seconds starting on page load", () => {
    expect(app).toContain("setInterval(refreshTunnelStatus, 5000)");
    expect(app).toContain("startTunnelPolling();");
  });

  it("app.js copy guards against a missing URL before reporting success", () => {
    expect(app).toContain("if (!tunnelUrl)");
    expect(app).toContain("navigator.clipboard.writeText(tunnelUrl)");
  });

  it("app.js tracks tunnel state and maps the badge to Chinese labels", () => {
    expect(app).toContain("let tunnelState = 'stopped';");
    expect(app).toContain("tunnelState = state;");
    expect(app).toContain("stopped: '已停止'");
    expect(app).toContain("starting: '启动中'");
    expect(app).toContain("running: '运行中'");
    expect(app).toContain("error: '错误'");
    expect(app).toContain("badge.textContent = tunnelStateLabel(state);");
  });

  it("app.js clears the URL and disables all buttons when status refresh fails", () => {
    const fn = app.slice(app.indexOf("async function refreshTunnelStatus"));
    const catchBlock = fn.slice(
      fn.indexOf("} catch (e) {"),
      fn.indexOf("function describeTunnelRefresh"),
    );
    expect(catchBlock).toContain("tunnelUrl = null;");
    expect(catchBlock).toContain("tunnelState = 'error';");
    expect(catchBlock).toContain("setTunnelButtonsDisabled(true);");
  });

  it("app.js defines a helper that disables all three tunnel buttons", () => {
    expect(app).toContain("function setTunnelButtonsDisabled(disabled)");
    expect(app).toContain("document.getElementById('btn-tunnel-start').disabled = disabled;");
    expect(app).toContain("document.getElementById('btn-tunnel-stop').disabled = disabled;");
    expect(app).toContain("document.getElementById('btn-tunnel-copy').disabled = disabled;");
  });

  it("app.js disables all buttons immediately when a start/stop operation begins", () => {
    const startFn = app.slice(
      app.indexOf("async function startDocumentTunnel"),
      app.indexOf("async function stopDocumentTunnel"),
    );
    expect(startFn.indexOf("setTunnelButtonsDisabled(true);")).toBeGreaterThanOrEqual(0);
    expect(startFn.indexOf("setTunnelButtonsDisabled(true);")).toBeLessThan(
      startFn.indexOf("await api('POST', '/api/tunnel/start')"),
    );
    const stopFn = app.slice(
      app.indexOf("async function stopDocumentTunnel"),
      app.indexOf("async function copyTunnelUrl"),
    );
    expect(stopFn.indexOf("setTunnelButtonsDisabled(true);")).toBeGreaterThanOrEqual(0);
    expect(stopFn.indexOf("setTunnelButtonsDisabled(true);")).toBeLessThan(
      stopFn.indexOf("await api('POST', '/api/tunnel/stop')"),
    );
  });

  it("app.js refreshes tunnel status without unhandled rejections in finally", () => {
    expect(app).toContain("void refreshTunnelStatus();");
  });
});
