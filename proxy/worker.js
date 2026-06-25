/* EasyOrder ↔ Fireworks AI proxy (Cloudflare Worker).
 *
 * Why this exists: the EasyOrder site is static (GitHub Pages), so it CANNOT hold the
 * Fireworks API key — anyone could read it in the browser and drain your credit. This
 * tiny worker keeps the key as a server-side secret and forwards chat requests to
 * Fireworks. Your $30 is prepaid credit, so it can never overspend that.
 *
 * Deploy (one time, ~5 min):
 *   1. npm i -g wrangler && wrangler login
 *   2. cd proxy && wrangler secret put FIREWORKS_API_KEY   (paste your Fireworks key)
 *   3. Edit ALLOWED_ORIGINS below to include your GitHub Pages URL.
 *   4. wrangler deploy
 *   5. Put the deployed URL (……workers.dev) into data.json -> meta.assistantProxyUrl
 *
 * Full walkthrough: see AI.md.
 */

const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const DEFAULT_MODEL = "accounts/fireworks/models/llama-v3p3-70b-instruct";

// Only these origins may call the proxy. Add your real GitHub Pages origin.
const ALLOWED_ORIGINS = [
  "https://alisworker1-hash.github.io",
  "http://localhost:8042",
  "http://127.0.0.1:8042",
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return j({ error: "POST only" }, 405, cors);
    if (!env.FIREWORKS_API_KEY) return j({ error: "server not configured: set FIREWORKS_API_KEY" }, 500, cors);

    let body;
    try { body = await request.json(); } catch { return j({ error: "invalid JSON" }, 400, cors); }
    if (!Array.isArray(body.messages)) return j({ error: "messages[] required" }, 400, cors);

    // Build a clamped request — we control the limits, not the client.
    const payload = {
      model: body.model || env.FIREWORKS_MODEL || DEFAULT_MODEL,
      messages: body.messages.slice(-24),            // cap conversation length
      max_tokens: Math.min(Number(body.max_tokens) || 700, 1024),
      temperature: Math.min(Math.max(Number(body.temperature ?? 0.3), 0), 1),
    };
    if (Array.isArray(body.tools)) { payload.tools = body.tools; payload.tool_choice = body.tool_choice || "auto"; }

    let upstream;
    try {
      upstream = await fetch(FIREWORKS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.FIREWORKS_API_KEY}` },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return j({ error: "upstream fetch failed", detail: String(e) }, 502, cors);
    }

    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { ...cors, "Content-Type": "application/json" } });
  },
};

function j(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
