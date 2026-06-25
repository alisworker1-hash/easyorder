/* EasyOrder — LOCAL LLM proxy for development/testing (provider-agnostic).
 * Forwards OpenAI-compatible chat requests to any provider so we can test the live AI
 * before deploying. Configure via env (all optional):
 *   LLM_ENDPOINT   chat-completions URL   (default: Fireworks)
 *   LLM_API_KEY    bearer key             (else reads proxy/.dev.vars / ~/.easyorder-fireworks.key)
 *   LLM_MODEL      force this model id    (else uses the model the client sends)
 *   PORT           default 8787
 * The key is NEVER committed and only sent to the configured provider.
 *
 * OpenRouter example:
 *   LLM_ENDPOINT=https://openrouter.ai/api/v1/chat/completions \
 *   LLM_API_KEY="$OPENROUTER_API_KEY" LLM_MODEL=openai/gpt-4o-mini \
 *   node proxy/local-proxy.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ENDPOINT = process.env.LLM_ENDPOINT || "https://api.fireworks.ai/inference/v1/chat/completions";
const MODEL_OVERRIDE = process.env.LLM_MODEL || "";
const MODEL_DEFAULT = "accounts/fireworks/models/llama-v3p3-70b-instruct";
const PORT = process.env.PORT || 8787;

function loadKey() {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY.trim();
  if (process.env.FIREWORKS_API_KEY) return process.env.FIREWORKS_API_KEY.trim();
  const dv = path.join(__dir, ".dev.vars");
  if (fs.existsSync(dv)) {
    const m = fs.readFileSync(dv, "utf8").match(/(?:FIREWORKS_API_KEY|LLM_API_KEY)\s*=\s*(\S+)/);
    if (m) return m[1].trim();
  }
  const home = path.join(process.env.HOME || "", ".easyorder-fireworks.key");
  if (fs.existsSync(home)) return fs.readFileSync(home, "utf8").trim();
  return "";
}

const KEY = loadKey();
if (!KEY) { console.error("No API key found (set LLM_API_KEY or proxy/.dev.vars)"); process.exit(1); }

const server = http.createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method !== "POST") { res.writeHead(405, cors); return res.end("POST only"); }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const b = JSON.parse(body || "{}");
      const payload = {
        model: MODEL_OVERRIDE || b.model || MODEL_DEFAULT,
        messages: (b.messages || []).slice(-24),
        max_tokens: Math.min(b.max_tokens || 700, 1024),
        temperature: Math.min(Math.max(b.temperature ?? 0.3, 0), 1),
      };
      if (Array.isArray(b.tools)) { payload.tools = b.tools; payload.tool_choice = b.tool_choice || "auto"; }
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KEY}`,
          "HTTP-Referer": "https://alisworker1-hash.github.io/easyorder/",
          "X-Title": "EasyOrder",
        },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      res.writeHead(r.status, { ...cors, "Content-Type": "application/json" });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, () =>
  console.log(`EasyOrder local proxy → http://localhost:${PORT}  (endpoint ${ENDPOINT}, model ${MODEL_OVERRIDE || MODEL_DEFAULT}, key ${KEY.slice(0, 8)}…)`));
