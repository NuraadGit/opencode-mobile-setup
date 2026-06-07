# OpenCode Mobile Setup

Use the **official OpenCode mobile app** with your own computer's OpenCode server —
from **home or anywhere** — with a stable URL, a forced default model, push
notifications, and a security gate so only you can connect.

This is a **self-hosted bridge**: a tiny OpenCode plugin runs a reverse proxy, and
[Tailscale](https://tailscale.com) exposes it securely. No third-party servers see your data.

> Built and battle-tested the hard way. It works. Read the **Security** and
> **Customize** sections — your IPs/model IDs differ from the examples.

---

## What you get

- 📱 Official OpenCode app talking to YOUR machine (home Wi-Fi + cellular)
- 🔒 Token-gated — strangers get `401`, only you get in
- 🧠 Force a default model (so it doesn't fall back to a random/rate-limited one)
- 🔔 Push notifications via [ntfy](https://ntfy.sh) (response ready / question / approval / error)
- ♻️ A plugin **you own** in `~/.config/opencode/plugins/` — survives OpenCode/plugin updates

---

## How it works

```
Phone app ──HTTPS──> Tailscale Funnel (public, valid cert) ──> local proxy :47800
                                                                 │ checks YOUR token (401 if wrong)
                                                                 │ injects OpenCode auth
                                                                 │ forces your default model
                                                                 ▼
                                                       OpenCode server (127.0.0.1)
```

---

## ⚠️ Security (read this)

OpenCode can **read/write files and run commands** on your computer. Tailscale **Funnel**
publishes the proxy to the **public internet**, so the **access token gate is mandatory**
for away access. Keep your token private; it's the key to your machine. You can disable
public access anytime with `tailscale funnel --https=443 off`.

If you only use it on the **same Wi-Fi as your PC**, you can skip Funnel and use the LAN IP
(fully private). See "Home-only mode" in [docs/GUIDE.md](docs/GUIDE.md).

---

## Quick start

### Prerequisites
- OpenCode running on your computer
- [Node.js](https://nodejs.org)
- [Tailscale](https://tailscale.com) on the computer **and** signed in on your phone
- The official **OpenCode** app on your phone
- The free **ntfy** app on your phone (for notifications)

### Two ways to set up

**A) Let an AI do it (easiest).** Paste [`docs/AI-PROMPT.md`](docs/AI-PROMPT.md) into an AI
assistant that can run commands on your computer (e.g. OpenCode itself). It interviews you
about your setup, then does everything tailored to your machine.

**B) Do it manually.** Follow the step-by-step [`docs/GUIDE.md`](docs/GUIDE.md).

**C) Windows installer (interactive).** Run:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```
It discovers your values, generates a token + ntfy topic, installs the plugin, sets env
vars, adds the firewall rule, and prints your phone URL. (More OS installers welcome — PRs!)

---

## After setup

In the OpenCode app, set the server URL (token embedded — the app has no password field):
- **Away:** `https://user:<YOUR_TOKEN>@<your-machine>.<tailnet>.ts.net`
- **Home:** `http://user:<YOUR_TOKEN>@<LAN_IP>:47800`

Subscribe to your private `<NTFY_TOPIC>` in the ntfy app for push notifications.

---

## Repo layout

```
plugin/mobile-proxy.js   The OpenCode plugin (env-var driven; copy to ~/.config/opencode/plugins/)
scripts/install.ps1      Interactive Windows installer
docs/GUIDE.md            Full manual setup guide
docs/AI-PROMPT.md        Prompt for an AI assistant to set it up for you (interviews you first)
```

---

## Troubleshooting

See [docs/GUIDE.md](docs/GUIDE.md#troubleshooting). Common ones:
- **"needs https"** → use the Funnel HTTPS URL, or a private LAN IP for home.
- **Phone can't resolve `.ts.net`** → an ad-blocker/DNS profile (AdGuard etc.) is blocking it; use **Funnel** (public DNS) instead of Serve.
- **AI won't respond / model error** → set `OPENCODE_MOBILE_FORCE_MODEL` to a real model on your server.
- **Stranger could connect** → ensure `OPENCODE_MOBILE_ACCESS_TOKEN` is set and OpenCode was restarted.

---

## Credits

Community-built. Inspired by the OpenCode plugin ecosystem and the
[ntfy](https://ntfy.sh) notification approach. Not affiliated with OpenCode/Anomaly.

## License

MIT — see [LICENSE](LICENSE).
