# OpenCode on Your Phone — Complete Setup Guide

Run the **official OpenCode mobile app** against your own computer's OpenCode server,
from **anywhere** (home Wi‑Fi or cellular), with:

- A **stable URL** that survives restarts
- A **forced default model** (so it never falls back to a rate‑limited model)
- **Push notifications** to your phone (response ready / question / approval / error)
- A **security gate** so only you can reach it (it's exposed to the internet otherwise)
- A **self‑owned plugin** that survives OpenCode/plugin updates (no re‑patching)

> This is the distilled result of a long debugging journey. It works. But your
> values (IPs, model IDs, OS) differ from the author's, so **read the
> "Things you must customize" section** and use the questionnaire below.

---

## ⚠️ Read first: how this works & the tradeoffs

**Architecture:**
```
Phone app ──HTTPS──> Tailscale Funnel (public, valid cert) ──> local proxy(:47800)
                                                                  │ injects auth
                                                                  │ forces model
                                                                  │ requires YOUR token
                                                                  ▼
                                                        OpenCode server (127.0.0.1)
```

A small **OpenCode plugin** (a single JS file you own) starts a reverse proxy. **Tailscale
Funnel** publishes that proxy on the internet with a real HTTPS cert. The proxy injects
OpenCode's auth, optionally forces a default model, and **requires a secret token** so
randoms can't reach your machine. A plugin event hook sends **ntfy** push notifications.

**Honest tradeoffs:**
- **Funnel = public internet exposure.** Anyone with the URL could reach your machine —
  which is why the **token gate is mandatory** (OpenCode can run commands / edit files).
- **Tailscale must run on your PC** (it's the public ingress).
- **The official app has no model picker for custom providers** and **no separate password
  field** — we work around both (model rewrite in the proxy; token embedded in the URL).
- If you only ever use it on the **same Wi‑Fi as your PC**, you can skip Funnel entirely
  and just use the LAN IP (simpler, fully private). See "Home‑only mode."

---

## Things you MUST customize (don't copy blindly)

| Placeholder | What it is | How to find yours |
|---|---|---|
| `<TAILSCALE_NAME>` | Your PC's MagicDNS name | `tailscale status` (the `*.ts.net` of your machine) |
| `<LAN_IP>` | PC's home Wi‑Fi IP | `ipconfig` (the `192.168.x.x` / `10.x.x.x`) |
| `<PROXY_PORT>` | Local proxy port | Pick an unused port, e.g. `47800` |
| `<FORCE_PROVIDER>/<FORCE_MODEL>` | Default model to force | From your OpenCode `/config/providers` or config |
| `<ACCESS_TOKEN>` | Your secret gate token | Generate a random 32‑char string |
| `<NTFY_TOPIC>` | Private ntfy topic | A random unguessable string |

> **The author's model is a Palantir/Anthropic Claude Opus 4.8 with a long
> `ri.language-model-service..` ID. YOURS WILL BE DIFFERENT.** If you use a normal
> provider (anthropic, openai, etc.), your model ID is short (e.g. `claude-3-7-sonnet`).
> Don't copy the author's `FORCE_MODEL` — use your own.

---

## Prerequisites

1. **OpenCode** installed and working on your computer (desktop app or `opencode serve`).
2. **Node.js** installed (`node --version`). Needed by the plugin/Tailscale flows.
3. **Tailscale** installed on the computer AND signed in on your phone (free).
4. The **official OpenCode app** on your phone (App Store / Play Store).
5. The free **ntfy** app on your phone (for notifications) — optional but recommended.

---

## Step 1 — Find your values

Run these on the computer and write down the results:

```sh
# Your PC's Tailscale name + IP
tailscale status

# Your PC's LAN IP (Windows: ipconfig | macOS/Linux: ip addr / ifconfig)
ipconfig        # Windows
ip addr         # Linux
ifconfig        # macOS

# Your OpenCode model IDs (run with OpenCode running; needs the server password):
#   GET http://127.0.0.1:<openCodePort>/config/providers
#   Look at "default" and the provider/model IDs you want.
```

Generate your secrets (any method; examples):
```sh
# Access token (32 chars). PowerShell:
-join ((48..57)+(97..122) | Get-Random -Count 32 | %{[char]$_})
# ntfy topic (random):
"opencode-" + (-join ((48..57)+(97..122) | Get-Random -Count 16 | %{[char]$_}))
```

---

## Step 2 — Create the plugin

OpenCode auto‑loads any JS file in `~/.config/opencode/plugins/`. Create:

**`~/.config/opencode/plugins/mobile-proxy.js`** — paste the code from the
**"PLUGIN CODE"** section at the bottom of this guide. It reads all settings from
env vars, so you don't edit the code itself.

---

## Step 3 — Set environment variables (User scope)

Set these so OpenCode's process inherits them. (Windows examples; on macOS/Linux put them
in your shell profile / launchd / systemd environment.)

```powershell
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_TAILSCALE_PORT","47800","User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_FORCE_PROVIDER","<FORCE_PROVIDER>","User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_FORCE_MODEL","<FORCE_MODEL>","User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_NTFY_TOPIC","<NTFY_TOPIC>","User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_NTFY_SERVER","https://ntfy.sh","User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_ACCESS_TOKEN","<ACCESS_TOKEN>","User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_DEBUG","1","User")
```

> **Leave `FORCE_PROVIDER`/`FORCE_MODEL` unset** if you don't want to force a model.
> **Leave `NTFY_TOPIC` unset** to disable notifications.
> **Leave `ACCESS_TOKEN` unset ONLY if you will NOT use Funnel** (home‑only). For public
> Funnel, the token is mandatory.

Optionally set a default model in `~/.config/opencode/opencode.json(c)`:
```json
{ "model": "<FORCE_PROVIDER>/<FORCE_MODEL>" }
```

---

## Step 4 — Firewall (allow the proxy port inbound)

**Windows (admin PowerShell):**
```powershell
New-NetFirewallRule -DisplayName "OpenCode Mobile <PROXY_PORT>" -Direction Inbound -Action Allow -Protocol TCP -LocalPort <PROXY_PORT> -Profile Any
```
macOS/Linux: allow the port through your firewall if one is active.

---

## Step 5 — Expose it (pick ONE)

### Option A — Tailscale Funnel (works anywhere, public + token‑gated) — RECOMMENDED for away access
First enable Funnel/HTTPS once in the Tailscale admin console (it'll give you a link the
first time you run the command). Then:
```sh
tailscale funnel --bg --https=443 http://127.0.0.1:<PROXY_PORT>
```
Your public URL becomes: `https://<TAILSCALE_NAME>`

> ⚠️ This is reachable from the public internet. The token gate (Step 3) is what protects it.

### Option B — Home‑only (same Wi‑Fi, fully private, no Funnel)
Skip Funnel. The official app allows **plain HTTP for private IPs** (`192.168.x`, `10.x`,
etc.). Just point the app at `http://<LAN_IP>:<PROXY_PORT>`. No token strictly needed (LAN
only), but you can still set one.

### Option C — Tailscale Serve (private to your tailnet, needs phone DNS to resolve `.ts.net`)
`tailscale serve --bg --https=443 http://127.0.0.1:<PROXY_PORT>` — private, but the phone
must be able to resolve your `.ts.net` name. **A custom DNS/ad‑blocker profile on the phone
(e.g. AdGuard) can break this.** If your phone uses such a profile, prefer Funnel (Option A).

---

## Step 6 — Important DNS note (avoid breaking your PC internet)

If you ever change Tailscale **DNS** settings (MagicDNS / "Override DNS servers" /
global nameservers), be careful: forcing a slow upstream resolver on all devices can make
browsing crawl. Safe defaults:
- Keep the PC on its normal fast DNS: `tailscale set --accept-dns=false`
- Funnel does **not** require any DNS changes (it uses public DNS). Prefer it.

---

## Step 7 — Restart OpenCode & verify (on the computer)

Restart OpenCode fully so it loads the plugin + env vars. Then verify the gate:

```sh
# No token -> should be 401 (blocked)
curl -s -o /dev/null -w "%{http_code}\n" https://<TAILSCALE_NAME>/global/health
# With token -> should be 200
curl -s -u "user:<ACCESS_TOKEN>" https://<TAILSCALE_NAME>/global/health
```

---

## Step 8 — Configure the phone

**Official app has no password field**, so embed the token in the URL:

- **Away/anywhere:** `https://user:<ACCESS_TOKEN>@<TAILSCALE_NAME>`
- **Home Wi‑Fi:**    `http://user:<ACCESS_TOKEN>@<LAN_IP>:<PROXY_PORT>`

(`user` can be any non‑empty username; only the password/token is checked.)

**ntfy:** install the ntfy app, **subscribe to your `<NTFY_TOPIC>`**. You'll get pushes for
response‑ready / question / approval / error. Answer questions & approvals by opening the
OpenCode app.

---

## Troubleshooting

- **Phone "can't connect" / name not resolved:** if using a `.ts.net` name with Serve and a
  DNS/ad‑blocker profile on the phone, switch to **Funnel** (resolves via public DNS).
- **App shows "needs https":** the app requires HTTPS for non‑local hosts. Use the Funnel
  HTTPS URL, or for home use a **private LAN IP** (HTTP allowed there).
- **AI never responds / "model" errors:** the app may send a model your server doesn't have.
  Set `FORCE_PROVIDER`/`FORCE_MODEL` to a real model on your server (the proxy rewrites it).
- **Stranger can reach it:** make sure `ACCESS_TOKEN` is set and OpenCode was restarted; test
  the no‑token request returns 401.
- **Everything broke after a plugin/app update:** the plugin lives in
  `~/.config/opencode/plugins/` and is NOT overwritten by updates. If it's gone, recreate it.
- **Check the log:** `~/.config/opencode-mobile/debug.log` (look for `Proxy LISTENING`,
  `GATE-REJECT`, `MODEL-REWRITE`, `ntfy ->`).

---

## Turn off public access anytime
```sh
tailscale funnel --https=443 off
```

---

## PLUGIN CODE  (`~/.config/opencode/plugins/mobile-proxy.js`)

> Paste exactly. It's driven entirely by env vars; no edits needed.

```js
/**
 * mobile-proxy.js — standalone OpenCode plugin
 *  - reverse proxy on 0.0.0.0:<PORT> -> OpenCode localhost
 *  - injects OpenCode Basic Auth (so the phone doesn't need it for the OpenCode leg)
 *  - requires YOUR access token from the client (gate against the public internet)
 *  - optional model rewrite (force a default model)
 *  - WebSocket/SSE forwarding
 *  - ntfy push on session.idle / question.asked / permission.asked / session.error
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
```

================================================================
END OF GUIDE
================================================================
