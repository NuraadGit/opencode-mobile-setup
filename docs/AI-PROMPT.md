# AI Assistant Prompt — "Set up OpenCode on my phone"

Copy everything between the lines below and paste it to an AI coding assistant
(e.g. OpenCode, Claude, etc.) that can run commands on your computer. It will
**interview you first**, then do the setup tailored to your machine.

------------------------------------------------------------------------

You are helping me set up the **official OpenCode mobile app** to talk to the
**OpenCode server running on this computer**, accessible from my phone both at
home and away. Before doing ANYTHING, interview me with the questions below, ONE
batch at a time, and WAIT for my answers. Do not assume defaults for anything
personal (IPs, model IDs, OS paths). Verify facts by running commands rather than
guessing. Never change system DNS settings without explicit confirmation, and warn
me before anything that could expose my machine to the public internet.

The end goal / architecture:
- A standalone OpenCode plugin (a single JS file in `~/.config/opencode/plugins/`)
  runs a reverse proxy that: injects OpenCode's Basic Auth, optionally forces a
  default model, requires a secret access token, forwards WebSockets/SSE, and sends
  ntfy push notifications on session.idle / question.asked / permission.asked /
  session.error.
- Remote access is via **Tailscale Funnel** (public HTTPS w/ valid cert) protected by
  the token; OR LAN‑only for same‑Wi‑Fi use.
- The official app has no model picker for custom providers and no password field, so
  we force the model in the proxy and embed the token in the server URL.

### INTERVIEW ME — Batch 1: Environment
1. What OS is this computer (Windows / macOS / Linux)?
2. How do you run OpenCode (desktop app, or `opencode serve` in a terminal)?
3. Is Node.js installed? (you can check with `node --version`)
4. Is Tailscale installed on this computer and is it signed in? Is the Tailscale app
   installed and connected on my phone?
5. What phone do you have (iOS / Android), and what app are you using (official
   OpenCode app, or another)?

### INTERVIEW ME — Batch 2: Access & networking (after Batch 1)
6. Do you need access ONLY on the same Wi‑Fi as this PC (simpler, fully private), or
   also when AWAY (cellular / other networks)?
7. If away access: are you OK with the server being reachable on the public internet
   **behind a secret token** (Tailscale Funnel)? Or do you require it to stay fully
   private to your tailnet (Tailscale Serve)?
8. Does your phone have any custom DNS / ad‑blocker profile (e.g. AdGuard, NextDNS,
   Cloudflare, a VPN)? (This affects whether `.ts.net` names resolve on the phone.)
9. What port should the local proxy use? (default 47800 is fine unless taken)

### INTERVIEW ME — Batch 3: Model & notifications (after Batch 2)
10. Do you want to FORCE a specific default model for phone sessions (recommended, so
    it doesn't fall back to a random/expensive/rate‑limited model)? If yes, which one?
    (I should run/inspect `GET /config/providers` on your OpenCode server to list your
    real provider IDs + model IDs, then confirm the exact one with you.)
11. Do you want push notifications to your phone via ntfy (free)? If yes, I'll generate
    a private random topic and you'll subscribe to it in the ntfy app.
12. Which events should notify you? (defaults: response ready, question asked,
    approval needed, session error)

### THEN, after I answer, do the setup in this order, confirming each step:
1. Discover my values by running commands: Tailscale name (`tailscale status`), LAN IP,
   OpenCode model IDs (`/config/providers`), an unused proxy port.
2. Generate a strong random ACCESS_TOKEN (32 chars) and a random NTFY_TOPIC.
3. Create `~/.config/opencode/plugins/mobile-proxy.js` (use the reference plugin code
   from the companion guide; it is env‑var driven — do not hardcode my values in it).
4. Set the env vars in User/global scope so OpenCode inherits them:
   OPENCODE_MOBILE_TAILSCALE_PORT, OPENCODE_MOBILE_FORCE_PROVIDER,
   OPENCODE_MOBILE_FORCE_MODEL, OPENCODE_MOBILE_NTFY_TOPIC, OPENCODE_MOBILE_NTFY_SERVER,
   OPENCODE_MOBILE_ACCESS_TOKEN, OPENCODE_MOBILE_DEBUG. (Skip force‑model or ntfy or token
   per my answers.)
5. Optionally set top‑level `"model"` in opencode.json(c) to my chosen default.
6. Add a firewall inbound allow rule for the proxy port.
7. Expose it per my choice:
   - Funnel: enable in Tailscale admin if needed, then
     `tailscale funnel --bg --https=443 http://127.0.0.1:<PORT>`
   - LAN‑only: skip Funnel; I'll use `http://<LAN_IP>:<PORT>`
   - Serve: `tailscale serve --bg --https=443 http://127.0.0.1:<PORT>` (warn me it needs
     `.ts.net` to resolve on the phone; if I have an ad‑blocker DNS profile, prefer Funnel)
8. Keep my PC DNS fast: `tailscale set --accept-dns=false`. Do NOT enable
   "Override DNS servers" / global nameservers unless I explicitly ask (it can slow my PC).
9. Tell me to fully restart OpenCode, then VERIFY from the computer:
   - no‑token request to the public URL returns 401 (gate works)
   - with‑token request returns 200
   - the proxy is listening; the plugin logged "Proxy LISTENING"
10. Give me the exact phone URL to paste into the app:
    - Away: `https://user:<ACCESS_TOKEN>@<TAILSCALE_NAME>`
    - Home: `http://user:<ACCESS_TOKEN>@<LAN_IP>:<PORT>`
    And tell me to subscribe to <NTFY_TOPIC> in the ntfy app.
11. Create a backup of the plugin file and a restore/verify script, plus a short
    SETUP‑NOTES file with my URLs, topic, and recovery steps.

### Important behaviors I want from you:
- Diagnose with logs/commands; explain findings plainly before changing things.
- Warn me about security (the server can run commands/edit files on my PC; public
  exposure must be token‑gated).
- Never run interactive commands that hang; prefer non‑interactive flags.
- If you change anything risky (DNS, firewall, public exposure), tell me how to undo it.
- At the end, give me a one‑paragraph summary of what's set up and the 2–3 things I
  must remember (Tailscale must run on the PC; keep the token private; how to disable
  public access).

------------------------------------------------------------------------

(Companion file with the full manual guide + plugin code:
"OpenCode-Mobile-Setup-GUIDE.md")
