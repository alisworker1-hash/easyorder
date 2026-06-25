/* EasyOrder — the inline "EasyOrder Helper" chat (ChatGPT-style, on the homepage).
   Grounded in the real catalog and able to act on the cart via function-calling tools.
   Two modes via data.json meta.assistantProxyUrl: empty = grounded DEMO, set = LIVE (Fireworks).
   Renders rich inline product cards (image, exact price, Add button). Loads AFTER app.js. */

(function () {
  "use strict";

  const A = { convo: [], busy: false, started: false };
  const el = (id) => document.getElementById(id);
  const cfg = () => (DATA && DATA.meta) || {};
  const live = () => !!cfg().assistantProxyUrl;
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
      "You are the EasyOrder Helper. You help people — especially older adults — reorder home",
      "essentials. Be warm, calm and brief. Use short, plain sentences.",
      "",
      "You may ONLY recommend items from the catalog below. Never invent items or prices.",
      "Always quote the EXACT price shown. If an item's stock is 'out', say so and don't add it.",
      "When the shopper wants items, call add_to_cart with the exact ids and confirm what you added",
      "and the running total. To review or pay, call open_cart — the shopper taps 'Pay with Apple",
      "Pay' themselves; never claim you charged them. Keep replies to 1–3 short sentences.",
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
  ];

  function searchCatalog(query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return DATA.products.filter((p) => {
      const hay = (p.name + " " + p.brand + " " + p.category).toLowerCase();
      return words.some((w) => hay.includes(w));
    });
  }

  /* tool executors — authoritative, real prices. Returns ids surfaced (for inline cards). */
  let surfaced = [];
  function runTool(name, args) {
    if (name === "add_to_cart") {
      const added = [];
      (args.items || []).forEach((it) => {
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
    return { error: "unknown tool" };
  }

  /* ---------- live: tool-calling loop ---------- */
  async function liveTurn() {
    surfaced = [];
    let guard = 0;
    while (guard++ < 4) {
      const res = await fetch(cfg().assistantProxyUrl, { method: "POST", headers: { "Content-Type": "application/json" },
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
      return { text: msg.content || "Okay.", ids: [...new Set(surfaced)] };
    }
    return { text: "Let's keep going — what would you like to order?", ids: [...new Set(surfaced)] };
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
    if (/\b(usual|usuals|reorder|again|restock)\b/.test(t)) {
      let ids = dueReorderIds();
      if (!ids.length) ids = Object.keys(safeHistory()).filter((id) => PRODUCTS[id]);
      if (!ids.length) ids = ["milk-2pct-gal", "bread-whole-wheat", "eggs-large-dozen"].filter((id) => PRODUCTS[id]);
      ids = ids.slice(0, 4).filter((id) => PRODUCTS[id].stock !== "out");
      ids.forEach((id) => addToCart(id, 1));
      const sum = ids.reduce((a, id) => a + PRODUCTS[id].price, 0);
      return { text: `Done! I added your usual items — that's ${money(sum)} so far. Tap a price if you'd like more, or say "checkout" when ready.`, ids };
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
  function scrollDown() { const m = el("chatMessages"); m.scrollTop = m.scrollHeight; }
  function userMsg(text) {
    const d = document.createElement("div"); d.className = "c-msg c-user"; d.textContent = text;
    el("chatMessages").appendChild(d); scrollDown();
  }
  function productCardsHTML(ids) {
    const list = [...new Set(ids)].map((id) => PRODUCTS[id]).filter(Boolean);
    if (!list.length) return "";
    return `<div class="c-prods">` + list.map((p) => {
      const img = p.image ? `<img class="c-prod-img" src="${p.image}" alt="" onerror="this.outerHTML='<span class=&quot;c-prod-img&quot;>${p.emoji || "📦"}</span>'">`
                          : `<span class="c-prod-img">${p.emoji || "📦"}</span>`;
      const out = p.stock === "out";
      return `<div class="c-prod">${img}
        <div class="c-prod-info"><div class="c-prod-name">${esc(p.name)}</div>
          <div class="c-prod-meta">${esc(p.unit)} · <span class="c-prod-price">${money(p.price)}</span></div></div>
        <button class="c-prod-add" data-add-chat="${esc(p.id)}" ${out ? "disabled" : ""}>${out ? "Out" : "Add"}</button></div>`;
    }).join("") + `</div>`;
  }
  function botMsg(text, ids) {
    const d = document.createElement("div"); d.className = "c-msg c-bot";
    d.innerHTML = esc(text) + (ids && ids.length ? productCardsHTML(ids) : "");
    el("chatMessages").appendChild(d); scrollDown();
  }
  function typing(on) {
    let t = el("cTyping");
    if (on && !t) { t = document.createElement("div"); t.id = "cTyping"; t.className = "c-msg c-bot c-typing"; t.innerHTML = "<i></i><i></i><i></i>"; el("chatMessages").appendChild(t); scrollDown(); }
    else if (!on && t) t.remove();
  }
  function renderSuggestions() {
    const chips = [
      { icon: "🔁", b: "Reorder my usuals", s: "Your regular items", q: "reorder my usuals" },
      { icon: "🏷️", b: "What's on sale?", s: "Today's price drops", q: "what's on sale?" },
      { icon: "🧴", b: "I'm low on cleaning", s: "Household supplies", q: "I need cleaning supplies" },
      { icon: "🛒", b: "Help me shop", s: "Not sure where to start", q: "help me shop for groceries" },
    ];
    el("chatSuggestions").innerHTML = chips.map((c) =>
      `<button type="button" class="c-sug" data-chip="${esc(c.q)}"><span class="c-sug-ico" aria-hidden="true">${c.icon}</span>
        <span><b>${esc(c.b)}</b><small>${esc(c.s)}</small></span></button>`).join("");
  }

  function ensureStarted() {
    if (A.started || !ready()) return;
    A.started = true;
    A.convo = [{ role: "system", content: systemPrompt() }];
    botMsg("Hi! I'm your EasyOrder Helper. 👋 Just tell me what you need — like “I need milk and bread” — and I'll find it, show the price, and add it to your cart.", []);
    const due = dueReorderIds();
    if (due.length) botMsg(`While you're here — you're about due for ${PRODUCTS[due[0]].name}. Want me to add it?`, [due[0]]);
    el("chatNote").textContent = live() ? "Ask me anything — I quote real prices and add items for you." : "Demo mode — connect Fireworks AI (see AI.md) for full conversation.";
    el("chatNote").className = "chat-note" + (live() ? "" : " demo");
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
      typing(false); botMsg(reply.text, reply.ids);
    } catch (err) {
      typing(false);
      botMsg("Sorry — I couldn't reach the assistant just now. " + (live() ? "Check the proxy is deployed (see AI.md)." : ""), []);
    } finally { A.busy = false; }
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chip]");
    if (chip) { send(chip.dataset.chip); return; }
    const addc = e.target.closest("[data-add-chat]");
    if (addc && !addc.disabled) {
      const p = PRODUCTS[addc.dataset.addChat]; if (!p) return;
      addToCart(p.id, 1); addc.textContent = "Added ✓"; addc.classList.add("added"); addc.disabled = true; return;
    }
    if (e.target.closest("#chatFab")) {
      document.getElementById("chat").scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el("chatInput").focus(), 300); return;
    }
  });
  const form = el("chatForm");
  if (form) form.addEventListener("submit", (e) => { e.preventDefault(); send(el("chatInput").value); });

  /* start once data.json has loaded (app.js fetches it async) */
  (function waitData(n) {
    if (ready()) ensureStarted();
    else if (n < 80) setTimeout(() => waitData(n + 1), 100);
  })(0);
})();
