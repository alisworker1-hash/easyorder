# The EasyOrder AI assistant ("Ask EasyOrder")

EasyOrder has a built-in shopping assistant. Unlike a plain chatbot, it is **grounded in
the real catalog** (so it never invents prices) and it can **act on the cart** through
function-calling tools — search, add items, open the cart for Apple Pay checkout.

## How it's wired
- **Client:** `assistant.js` renders the chat panel and runs the tool loop. The tools
  (`add_to_cart`, `search_catalog`, `view_cart`, `open_cart`) execute locally against
  `data.json` / the cart, so every price the assistant uses is the *real* one.
- **Two modes**, chosen automatically by `data.json` → `meta.assistantProxyUrl`:
  - **empty → Demo mode:** grounded rule-based replies, works offline, no key, free. Good
    for showing the experience.
  - **set → Live mode:** the conversation goes through your serverless proxy to **Fireworks AI**
    (a real LLM with tool-calling).
- **Proxy:** `proxy/worker.js` (Cloudflare Worker) holds your Fireworks key server-side.
  The static site never sees the key.

```
Browser (assistant.js)  ──►  Cloudflare Worker (holds key)  ──►  Fireworks AI
        ▲ tools run here on real data                 returns reply / tool calls
```

## Why a proxy is required
A static GitHub Pages site can't keep a secret — anything in the page is readable by anyone.
Putting the Fireworks key in the browser would let strangers spend your credit. The worker
keeps the key safe and only forwards chat requests from your own site's origin.

Your **$30 Fireworks balance is prepaid credit**, so spending can never exceed it. A typical
shopping conversation costs a fraction of a cent, so $30 is thousands of conversations.

## Go live in ~5 minutes

### 1. Get a Fireworks API key
- Sign in at <https://fireworks.ai> (you already have $30 of credit).
- Go to **API Keys** → create a key. Copy it (starts with `fw_…`).

### 2. Deploy the proxy (Cloudflare Workers, free tier)
```bash
npm install -g wrangler
wrangler login
cd proxy
wrangler secret put FIREWORKS_API_KEY     # paste your fw_… key when prompted
```
Edit `proxy/worker.js` → `ALLOWED_ORIGINS` so it lists your GitHub Pages URL
(e.g. `https://alisworker1-hash.github.io`). Then:
```bash
wrangler deploy
```
Wrangler prints a URL like `https://easyorder-ai.<your-subdomain>.workers.dev`.

### 3. Point the site at the proxy
In `data.json`:
```json
"assistantProxyUrl": "https://easyorder-ai.<your-subdomain>.workers.dev",
"assistantModel": "accounts/fireworks/models/llama-v3p3-70b-instruct"
```
Commit & push. The "Ask EasyOrder" button is now a live AI. Done.

### Test it locally first (optional)
```bash
cd proxy
wrangler dev          # runs the proxy at http://localhost:8787
```
Temporarily set `assistantProxyUrl` to `http://localhost:8787` and open the site on
`localhost:8042`. The worker's `ALLOWED_ORIGINS` already permits localhost.

## Choosing a model
Default is **Llama 3.3 70B** — strong tool-calling, great value. Cheaper/faster option:
`accounts/fireworks/models/llama-v3p1-8b-instruct`. Higher quality: `qwen2p5-72b-instruct`
or a DeepSeek model. Change it in `data.json` (`assistantModel`) or pin it in
`proxy/wrangler.toml` — no code changes needed. All must support function calling.

## Safety notes
- The assistant **never charges anyone** — it can open the cart, but the shopper taps
  "Pay with Apple Pay" themselves.
- The worker clamps `max_tokens` and conversation length, and only answers your own origin.
- Keep the Fireworks key only in `wrangler secret` — never in `data.json` or any committed file.
