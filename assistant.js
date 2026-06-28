/* EasyOrder — the inline "EasyOrder Helper" chat (ChatGPT-style, on the homepage).
   Grounded in the real catalog and able to act on the cart via function-calling tools.
   Two modes via data.json meta.assistantProxyUrl: empty = grounded DEMO, set = LIVE (Fireworks).
   Renders rich inline product cards (image, exact price, Add button). Loads AFTER app.js. */

(function () {
  "use strict";

  const A = { convo: [], busy: false, started: false };
  const el = (id) => document.getElementById(id);
  const cfg = () => (DATA && DATA.meta) || {};
  // Proxy URL = production config, OR a localhost-only dev override (set via
  // localStorage 'eo.proxyOverride') so we can test the live AI without editing data.json.
  const proxyUrl = () => {
    try {
      const o = localStorage.getItem("eo.proxyOverride");
      if (o && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(o)) return o;
    } catch {}
    return cfg().assistantProxyUrl || "";
  };
  const live = () => !!proxyUrl();
  const ready = () => DATA && DATA.products && DATA.products.length;

  /* ---------- catalog grounding ---------- */
  function catalogText() {
    return DATA.products.map((p) =>
      `${p.id} | ${p.name} (${p.brand}) | ${p.unit} | $${p.price.toFixed(2)}` +
      `${p.priceWas && p.priceWas !== p.price ? ` (was $${p.priceWas.toFixed(2)})` : ""} | stock:${p.stock}`
    ).join("\n");
  }
  function systemPrompt() {
    return [
      "You are the EasyOrder Helper. Think of yourself as doing the shopping homework FOR the",
      "shopper — especially older adults: you compare the options, explain your pick in plain",
      "words, and remember what matters to them. They always make the final call and tap Pay.",
      "You never buy, track, or return anything yourself, and you never watch prices over time —",
      "you help in the moment they ask. Be warm, calm and brief. Use short, plain sentences.",
      "",
      "You may ONLY recommend items from the catalog below. Never invent items or prices.",
      "Always quote the EXACT price shown. If an item's stock is 'out', say so and don't add it.",
      "When the shopper wants items, call add_to_cart with the exact ids and confirm what you added",
      "and the running total. To review or pay, call open_cart — the shopper taps 'Pay with Apple",
      "Pay' themselves; never claim you charged them. Keep replies to 1–3 short sentences.",
      "Never upsell or pressure the shopper — only add what they actually ask for. Be calm and patient.",
      "",
      "CONSIDERED PURCHASES: some items (listed under DECISIONS) are bigger decisions where the",
      "shopper would otherwise have to research for ages. For these, do NOT just list products.",
      "First ask the 1-3 short gating questions for that decision, one friendly turn. Then call",
      "recommend(need, constraints). The shopper will then SEE rich comparison cards showing each",
      "finalist's price, your confidence, and the why / why-not — so keep your spoken reply SHORT:",
      "1-2 sentences naming your ONE pick and the single biggest reason (lead with cost-to-own or",
      "reliability, not just price). Don't re-list every detail in prose — the cards do that. Never",
      "state a confidence higher than recommend returned; if it's low, say it's a close call. The",
      "shopper always decides and taps Add / Pay — you never buy for them.",
      "",
      "DECISIONS (considered purchases — run recommend for these):",
      decisionsText(),
      "",
      "REMEMBERED PREFERENCES (the shopper told you these — honor them, and say so when they change a pick):",
      prefsText(),
      "When recommend() returns a non-empty prefExcluded list, you MUST name those brands and say you",
      "left them out because the shopper asked you to avoid them — never let an avoided brand silently vanish.",
      "If the shopper states a NEW standing preference (a brand they avoid, a material they like),",
      "ask if they'd like you to remember it; only if they say yes, call save_preference. Never",
      "invent or infer preferences. For an allergy or material you can't verify against the catalog,",
      "treat it as a caution — say you can't confirm an item is safe; never guarantee that it is.",
      "",
      "CATALOG (id | name | unit | price | stock):",
      catalogText(),
    ].join("\n");
  }

  const TOOLS = [
    { type: "function", function: { name: "add_to_cart", description: "Add one or more catalog items to the cart.",
      parameters: { type: "object", properties: { items: { type: "array", items: { type: "object",
        properties: { id: { type: "string" }, qty: { type: "integer", minimum: 1 } }, required: ["id"] } } }, required: ["items"] } } },
    { type: "function", function: { name: "search_catalog", description: "Find catalog items matching a search term.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    { type: "function", function: { name: "view_cart", description: "Get the current cart contents and total.",
      parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "open_cart", description: "Open the cart so the shopper can review and pay.",
      parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "recommend", description: "For a CONSIDERED purchase (e.g. a printer), score the catalog options against the shopper's needs and return finalists, one recommended pick, a confidence score, and why each other was set aside. Call this AFTER asking the 1-3 short gating questions.",
      parameters: { type: "object", properties: {
        need: { type: "string", description: "what they're buying, e.g. 'printer'" },
        constraints: { type: "object", description: "gathered constraints, e.g. {budget:200, wireless:true, duplex:true}" } }, required: ["need"] } } },
    { type: "function", function: { name: "save_preference", description: "Remember a standing shopping preference the shopper EXPLICITLY stated. Only call AFTER they confirm they want it remembered. Use kind 'avoid_brand' for a brand to avoid; 'note' for anything else (e.g. a material they prefer).",
      parameters: { type: "object", properties: {
        kind: { type: "string", enum: ["avoid_brand", "note"] },
        value: { type: "string", description: "the brand name (for avoid_brand) or the short preference text (for note)" } }, required: ["kind", "value"] } } },
  ];

  function searchCatalog(query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return DATA.products.filter((p) => {
      const hay = (p.name + " " + p.brand + " " + p.category).toLowerCase();
      return words.some((w) => hay.includes(w));
    });
  }

  /* ---------- considered-purchase decision engine (deterministic, local) ----------
     Same discipline as the cart tools: scoring runs HERE on real catalog data, so a
     recommendation can never be hallucinated — the LLM only narrates the numbers. */
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const listDecisions = () => (DATA && DATA.decisions) || [];
  function findDecision(need) {
    const t = String(need || "").toLowerCase();
    const d = listDecisions();
    return d.find((x) => x.id === t)
        || d.find((x) => t.includes(x.id) || t.includes(x.need)
             || x.need.split(/\s+/).some((w) => w.length > 3 && t.includes(w)))
        || null;
  }
  function attrNum(p, attr) {
    const v = p && p.attrs ? p.attrs[attr] : null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v;
    return null;
  }
  function decisionsText() {
    return listDecisions().map((d) =>
      `- ${d.need} (id:${d.id}) — ask about: ${(d.ask || []).map((q) => q.id).join(", ")}`
    ).join("\n") || "(none)";
  }
  function getPrefs() { return (typeof window !== "undefined" && window.getPrefs) ? window.getPrefs() : []; }
  function prefsText() {
    const p = getPrefs();
    if (!p.length) return "(none yet)";
    return p.map((x) => x.kind === "avoid_brand" ? `- avoids brand: ${x.value}` : `- note: ${x.value}`).join("\n");
  }

  function scoreDecision(need, constraints) {
    constraints = constraints || {};
    const dec = findDecision(need);
    if (!dec) return { error: "no decision profile for that", available: listDecisions().map((d) => d.need) };

    let pool = (dec.candidateIds || []).map((id) => PRODUCTS[id]).filter((p) => p && p.stock !== "out");
    const totalC = Object.keys(constraints).length;
    let met = 0;

    // Personal Memory: drop brands the shopper explicitly told us to avoid (real catalog match).
    const avoid = getPrefs().filter((p) => p.kind === "avoid_brand").map((p) => String(p.value).toLowerCase()).filter(Boolean);
    let prefExcluded = [];
    if (avoid.length) {
      prefExcluded = pool.filter((p) => avoid.some((a) => (p.brand || "").toLowerCase().includes(a) || (p.name || "").toLowerCase().includes(a)));
      pool = pool.filter((p) => prefExcluded.indexOf(p) === -1);
    }

    // hard filters: budget + any boolean/categorical requirement named in dec.ask
    if (constraints.budget != null) { pool = pool.filter((p) => p.price <= Number(constraints.budget) * 1.05); met++; }
    (dec.ask || []).forEach((q) => {
      if (q.id === "budget") return;
      const v = constraints[q.id];
      if (v == null) return;
      met++;
      if (typeof v === "boolean") { if (v) pool = pool.filter((p) => attrNum(p, q.id) === 1); }
      else pool = pool.filter((p) => !p.attrs || p.attrs[q.id] == null || String(p.attrs[q.id]) === String(v));
    });
    if (!pool.length) return { error: "nothing in stock fits those constraints", relax: true, need: dec.need };

    const rubric = dec.rubric || [];
    const range = {};
    rubric.forEach((r) => {
      const vals = pool.map((p) => attrNum(p, r.attr)).filter((n) => n != null);
      range[r.attr] = { min: Math.min(...vals), max: Math.max(...vals) };
    });
    const scored = pool.map((p) => {
      const parts = {}; let total = 0;
      rubric.forEach((r) => {
        const raw = attrNum(p, r.attr); const { min, max } = range[r.attr];
        let n = raw == null ? 0 : (max === min ? 1 : (raw - min) / (max - min));
        if (r.dir === "low") n = 1 - n;
        const points = n * r.weight * 100; parts[r.attr] = points; total += points;
      });
      return { p, score: Math.round(total), parts };
    }).sort((a, b) => b.score - a.score);

    const pick = scored[0], runner = scored[1];
    const gap = runner ? pick.score - runner.score : 30;
    const evidence = clamp((pick.p.reviewCount || 0) / 5000, 0, 1);
    const cFrac = totalC ? clamp(met / totalC, 0, 1) : 1;
    const confidence = Math.round(clamp(0.5 + 0.3 * clamp(gap / 20, 0, 1) + 0.1 * evidence + 0.1 * cFrac, 0.45, 0.97) * 100);

    const reasonFor = (s) => {
      let worst = null, d = -1;
      rubric.forEach((r) => { const gp = (pick.parts[r.attr] || 0) - (s.parts[r.attr] || 0); if (gp > d) { d = gp; worst = r; } });
      return worst ? (worst.worsePhrase || `${worst.label || worst.attr} isn't as strong`) : "edged out overall";
    };
    const finalists = scored.slice(0, 3).map((s) => {
      surfaced.push(s.p.id);
      return { id: s.p.id, name: s.p.name, price: s.p.price, score: s.score, isPick: s === pick,
               note: s === pick ? ((pick.p.attrs && pick.p.attrs.bestFor) || "best overall fit") : reasonFor(s),
               tradeoff: s.p.tradeoff || "" };
    });
    return { need: dec.need, consideredCount: (dec.candidateIds || []).length, finalists,
             pick: { id: pick.p.id, name: pick.p.name, price: pick.p.price }, confidence,
             prefExcluded: prefExcluded.map((p) => p.name), verified: dec.verified !== false };
  }

  /* tool executors — authoritative, real prices. Returns ids surfaced (for inline cards). */
  let surfaced = [];
  let lastRec = null;        // last recommend() result, for rich decision cards
  function runTool(name, args) {
    args = args || {};
    if (name === "add_to_cart") {
      // Some models return `items` as a JSON-encoded string or a single object — normalize it.
      let items = args.items;
      if (typeof items === "string") { try { items = JSON.parse(items); } catch { items = []; } }
      if (items && !Array.isArray(items)) items = [items];
      const added = [];
      (items || []).forEach((it) => {
        const p = PRODUCTS[it.id];
        if (!p || p.stock === "out") return;
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        addToCart(it.id, qty); added.push(p.id); surfaced.push(p.id);
      });
      return { added: added.map((id) => ({ id, name: PRODUCTS[id].name, price: PRODUCTS[id].price })),
               cartTotal: Number(cartTotal().toFixed(2)) };
    }
    if (name === "search_catalog") {
      const r = searchCatalog(args.query).slice(0, 6);
      r.forEach((p) => surfaced.push(p.id));
      return { results: r.map((p) => ({ id: p.id, name: p.name, price: p.price, unit: p.unit, stock: p.stock })) };
    }
    if (name === "view_cart") return { items: cartItems().map((p) => ({ id: p.id, name: p.name, qty: p.qty, price: p.price })), total: Number(cartTotal().toFixed(2)) };
    if (name === "open_cart") { openCart(); return { opened: true }; }
    if (name === "recommend") { lastRec = scoreDecision(args.need, args.constraints || {}); return lastRec; }
    if (name === "save_preference") {
      if (typeof window !== "undefined" && window.savePref && args.value) {
        window.savePref({ kind: args.kind === "avoid_brand" ? "avoid_brand" : "note", value: String(args.value), raw: String(args.value) });
        return { saved: true, kind: args.kind, value: args.value };
      }
      return { saved: false };
    }
    return { error: "unknown tool" };
  }

  /* ---------- live: tool-calling loop ---------- */
  async function liveTurn() {
    surfaced = [];
    lastRec = null;
    let guard = 0;
    while (guard++ < 4) {
      const res = await fetch(proxyUrl(), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg().assistantModel, messages: A.convo, tools: TOOLS, tool_choice: "auto" }) });
      if (!res.ok) throw new Error("assistant service " + res.status);
      const data = await res.json();
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) throw new Error("no reply");
      A.convo.push(msg);
      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          let parsed = {}; try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch {}
          A.convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(runTool(tc.function.name, parsed)) });
        }
        continue;
      }
      return { text: msg.content || "Okay.", ids: [...new Set(surfaced)], decision: (lastRec && !lastRec.error) ? lastRec : null };
    }
    return { text: "Let's keep going — what would you like to order?", ids: [...new Set(surfaced)], decision: null };
  }

  /* ---------- demo: grounded, rule-based ---------- */
  function dueReorderIds() {
    const h = safeHistory();
    return Object.keys(h).filter((id) => {
      const p = PRODUCTS[id];
      return p && p.reorderDays > 0 && !cart[id] && daysSince(h[id]) >= p.reorderDays;
    });
  }
  function demoTurn(text) {
    const t = text.toLowerCase();
    const dec0 = findDecision(t);
    // a consumable/accessory ("printer paper", "vacuum bags") is NOT a request to compare the device
    const accessory = /\b(paper|ink|bag|bags|filter|filters|cartridge|cartridges|toner|refill|refills|roll|rolls)\b/.test(t);
    if (dec0 && !accessory) {
      // generic constraint detection: only sets gating keys the matched decision actually asks
      const c = {};
      const m = t.match(/\$?\s?(\d{2,4})/); if (m) c.budget = parseInt(m[1], 10);
      const HINTS = {
        color: /\b(colou?r|photos?|pictures?)\b/,
        petHair: /\b(pet|pets|dog|dogs|cat|cats|hair|fur|shed)\b/,
        selfEmpty: /\b(self.?empt|empties? itself|hands.?off|auto.?empt|never touch)\b/,
        wireless: /\b(wireless|wifi|wi-fi)\b/,
        duplex: /\b(double|duplex|two[- ]sided|both sides)\b/,
      };
      (dec0.ask || []).forEach((q) => { if (q.id !== "budget" && HINTS[q.id] && HINTS[q.id].test(t)) c[q.id] = true; });
      const r = scoreDecision(dec0.id, c);
      if (!r.error) {
        const pk = r.finalists.find((f) => f.isPick) || r.finalists[0];
        const close = r.confidence < 60;
        const excl = (r.prefExcluded && r.prefExcluded.length)
          ? ` I left out ${r.prefExcluded.join(" and ")} — you told me to avoid that brand.` : "";
        const txt = `I compared ${r.consideredCount} ${r.need}s and I'd pick the ${pk.name}.` + excl +
          (close ? ` It's a close call though — here's how the top ${r.finalists.length} stack up:` : ` Here's how the top ${r.finalists.length} compare — tap "Add" on the one you like:`);
        return { text: txt, ids: r.finalists.map((f) => f.id), decision: r };
      }
    }
    if (/\b(usual|usuals|reorder|again|restock)\b/.test(t)) {
      let ids = dueReorderIds();
      if (!ids.length) ids = Object.keys(safeHistory()).filter((id) => PRODUCTS[id]);
      if (!ids.length) ids = ["milk-2pct-gal", "bread-whole-wheat", "eggs-large-dozen"].filter((id) => PRODUCTS[id]);
      ids = ids.slice(0, 4).filter((id) => PRODUCTS[id].stock !== "out");
      ids.forEach((id) => addToCart(id, 1));
      const sum = ids.reduce((a, id) => a + PRODUCTS[id].price, 0);
      // Only call them "your usual" items if there's a REAL purchase on record — otherwise it's demo filler.
      const real = (typeof window !== "undefined" && window.hasRealOrders && window.hasRealOrders());
      const lead = real ? "Done! I added your usual items" : "Done! I added some staples people often reorder";
      return { text: `${lead} — that's ${money(sum)} so far. Tap a price if you'd like more, or say "checkout" when ready.`, ids };
    }
    if (/\b(sale|deal|deals|cheaper|discount|save|saving)\b/.test(t)) {
      const ids = DATA.products.filter((p) => p.priceWas && p.price < p.priceWas)
        .sort((a, b) => (b.priceWas - b.price) - (a.priceWas - a.price)).slice(0, 4).map((p) => p.id);
      if (ids.length) return { text: `Here's what dropped in price today — want me to add any?`, ids };
    }
    if (/\b(cart|checkout|check out|pay|buy now|place order)\b/.test(t)) {
      openCart(); return { text: "I've opened your cart — tap 'Pay with Apple Pay' when you're ready.", ids: [] };
    }
    const addMatch = t.match(/\b(add|need|want|buy|get)\b\s+(.*)/);
    if (addMatch) {
      const hits = searchCatalog(addMatch[2]).filter((p) => p.stock !== "out");
      if (hits.length) {
        addToCart(hits[0].id, 1);
        const extra = hits.slice(1, 4).map((p) => p.id);
        return { text: `Added ${hits[0].name} (${money(hits[0].price)}). ${extra.length ? "Here are a few more you might want:" : "Anything else?"}`, ids: [hits[0].id, ...extra] };
      }
    }
    const matches = searchCatalog(t).slice(0, 4);
    if (matches.length) return { text: `Here's what I found — tap "Add" on anything you'd like:`, ids: matches.map((p) => p.id) };
    return { text: "I can help you reorder groceries, household items, personal care or health supplies. Try “reorder my usuals”, “what's on sale?”, or “I need milk and bread”.", ids: [] };
  }
  function safeHistory() { try { return JSON.parse(localStorage.getItem("eo.history") || "{}"); } catch { return {}; } }

  /* ---------- rendering ---------- */
  function scrollDown() { const s = el("chatScroll"); if (s) s.scrollTop = s.scrollHeight; }
  function hideWelcome() { const w = el("welcome"); if (w) w.hidden = true; }
  function userMsg(text) {
    hideWelcome();
    const d = document.createElement("div"); d.className = "c-msg c-user";
    const b = document.createElement("div"); b.className = "c-bubble"; b.textContent = text;
    d.appendChild(b); el("chatMessages").appendChild(d); scrollDown();
  }
  function productCardsHTML(ids) {
    const list = [...new Set(ids)].map((id) => PRODUCTS[id]).filter(Boolean);
    if (!list.length) return "";
    return `<div class="c-prods">` + list.map((p) => {
      const out = p.stock === "out";
      const q = encodeURIComponent(`${p.brand} ${p.name}`.trim());
      return `<div class="c-prod"><span class="c-prod-img">${esc(p.emoji || "📦")}</span>
        <div class="c-prod-info"><div class="c-prod-name">${esc(p.name)}</div>
          <div class="c-prod-meta">${esc(p.unit)} · <span class="c-prod-price">${money(p.price)}</span>
            · <a class="view-link" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener noreferrer" aria-label="see photos (opens a new tab)">see photos ↗</a></div></div>
        <button class="c-prod-add" data-add-chat="${esc(p.id)}" ${out ? "disabled" : ""}>${out ? "Out" : "Add"}</button></div>`;
    }).join("") + `</div>`;
  }
  /* rich comparison cards for a considered purchase: pick badged, confidence, why / why-not */
  function confBand(c) { return c >= 75 ? "high" : c >= 60 ? "mid" : "low"; }
  function decisionCardsHTML(d) {
    if (!d || !d.finalists || !d.finalists.length) return "";
    const cards = d.finalists.map((f) => {
      const p = PRODUCTS[f.id]; if (!p) return "";
      const out = p.stock === "out";
      const q = encodeURIComponent(`${p.brand} ${p.name}`.trim());
      const bar = Math.max(6, Math.min(100, Math.round(f.score || 0)));
      return `<div class="c-rec-card${f.isPick ? " pick" : ""}">
        <span class="c-rec-badge${f.isPick ? "" : " alt"}">${f.isPick ? "✓ My pick" : "Also considered"}</span>
        <div class="c-rec-top"><span class="c-prod-img">${esc(p.emoji || "📦")}</span>
          <div class="c-prod-info"><div class="c-prod-name">${esc(p.name)}</div>
            <div class="c-prod-meta">${esc(p.unit)} · <span class="c-prod-price">${money(p.price)}</span>
              · <a class="view-link" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener noreferrer" aria-label="see photos (opens a new tab)">see photos ↗</a></div></div>
          <button class="c-prod-add" data-add-chat="${esc(p.id)}" ${out ? "disabled" : ""}>${out ? "Out" : "Add"}</button></div>
        <div class="c-rec-why ${f.isPick ? "good" : "muted"}">${f.isPick ? "👍 " : "— "}${esc(f.note || "")}</div>
        ${f.isPick && f.tradeoff ? `<div class="c-rec-trade">Heads-up: ${esc(f.tradeoff)}</div>` : ""}
        <div class="c-rec-bar"><i style="width:${bar}%"></i></div></div>`;
    }).join("");
    const band = confBand(d.confidence);
    const title = band === "low" ? "Close call" : "My recommendation";
    // Deterministic honesty: always disclose brands removed by a remembered preference,
    // so an avoided brand never silently vanishes (doesn't depend on the LLM remembering to say it).
    const exclNote = (d.prefExcluded && d.prefExcluded.length)
      ? `<p class="c-rec-excl">🚫 Left out ${d.prefExcluded.map(esc).join(" and ")} — you asked me to avoid that brand.</p>` : "";
    // honest about data maturity: categories not yet fully fact-checked carry a visible caveat
    const seedNote = d.verified === false
      ? `<p class="c-rec-excl">ⓘ These are early estimates — I haven't finished fact-checking this category yet.</p>` : "";
    return `<div class="c-rec"><div class="c-rec-head">
        <span class="c-rec-title">${title}</span>
        <span class="c-rec-conf ${band}">${d.confidence}% confident</span>
      </div>${cards}${exclNote}${seedNote}</div>`;
  }
  function botMsg(text, ids, decision) {
    const d = document.createElement("div"); d.className = "c-msg c-bot";
    const cards = decision && decision.finalists ? decisionCardsHTML(decision)
                : (ids && ids.length ? productCardsHTML(ids) : "");
    d.innerHTML = `<div class="avatar" aria-hidden="true">🛒</div><div class="c-bubble">${esc(text)}${cards}</div>`;
    el("chatMessages").appendChild(d); scrollDown();
  }
  function typing(on) {
    let t = el("cTyping");
    if (on && !t) {
      t = document.createElement("div"); t.id = "cTyping"; t.className = "c-msg c-bot";
      t.innerHTML = `<div class="avatar" aria-hidden="true">🛒</div><div class="c-bubble"><div class="c-typing"><i></i><i></i><i></i></div></div>`;
      el("chatMessages").appendChild(t); scrollDown();
    } else if (!on && t) t.remove();
  }
  function renderSuggestions() {
    const chips = [
      { icon: "🔁", label: "Reorder my usual items", q: "reorder my usual items" },
      { icon: "🥪", label: "Plan a simple meal", q: "help me plan a simple meal and add what I'd need" },
      { icon: "🔎", label: "Find something specific", q: "help me find a specific item" },
      { icon: "🧺", label: "What do I usually buy?", q: "what do I usually buy?" },
    ];
    el("chatSuggestions").innerHTML = chips.map((c) =>
      `<button type="button" class="c-sug" data-chip="${esc(c.q)}"><span aria-hidden="true">${c.icon}</span> ${esc(c.label)}</button>`).join("");
  }

  function ensureStarted() {
    if (A.started || !ready()) return;
    A.started = true;
    A.convo = [{ role: "system", content: systemPrompt() }];
    // The greeting lives in the calm #welcome block — no auto-message, no nudge to buy.
    el("chatNote").textContent = live()
      ? "I show real prices, and I only add things when you ask. Take your time."
      : "Demo mode — connect Fireworks AI (see AI.md) for full conversation.";
    el("chatNote").className = "composer-note" + (live() ? "" : " demo");
    renderSuggestions();
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || A.busy) return;
    if (!ready()) { botMsg("One moment — still loading the store.", []); return; }
    userMsg(text); el("chatInput").value = "";
    A.busy = true; typing(true);
    try {
      const reply = live() ? (A.convo.push({ role: "user", content: text }), await liveTurn()) : demoTurn(text);
      typing(false); botMsg(reply.text, reply.ids, reply.decision);
    } catch (err) {
      typing(false);
      botMsg("Sorry — I couldn't reach the assistant just now. " + (live() ? "Check the proxy is deployed (see AI.md)." : ""), []);
    } finally { A.busy = false; }
  }

  /* ---------- concierge open / close ---------- */
  let lastFocus = null;
  function isOpen() { const c = el("concierge"); return c && !c.hidden; }
  function openConcierge() {
    lastFocus = document.activeElement;
    ensureStarted();
    el("conciergeBackdrop").hidden = false;
    el("concierge").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => { const i = el("chatInput"); if (i) i.focus(); scrollDown(); }, 60);
  }
  function closeConcierge() {
    el("concierge").hidden = true;
    el("conciergeBackdrop").hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    if (e.target.closest("#conciergeOpen") || e.target.closest("#conciergeFab")) { openConcierge(); return; }
    if (e.target.closest("#conciergeClose") || e.target.id === "conciergeBackdrop") { closeConcierge(); return; }
    const chip = e.target.closest("[data-chip]");
    if (chip) { send(chip.dataset.chip); return; }
    const addc = e.target.closest("[data-add-chat]");
    if (addc && !addc.disabled) {
      const p = PRODUCTS[addc.dataset.addChat]; if (!p) return;
      addToCart(p.id, 1); addc.textContent = "Added ✓"; addc.classList.add("added"); addc.disabled = true; return;
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) closeConcierge(); });
  const form = el("chatForm");
  if (form) form.addEventListener("submit", (e) => { e.preventDefault(); send(el("chatInput").value); });

  /* start once data.json has loaded (app.js fetches it async) */
  (function waitData(n) {
    if (ready()) ensureStarted();
    else if (n < 80) setTimeout(() => waitData(n + 1), 100);
  })(0);
})();
