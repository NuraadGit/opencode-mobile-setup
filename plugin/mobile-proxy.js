/**
 * mobile-proxy.js — standalone OpenCode plugin
 *
 * Lets the official OpenCode mobile app reach your computer's OpenCode server.
 * Drop this file in ~/.config/opencode/plugins/ — OpenCode auto-loads it and
 * never overwrites it on updates.
 *
 * Features:
 *  - reverse proxy on 0.0.0.0:<PORT> -> OpenCode localhost (reachable via Tailscale/Funnel)
 *  - injects OpenCode's Basic Auth (so the phone doesn't need OpenCode's rotating password)
 *  - requires YOUR access token from the client (gate against the public internet)
 *  - optional model rewrite (force a default model the app must use)
 *  - WebSocket / SSE forwarding
 *  - ntfy push notifications on session.idle / question.asked / permission.asked / session.error
 *
 * All behavior is controlled by environment variables (set them in your User/global env):
 *   OPENCODE_MOBILE_TAILSCALE_PORT  local proxy port              (default 47800)
 *   OPENCODE_MOBILE_ACCESS_TOKEN    secret token for the gate     (empty = NO gate; only safe on LAN)
 *   OPENCODE_MOBILE_FORCE_PROVIDER  provider id to force          (empty = don't force)
 *   OPENCODE_MOBILE_FORCE_MODEL     model id to force             (empty = don't force)
 *   OPENCODE_MOBILE_NTFY_TOPIC      ntfy topic for push           (empty = notifications off)
 *   OPENCODE_MOBILE_NTFY_SERVER     ntfy server                   (default https://ntfy.sh)
 *   OPENCODE_MOBILE_DEBUG           set to 1 for a verbose file log
 */
