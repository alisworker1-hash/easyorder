/* EasyOrder core - command-bar intent router.
   "What do you need today?" -> a structured route into a workspace. Rule-based and
   deterministic today (regex over the phrase); an LLM can replace resolveIntent() later
   behind the same signature (Phase 2), via the existing proxy. No DOM.

   resolveIntent(text, ctx) -> { intent, workspace, action, args, confidence, reason }
     ctx.projects: [{ id, name }]  known projects, so "open the Smith Remodel project" routes. */

export const WORKSPACE = {
  DASHBOARD: "dashboard", PROJECTS: "projects", LISTS: "lists", RFQS: "rfqs",
  SUPPLIERS: "suppliers", ORDERS: "orders", ASSISTANT: "assistant",
};

/* Seeds let the demo light up instantly: a recognized need pre-loads a sample scenario. */
export function detectSeed(text) {
  const t = String(text || "").toLowerCase();
  if (/\bshed\b/.test(t)) return "shed";
  if (/\b(fastener|bolt|nut|washer|screw|zinc|grade\s*8|hex)\b/.test(t)) return "fastener";
  return null;
}

/* Strip leading command verbs/articles to get a clean name or query. */
function cleanPhrase(text, stripLeading) {
  let s = String(text || "").trim();
  if (stripLeading) s = s.replace(stripLeading, "");
  s = s.replace(/^\s*(a|an|the|some|my)\s+/i, "").replace(/\s+/g, " ").trim();
  return s;
}
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const hit = (intent, workspace, action, args, reason, confidence = 0.9) =>
  ({ intent, workspace, action, args: args || {}, confidence, reason });

export function resolveIntent(text, ctx = {}) {
  const raw = String(text || "").trim();
  const t = raw.toLowerCase();
  const projects = ctx.projects || [];

  if (!raw) return hit("empty", WORKSPACE.DASHBOARD, "focus_command_bar", {},
    "empty input; keep focus on the command bar", 0.3);

  // 1. Open an existing project by name
  if (/\bopen\b/.test(t) || /\bproject\b/.test(t)) {
    const match = projects.find((p) => p.name && t.includes(p.name.toLowerCase()));
    if (match) return hit("open_project", WORKSPACE.PROJECTS, "open_project",
      { projectId: match.id, name: match.name }, `matched existing project "${match.name}"`);
  }

  // 2. Show existing records
  if (/\b(outstanding|open|show|view|my)\b.*\b(quote|quotes|rfq|rfqs|responses?)\b/.test(t) ||
      /\b(quotes?|rfqs?)\b.*\b(outstanding|open|pending)\b/.test(t))
    return hit("view_quotes", WORKSPACE.RFQS, "view_quotes", {}, "asked to see quotes/RFQs");
  if (/\b(show|view|my|track)\b.*\border(s)?\b/.test(t))
    return hit("view_orders", WORKSPACE.ORDERS, "view_orders", {}, "asked to see orders");

  // 3. Discover suppliers explicitly
  if (/\b(find|show|who|where).*(supplier|vendor|store|shop|distributor|bolt house)\b/.test(t) ||
      /\b(supplier|vendor)s?\b.*\b(for|near)\b/.test(t))
    return hit("discover_suppliers", WORKSPACE.SUPPLIERS, "discover",
      { query: raw, seed: detectSeed(raw) }, "asked to find suppliers for a need");

  // 4. Send / generate RFQs
  if (/\b(send|generate|prepare|blast|request)\b.*\b(rfq|rfqs|quote|quotes)\b/.test(t))
    return hit("generate_rfqs", WORKSPACE.RFQS, "generate_rfqs",
      { query: cleanPhrase(raw, /^.*\b(rfqs?|quotes?)\b\s*(for)?\s*/i) || raw, seed: detectSeed(raw) },
      "asked to send/prepare RFQs");

  // 5. New project (build / start / new project)
  if (/\b(build|construct|start a project|new project|project for|remodel|renovat)\b/.test(t)) {
    const name = titleCase(cleanPhrase(raw, /^\s*(build|construct|start( a)?( new)?( project)?( for)?|new project( for)?|create( a)?( project)?( for)?)\s+/i)) || "New project";
    return hit("new_project", WORKSPACE.PROJECTS, "new_project",
      { name, seed: detectSeed(raw) }, "phrased as building/starting a project");
  }

  // 6. Default: a described NEED -> new shopping list + discovery. Never a dead end.
  const query = cleanPhrase(raw, /^\s*(i\s+need|need|find|get|buy|compare|price|source|looking for)\s+/i) || raw;
  return hit("new_need", WORKSPACE.LISTS, "new_list",
    { query, seed: detectSeed(raw), discover: true },
    "described a need; start a list and discover suppliers", 0.6);
}
