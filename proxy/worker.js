/* EasyOrder ↔ LLM proxy (Cloudflare Worker) — provider-agnostic.
 *
 * Why this exists: the EasyOrder site is static (GitHub Pages), so it CANNOT hold the
 * API key — anyone could read it in the browser and drain your credit. This tiny worker
 * keeps the key as a server-side secret and forwards OpenAI-compatible chat requests to
 * whichever provider you configure. Your prepaid credit is a hard cap.
 *
 * Configure (wrangler.toml [vars] + one secret):
 *   secret  LLM_API_KEY     your provider key            (wrangler secret put LLM_API_KEY)
 *   var     LLM_ENDPOINT    chat-completions URL          (default: Fireworks)
 *   var     LLM_MODEL       force this model id           (optional; else client's model)
 *
 * OpenRouter (what we tested live):
 *   LLM_ENDPOINT = https://openrouter.ai/api/v1/chat/completions
 *   LLM_MODEL    = meta-llama/llama-3.3-70b-instruct
 *   LLM_API_KEY  = sk-or-v1-…              (as a secret)
 *
 * Deploy: see AI.md. After deploy, put the worker URL in data.json -> meta.assistantProxyUrl.
 */

const DEFAULT_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions";
const DEFAULT_MODEL = "accounts/fireworks/models/llama-v3p3-70b-instruct";

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

    const KEY = env.LLM_API_KEY || env.FIREWORKS_API_KEY;
    if (!KEY) return j({ error: "server not configured: set the LLM_API_KEY secret" }, 500, cors);

    let body;
    try { body = await request.json(); } catch { return j({ error: "invalid JSON" }, 400, cors); }
    if (!Array.isArray(body.messages)) return j({ error: "messages[] required" }, 400, cors);

    const payload = {
      model: env.LLM_MODEL || body.model || DEFAULT_MODEL,
      messages: body.messages.slice(-24),
      max_tokens: Math.min(Number(body.max_tokens) || 700, 1024),
      temperature: Math.min(Math.max(Number(body.temperature ?? 0.3), 0), 1),
    };
    if (Array.isArray(body.tools)) { payload.tools = body.tools; payload.tool_choice = body.tool_choice || "auto"; }

    let upstream;
    try {
      upstream = await fetch(env.LLM_ENDPOINT || DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${KEY}`,
          "HTTP-Referer": "https://alisworker1-hash.github.io/easyorder/",
          "X-Title": "EasyOrder",
        },
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
