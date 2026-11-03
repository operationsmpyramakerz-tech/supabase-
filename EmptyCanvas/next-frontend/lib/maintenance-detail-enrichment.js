import "server-only";
import { performance } from "node:perf_hooks";
import { getProductsForOrderDetails } from "./products-service";

function text(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}
function norm(value) { return text(value).toLowerCase(); }

export async function enrichMaintenanceDetailProducts(items = [], { timings = null, knownProducts = null } = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return rows;

  let products = [];
  const productsStartedAt = performance.now();
  try {
    // Order details require individual product metadata, not the independent
    // tags/units dropdown catalogs used by editing forms.
    // Include spare parts and historical logs in the targeted product lookup.
    // If any entry lacks an ID, the resolver uses the legacy full catalog.
    const referencedProducts = rows.flatMap((item) => [
      { productId: item?.productId, productName: item?.productName, productUrl: item?.productUrl },
      ...(Array.isArray(item?.sparePartsNeededEntries) ? item.sparePartsNeededEntries : []).map((part) => ({ productId: part?.id, productName: part?.name, productUrl: part?.url })),
      ...(Array.isArray(item?.sparePartsReplacedEntries) ? item.sparePartsReplacedEntries : []).map((part) => ({ productId: part?.id, productName: part?.name, productUrl: part?.url })),
      ...(Array.isArray(item?.maintenanceLogs) ? item.maintenanceLogs : []).flatMap((log) => [
        ...(Array.isArray(log?.sparePartsNeededEntries) ? log.sparePartsNeededEntries : []).map((part) => ({ productId: part?.id, productName: part?.name, productUrl: part?.url })),
        ...(Array.isArray(log?.sparePartsReplacedEntries) ? log.sparePartsReplacedEntries : []).map((part) => ({ productId: part?.id, productName: part?.name, productUrl: part?.url })),
      ]),
    ]);
    // The live bundle already returned the same current product records.
    // Reuse them only if EVERY spare part/log product is covered by ID;
    // otherwise retain the previous complete-catalog compatibility logic.
    const byKnownId = new Set((knownProducts || []).map((part) => text(part.id)));
    const allCovered = Array.isArray(knownProducts)
      && referencedProducts.every((part) => text(part.productId) && byKnownId.has(text(part.productId)));
    products = allCovered ? knownProducts : await getProductsForOrderDetails(referencedProducts);
  } catch {}
  finally { if (timings) timings.products = performance.now() - productsStartedAt; }
  if (!products.length) return rows;

  const byId = new Map();
  const byName = new Map();
  const byUrl = new Map();
  for (const product of products) {
    const id = text(product?.id);
    const nameKey = norm(product?.name);
    const urlKey = norm(product?.url);
    if (id && !byId.has(id)) byId.set(id, product);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, product);
    if (urlKey && !byUrl.has(urlKey)) byUrl.set(urlKey, product);
  }

  const findProduct = ({ id, name, url } = {}) => {
    const cleanId = text(id);
    if (cleanId && byId.has(cleanId)) return byId.get(cleanId);
    const cleanUrl = norm(url);
    if (cleanUrl && byUrl.has(cleanUrl)) return byUrl.get(cleanUrl);
    const cleanName = norm(name);
    return cleanName ? (byName.get(cleanName) || null) : null;
  };

  const enrichSpareEntries = (entries = []) => (Array.isArray(entries) ? entries : []).map((entry) => {
    const product = findProduct({ id: entry?.id, name: entry?.name, url: entry?.url });
    const qty = Math.max(1, Math.round(Number(entry?.qty) || 1));
    const storedUnitPrice = Number(entry?.unitPrice ?? entry?.unit);
    const catalogUnitPrice = Number(product?.unitPrice);
    const unitPrice = Number.isFinite(storedUnitPrice) && storedUnitPrice > 0
      ? storedUnitPrice
      : (Number.isFinite(catalogUnitPrice) && catalogUnitPrice > 0 ? catalogUnitPrice : 0);
    return {
      ...entry,
      id: text(entry?.id) || text(product?.id),
      name: text(entry?.name) || text(product?.name) || "Spare part",
      qty,
      displayId: text(entry?.displayId ?? entry?.idCode) || text(product?.displayId),
      idCode: text(entry?.idCode ?? entry?.displayId) || text(product?.displayId),
      unitPrice,
      unit: unitPrice,
      total: unitPrice * qty,
      url: /^https?:\/\//i.test(text(entry?.url)) ? text(entry?.url) : (text(product?.url) || null),
    };
  });

  return rows.map((item) => {
    const product = findProduct({ id: item?.productId, name: item?.productName, url: item?.productUrl });
    const needed = enrichSpareEntries(item?.sparePartsNeededEntries);
    const replaced = enrichSpareEntries(item?.sparePartsReplacedEntries);
    const maintenanceLogs = (Array.isArray(item?.maintenanceLogs) ? item.maintenanceLogs : []).map((log) => ({
      ...log,
      sparePartsNeededEntries: enrichSpareEntries(log?.sparePartsNeededEntries),
      sparePartsReplacedEntries: enrichSpareEntries(log?.sparePartsReplacedEntries),
    }));
    return {
      ...item,
      productId: text(item?.productId) || text(product?.id) || null,
      productUrl: /^https?:\/\//i.test(text(item?.productUrl)) ? text(item?.productUrl) : (text(product?.url) || null),
      idCode: text(item?.idCode ?? item?.displayId) || text(product?.displayId) || null,
      displayId: text(item?.displayId ?? item?.idCode) || text(product?.displayId) || null,
      sparePartsNeededEntries: needed,
      sparePartsNeededNames: needed.map((entry) => entry.name).filter(Boolean),
      sparePartsNeededName: needed.map((entry) => entry.name).filter(Boolean).join(", ") || null,
      sparePartsReplacedEntries: replaced,
      sparePartsReplacedIds: replaced.map((entry) => entry.id).filter(Boolean),
      sparePartsReplacedId: replaced.find((entry) => entry.id)?.id || null,
      sparePartsReplacedNames: replaced.map((entry) => entry.name).filter(Boolean),
      sparePartsReplacedName: replaced.map((entry) => entry.name).filter(Boolean).join(", ") || null,
      maintenanceLogs,
    };
  });
}