import http from "http";
import https from "https";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PORT = Number(process.env.OPENCODE_MOBILE_TAILSCALE_PORT) || 47800;
const FORCE_PROVIDER = process.env.OPENCODE_MOBILE_FORCE_PROVIDER || "";
const FORCE_MODEL = process.env.OPENCODE_MOBILE_FORCE_MODEL || "";
const NTFY_TOPIC = process.env.OPENCODE_MOBILE_NTFY_TOPIC || "";
const NTFY_SERVER = (process.env.OPENCODE_MOBILE_NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
const ACCESS_TOKEN = process.env.OPENCODE_MOBILE_ACCESS_TOKEN || "";

const LOG_FILE = path.join(os.homedir(), ".config", "opencode-mobile", "debug.log");
function log(...args) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const line = args.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [mobile-proxy] ${line}\n`);
  } catch {}
}

function authHeader() {
  const pass = process.env.OPENCODE_SERVER_PASSWORD || "";
  const user = process.env.OPENCODE_SERVER_USERNAME || "opencode";
  return pass ? "Basic " + Buffer.from(user + ":" + pass).toString("base64") : null;
}

function sendNtfy(title, message, priority) {
  if (!NTFY_TOPIC) return;
  try {
    const url = new URL(NTFY_SERVER + "/" + NTFY_TOPIC);
    const lib = url.protocol === "https:" ? https : http;
    const body = Buffer.from(message || "", "utf8");
    const headers = { "Content-Type": "text/plain; charset=utf-8", "Content-Length": body.length };
    if (title) headers["Title"] = title;
    if (priority) headers["Priority"] = String(priority);
    const req = lib.request({ method: "POST", hostname: url.hostname, port: url.port || (url.protocol === "https:" ? 443 : 80), path: url.pathname, headers }, (res) => { res.resume(); log("ntfy ->", res.statusCode, title); });
    req.on("error", (e) => log("ntfy error:", e.message));
    req.end(body);
  } catch (e) { log("ntfy exception:", e.message); }
}

function gateOk(headers) {
  if (!ACCESS_TOKEN) return true;
  const incoming = headers["authorization"];
  if (incoming && /^Basic /i.test(incoming)) {
    try { const d = Buffer.from(incoming.replace(/^Basic /i, ""), "base64").toString("utf8"); return d.slice(d.indexOf(":") + 1) === ACCESS_TOKEN; } catch {}
  }
  return false;
}

function startProxy(openCodePort) {
  const isMsgPost = (m, u) => m === "POST" && (u.includes("/message") || u.includes("/prompt") || u.includes("/command") || u.includes("/shell"));
  const server = http.createServer((creq, cres) => {
    if (!gateOk(creq.headers)) {
      log("GATE-REJECT", creq.method, creq.url, "from", creq.socket.remoteAddress);
      cres.writeHead(401, { "WWW-Authenticate": 'Basic realm="OpenCode"', "Content-Type": "text/plain" });
      cres.end("Unauthorized"); return;
    }
    const h = Object.assign({}, creq.headers);
    const a = authHeader(); if (a) h["authorization"] = a;
    h["host"] = "127.0.0.1:" + openCodePort;
    const forward = (bodyBuf) => {
      if (bodyBuf != null) { h["content-length"] = Buffer.byteLength(bodyBuf); delete h["transfer-encoding"]; }
      const preq = http.request({ host: "127.0.0.1", port: openCodePort, path: creq.url, method: creq.method, headers: h }, (pres) => {
        const rh = Object.assign({}, pres.headers); rh["access-control-allow-origin"] = "*";
        cres.writeHead(pres.statusCode || 502, rh); pres.pipe(cres);
      });
      preq.on("error", (e) => { try { cres.writeHead(502); cres.end("proxy error: " + e.message); } catch {} });
      if (bodyBuf != null) preq.end(bodyBuf); else creq.pipe(preq);
    };
    if (isMsgPost(creq.method, creq.url) && FORCE_MODEL) {
      let chunks = [];
      creq.on("data", (d) => chunks.push(d));
      creq.on("end", () => {
        let raw = Buffer.concat(chunks).toString("utf8");
        try {
          const obj = JSON.parse(raw);
          obj.model = { providerID: FORCE_PROVIDER, modelID: FORCE_MODEL };
          raw = JSON.stringify(obj);
          log("MODEL-REWRITE ->", FORCE_PROVIDER + "/" + FORCE_MODEL);
        } catch (e) { log("MODEL-REWRITE-SKIP non-JSON:", e.message); }
        forward(Buffer.from(raw, "utf8"));
      });
      creq.on("error", () => forward(null));
    } else {
      forward(null);
    }
  });

  server.on("upgrade", (ureq, usock) => {
    if (!gateOk(ureq.headers)) { log("GATE-REJECT-WS", ureq.url); try { usock.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); usock.destroy(); } catch {} return; }
    const h = Object.assign({}, ureq.headers);
    const a = authHeader(); if (a) h["authorization"] = a;
    h["host"] = "127.0.0.1:" + openCodePort;
    const preq = http.request({ host: "127.0.0.1", port: openCodePort, path: ureq.url, method: ureq.method, headers: h });
    preq.on("upgrade", (pres, psock) => {
      usock.write("HTTP/1.1 101 Switching Protocols\r\n" + Object.keys(pres.headers).map((k) => `${k}: ${pres.headers[k]}`).join("\r\n") + "\r\n\r\n");
      psock.pipe(usock); usock.pipe(psock);
    });
    preq.on("error", () => { try { usock.destroy(); } catch {} });
    preq.end();
  });

  server.on("error", (e) => { if (e.code === "EADDRINUSE") log("Port " + PORT + " in use - skipping (another instance owns it)."); else log("proxy error:", e.code || e.message); });
  server.listen(PORT, "0.0.0.0", () => log("Proxy LISTENING 0.0.0.0:" + PORT + " -> 127.0.0.1:" + openCodePort + " | auth:" + (authHeader() ? "yes" : "no") + " | gate:" + (ACCESS_TOKEN ? "on" : "off") + " | ntfy:" + (NTFY_TOPIC ? "on" : "off") + " | forceModel:" + (FORCE_MODEL ? "on" : "off")));
}

export const MobileProxyPlugin = async (ctx) => {
  const openCodePort = Number(ctx?.serverUrl?.port) || 4096;
  log("Plugin init. OpenCode port:", openCodePort);
  startProxy(openCodePort);
  return {
    event: async ({ event }) => {
      const type = event && typeof event === "object" && typeof event.type === "string" ? event.type : null;
      if (!type) return;
      try {
        if (type === "session.idle") sendNtfy("OpenCode: response ready", "Your AI turn finished and is ready to view.", 4);
        else if (type === "question.asked") sendNtfy("OpenCode: question for you", "OpenCode is asking you a question - open the app to answer.", 5);
        else if (type === "permission.asked") sendNtfy("OpenCode: approval needed", "OpenCode is waiting for your approval to continue.", 5);
        else if (type === "session.error") sendNtfy("OpenCode: session error", "A session error occurred.", 4);
      } catch (e) { log("event handler error:", e.message); }
    },
  };
};

export default MobileProxyPlugin;
