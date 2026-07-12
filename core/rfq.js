/* EasyOrder core - RFQ generation.
   Turns a material list + selected suppliers into RFQ records and ready-to-send quote
   request emails (subject/body/mailto). No DOM, no network. Supports bulk (mass RFQ). */

import { createRFQ } from "./models.js";

/* One RFQ record addressed to one supplier. */
export function buildRFQ({ projectId = null, shoppingListId = null, supplier, materials, neededBy = null }) {
  return createRFQ({
    projectId, shoppingListId,
    supplierId: supplier.id,
    materialIds: materials.map((m) => m.id),
    neededBy,
  });
}

/* One RFQ record per supplier (the mass-RFQ primitive). */
export function buildBulkRFQs({ projectId = null, shoppingListId = null, suppliers, materials, neededBy = null }) {
  return suppliers.map((supplier) => buildRFQ({ projectId, shoppingListId, supplier, materials, neededBy }));
}

/* A human-readable quote-request email for one supplier. Returns { supplierId, subject,
   body, mailto }. `requester` = { name, company, email, phone }. */
export function rfqEmail({ supplier, materials, requester = {}, project = null, neededBy = null }) {
  const lines = materials.map((m, i) => {
    const parts = [`${i + 1}. ${m.item || "(item)"}`, `qty ${m.qty}${m.unit ? " " + m.unit : ""}`];
    if (m.size) parts.push(`size ${m.size}`);
    if (m.spec) parts.push(`spec ${m.spec}`);
    if (m.fulfillment) parts.push(m.fulfillment);
    if (m.notes) parts.push(`note: ${m.notes}`);
    return "   " + parts.join(" | ");
  }).join("\n");

  /* NOTE: no em dashes anywhere in generated copy (house style). */
  const count = materials.length;
  const subject = `Quote request${project ? ": " + project.name : ""} (${count} item${count === 1 ? "" : "s"})`;
  const need = neededBy || (project && project.neededBy) || null;
  const who = requester.name || "We";
  const withCo = requester.company ? ` (${requester.company})` : "";

  const body =
`Hi ${supplier.name ? supplier.name + " team" : "there"},

${who}${withCo} would like a quote on the following${project ? " for " + project.name : ""}:

${lines}

${need ? `Needed by: ${need}\n` : ""}For each item, please provide your unit price, availability, and lead time. Please also note any delivery fee and whether pickup is available.

Thanks,
${requester.name || requester.company || "EasyOrder"}${requester.email ? "\n" + requester.email : ""}${requester.phone ? "\n" + requester.phone : ""}`;

  const mailto = supplier.email
    ? `mailto:${encodeURIComponent(supplier.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return { supplierId: supplier.id, supplierName: supplier.name, subject, body, mailto };
}

/* One email per supplier - the mass-send-prep output. */
export function bulkRfqEmails({ suppliers, materials, requester = {}, project = null, neededBy = null }) {
  return suppliers.map((supplier) => rfqEmail({ supplier, materials, requester, project, neededBy }));
}
