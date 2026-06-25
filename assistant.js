/* EasyOrder — "Ask EasyOrder" AI shopping assistant.
   Grounded in the real catalog (so prices are never invented) and able to act on the
   cart through function-calling tools. Two modes, chosen by data.json meta.assistantProxyUrl:
     - empty  -> grounded DEMO mode (rule-based, works offline, no key needed)
     - set    -> LIVE mode: chat goes through your serverless proxy to Fireworks AI
   It reuses the globals defined in app.js: DATA, PRODUCTS, addToCart, openCart,
   cartItems, cartTotal, money, history. assistant.js must load AFTER app.js. */

(function () {
  "use strict";

  const A = {
    open: false,
    convo: [],          // chat history for the model (system + turns)
    busy: false,
    started: false,
  };

  const el = (id) => document.getElementById(id);
  // app.js declares `DATA` with `let` (global lexical scope) — reachable here by bare name,
  // but NOT as a property of window, so always reference `DATA`, never `window.DATA`.
  const cfg = () => (DATA && DATA.meta) || {};
  const live = () => !!cfg().assistantProxyUrl;

  /* ---------- catalog grounding ---------- */
  function catalogText() {
    return DATA.products.map((p) =>
      `${p.id} | ${p.name} (${p.brand}) | ${p.unit} | $${p.price.toFixed(2)}` +
      `${p.priceWas && p.priceWas !== p.price ? ` (was $${p.priceWas.toFixed(2)})` : ""} | stock:${p.stock}`
    ).join("\n");
  }
  function systemPrompt() {
    return [
      "You are the EasyOrder shopping assistant. You help people — especially older adults —",
      "reorder home essentials. Be warm, calm, and brief. Use short, plain sentences.",
      "",
      "You may ONLY recommend items from the catalog below. Never invent items or prices.",
      "Always quote the EXACT price shown. If an item's stock is 'out', say so and do not add it.",
      "When the shopper wants items, call add_to_cart with the exact ids and confirm what you",
      "added and the running total. To review or pay, call open_cart — the shopper taps",
      "'Pay with Apple Pay' themselves; never claim you charged them. Keep replies to 1–3 sentences.",
      "",
      "CATALOG (id | name | unit | price | stock):",
      catalogText(),
    ].join("\n");
  }

  /* ---------- tool schemas (OpenAI / Fireworks format) ---------- */
  const TOOLS = [
    { type: "function", function: { name: "add_to_cart",
      description: "Add one or more catalog items to the shopper's cart.",
      parameters: { type: "object", properties: { items: { type: "array", items: {
        type: "object", properties: { id: { type: "string" }, qty: { type: "integer", minimum: 1 } },
        required: ["id"] } } }, required: ["items"] } } },
    { type: "function", function: { name: "search_catalog",
      description: "Find catalog items matching a search term (name, brand or category).",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    { type: "function", function: { name: "view_cart",
      description: "Get the shopper's current cart contents and total.",
      parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "open_cart",
      description: "Open the cart drawer so the shopper can review and pay with Apple Pay.",
      parameters: { type: "object", properties: {} } } },
  ];

  /* ---------- tool executors (authoritative — real prices from data.json) ---------- */
  function searchCatalog(query) {
    const q = String(query || "").toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return DATA.products.filter((p) => {
      const hay = (p.name + " " + p.brand + " " + p.category).toLowerCase();
      return words.some((w) => hay.includes(w));
    }).slice(0, 6).map((p) => ({ id: p.id, name: p.name, price: p.price, unit: p.unit, stock: p.stock }));
  }
  function runTool(name, args) {
    if (name === "add_to_cart") {
      const added = [], skipped = [];
      (args.items || []).forEach((it) => {
        const p = PRODUCTS[it.id];
        if (!p) { skipped.push({ id: it.id, reason: "not found" }); return; }
        if (p.stock === "out") { skipped.push({ id: it.id, reason: "out of stock" }); return; }
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        addToCart(it.id, qty);
        added.push({ id: p.id, name: p.name, qty, price: p.price });
      });
      return { added, skipped, cartTotal: Number(cartTotal().toFixed(2)) };
    }
    if (name === "search_catalog") return { results: searchCatalog(args.query) };
    if (name === "view_cart") {
      return { items: cartItems().map((p) => ({ id: p.id, name: p.name, qty: p.qty, price: p.price })),
               total: Number(cartTotal().toFixed(2)) };
    }
    if (name === "open_cart") { openCart(); return { opened: true }; }
    return { error: "unknown tool" };
  }

  /* ---------- live mode: tool-calling loop via the proxy ---------- */
  async function liveTurn() {
    let guard = 0;
    while (guard++ < 4) {
      const res = await fetch(cfg().assistantProxyUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg().assistantModel, messages: A.convo, tools: TOOLS, tool_choice: "auto" }),
      });
      if (!res.ok) throw new Error("assistant service error " + res.status);
      const data = await res.json();
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) throw new Error("no reply from assistant");
      A.convo.push(msg);
      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          let parsed = {};
          try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const result = runTool(tc.function.name, parsed);
          A.convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue; // let the model respond to the tool results
      }
      return msg.content || "Okay.";
    }
    return "Let's keep going — what would you like to order?";
  }

  /* ---------- demo mode: grounded, rule-based (no key needed) ---------- */
  function demoTurn(text) {
    const t = text.toLowerCase();
    // reorder usuals — pull from purchase history, else common staples
    if (/\b(usual|usuals|reorder|again|restock|low|out)\b/.test(t)) {
      const hist = safeHistory();
      let ids = Object.keys(hist).filter((id) => PRODUCTS[id] && PRODUCTS[id].stock !== "out");
      if (!ids.length) ids = ["milk-2pct-gal", "bread-whole-wheat", "eggs-large-dozen"].filter((id) => PRODUCTS[id]);
      ids = ids.slice(0, 4);
      if (ids.length) {
        ids.forEach((id) => addToCart(id, 1));
        const names = ids.map((id) => PRODUCTS[id].name).join(", ");
        const sum = ids.reduce((a, id) => a + PRODUCTS[id].price, 0);
        return `I added your usual items: ${names}. That's ${money(sum)} so far. Want to review your cart?`;
      }
    }
    // on sale
    if (/\b(sale|deal|deals|cheaper|discount|save|saving|on sale)\b/.test(t)) {
      const drops = DATA.products.filter((p) => p.priceWas && p.price < p.priceWas).slice(0, 4);
      if (drops.length) return `On sale right now: ${drops.map((p) => `${p.name} ${money(p.price)} (was ${money(p.priceWas)})`).join("; ")}. Want me to add any?`;
    }
    // cart / pay
    if (/\b(cart|checkout|check out|pay|buy now|place order)\b/.test(t)) {
      openCart();
      return "I've opened your cart — tap 'Pay with Apple Pay' when you're ready.";
    }
    // explicit add
    const addMatch = t.match(/\badd\b\s+(.*)/);
    if (addMatch) {
      const hits = searchCatalog(addMatch[1]);
      const usable = hits.filter((h) => h.stock !== "out");
      if (usable.length) {
        addToCart(usable[0].id, 1);
        return `Added ${usable[0].name} (${money(usable[0].price)}) to your cart. Anything else?`;
      }
    }
    // keyword search
    const matches = searchCatalog(t);
    if (matches.length) {
      return `I found: ${matches.map((p) => `${p.name} ${money(p.price)}${p.stock === "out" ? " (out of stock)" : ""}`).join("; ")}. Say "add ${matches[0].name}" and I'll put it in your cart.`;
    }
    return "I can help you reorder groceries, household items, personal care or health supplies. Try “reorder my usuals”, “what's on sale?”, or “add milk”.";
  }
  function safeHistory() {
    try { return JSON.parse(localStorage.getItem("eo.history") || "{}"); } catch { return {}; }
  }

  /* ---------- UI ---------- */
  function bubble(role, text) {
    const wrap = document.createElement("div");
    wrap.className = "a-msg a-" + role;
    wrap.textContent = text;
    el("assistantMsgs").appendChild(wrap);
    el("assistantMsgs").scrollTop = el("assistantMsgs").scrollHeight;
    return wrap;
  }
  function typing(on) {
    let t = el("aTyping");
    if (on && !t) { t = bubble("bot", "…"); t.id = "aTyping"; }
    else if (!on && t) t.remove();
  }

  function ensureStarted() {
    if (A.started) return;
    A.started = true;
    A.convo = [{ role: "system", content: systemPrompt() }];
    bubble("bot", live()
      ? "Hello! I'm your EasyOrder helper. Tell me what you need — for example, “reorder my usuals” or “I'm low on cleaning supplies.”"
      : "Hello! I'm your EasyOrder helper. Try “reorder my usuals”, “what's on sale?”, or “add milk”.");
    el("assistantNote").textContent = live() ? "" : "Demo mode — connect Fireworks AI (see AI.md) for full conversation.";
    renderSuggestions();
  }
  function renderSuggestions() {
    const chips = ["Reorder my usuals", "What's on sale?", "I'm low on cleaning supplies", "Open my cart"];
    el("assistantSuggest").innerHTML = chips.map((c) =>
      `<button type="button" class="a-chip" data-chip="${c.replace(/"/g, "&quot;")}">${c}</button>`).join("");
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || A.busy) return;
    if (!(DATA && DATA.products && DATA.products.length)) { bubble("bot", "One moment — still loading the store."); return; }
    bubble("user", text);
    el("assistantText").value = "";
    A.busy = true; typing(true);
    try {
      let reply;
      if (live()) { A.convo.push({ role: "user", content: text }); reply = await liveTurn(); }
      else { reply = demoTurn(text); }
      typing(false); bubble("bot", reply);
    } catch (err) {
      typing(false);
      bubble("bot", "Sorry — I couldn't reach the assistant just now. " + (live() ? "Check the proxy is deployed (see AI.md)." : ""));
    } finally { A.busy = false; }
  }

  function openPanel() {
    ensureStarted();
    A.open = true;
    el("assistant").hidden = false;
    el("assistantLaunch").setAttribute("aria-expanded", "true");
    setTimeout(() => el("assistantText").focus(), 0);
  }
  function closePanel() {
    A.open = false;
    el("assistant").hidden = true;
    el("assistantLaunch").setAttribute("aria-expanded", "false");
    el("assistantLaunch").focus();
  }

  /* ---------- wire up ---------- */
  document.addEventListener("click", (e) => {
    if (e.target.closest("#assistantLaunch")) { A.open ? closePanel() : openPanel(); return; }
    if (e.target.closest("#assistantClose")) { closePanel(); return; }
    const chip = e.target.closest("[data-chip]");
    if (chip) { send(chip.dataset.chip); return; }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && A.open) closePanel(); });
  const form = el("assistantForm");
  if (form) form.addEventListener("submit", (e) => { e.preventDefault(); send(el("assistantText").value); });
})();
