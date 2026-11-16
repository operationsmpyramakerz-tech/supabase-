// Pure helpers for user-expense Excel links. Each distinct order gets one
// independent Excel hyperlink; Excel doesn't support several URLs in one cell.
const text = (value) => String(value ?? "").trim();

function originFor(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return (url.protocol === "https:" || url.protocol === "http:") ? url.origin : "";
  } catch { return ""; }
}

function orderNumber(value) {
  const raw = text(value);
  const match = raw.match(/^ORD[-\s]?(\d+)$/i) || raw.match(/^ord:(\d+)$/i);
  return match ? match[1] : "";
}

export function expenseOrderLinks(item = {}, baseUrl = "") {
  const origin = originFor(baseUrl);
  const orders = Array.isArray(item?.orders) ? item.orders : [];
  const seen = new Set();
  const links = [];
  for (const order of orders) {
    const number = orderNumber(order?.orderId || order?.label);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    links.push({
      text: `ORD-${number}`,
      hyperlink: origin ? `${origin}/next/orders/tracking?groupId=${encodeURIComponent(`ord:${number}`)}` : "",
    });
  }
  return links;
}

export function expenseReasonExportPayload(item = {}, baseUrl = "") {
  const links = expenseOrderLinks(item, baseUrl);
  const fallback = text(item?.reason);
  if (!links.length) return { text: fallback, hyperlink: "", links: [] };

  // orders_raw is server-read data; for Cash Out it holds the physical order
  // component IDs (not order numbers). Open all receipts with a single link.
  const rawIds = text(item?.ordersRaw).split(",").map(text).filter(Boolean);
  const ids = [...new Set(rawIds)];
  const safeIds = ids.length <= 200 && ids.every((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id));
  const origin = originFor(baseUrl);
  const combined = origin && safeIds && ids.length
    ? `${origin}/next/orders/receipt-viewer?ids=${encodeURIComponent(ids.join(","))}`
    : "";
  return {
    text: links.map((entry) => entry.text).join(", "),
    hyperlink: combined || links[0]?.hyperlink || "",
    links,
  };
}
