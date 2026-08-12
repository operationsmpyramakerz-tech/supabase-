import "server-only";
import { select, selectAll } from "./supabase-rest";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.url || value.external?.url || value.file?.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function valueFor(row, aliases = []) {
  const source = row && typeof row === "object" ? row : {};
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
  }
  const wanted = new Set(aliases.map(canonical).filter(Boolean));
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(canonical(key))) return value;
  }
  return null;
}

function dateValue(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function dateTimeValue(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function splitValues(value) {
  if (Array.isArray(value)) return value.flatMap(splitValues).filter(Boolean);
  if (value && typeof value === "object") return [text(value)].filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.flatMap(splitValues).filter(Boolean);
  } catch {}
  return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function parseScreenshots(value) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      name: text(entry?.name) || `Receipt ${index + 1}`,
      url: text(entry?.url || entry?.href || entry?.publicUrl),
    })).filter((entry) => entry.url);
  }
  if (value && typeof value === "object") return parseScreenshots([value]);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) return parseScreenshots(parsed);
  } catch {}
  return splitValues(raw).map((url, index) => ({ name: `Receipt ${index + 1}`, url })).filter((entry) => /^https?:\/\//i.test(entry.url));
}

function expenseOrders(row = {}) {
  const names = splitValues(valueFor(row, ["orders_names", "Orders", "orders_raw"]));
  const urls = splitValues(valueFor(row, ["orders_urls", "orders_url"]));
  return names.map((name, index) => {
    const label = text(name) || "Order";
    const url = text(urls[index]);
    const match = label.match(/(?:ORD[-\s]?)?(\d+)/i);
    const orderId = match?.[1] ? `ORD-${match[1]}` : label;
    return {
      key: `${orderId}:${index}`,
      orderId,
      orderType: "",
      label,
      trackingGroupId: orderId,
      trackingUrl: url || "",
      relationIds: [],
      receiptEntries: [],
      items: [],
      receiptViewerUrl: url || "",
    };
  });
}

function serializeExpense(row = {}) {
  const screenshots = parseScreenshots(valueFor(row, ["screenshot", "Screenshot", "files_media"]));
  const createdTime = dateTimeValue(valueFor(row, ["notion_created_time", "created_at", "Created time"])) || new Date().toISOString();
  return {
    id: text(valueFor(row, ["id", "ID"])),
    createdTime,
    date: dateValue(valueFor(row, ["expense_date", "Date", "date"])),
    reason: text(valueFor(row, ["reason", "Reason"])),
    fundsType: text(valueFor(row, ["funds_type", "Funds Type"])),
    from: text(valueFor(row, ["from_location", "From", "cash_in_from"])),
    to: text(valueFor(row, ["to_location", "To"])),
    kilometer: number(valueFor(row, ["kilometer", "Kilometer"]), 0),
    cashIn: number(valueFor(row, ["cash_in", "Cash in"]), 0),
    cashOut: number(valueFor(row, ["cash_out", "Cash out"]), 0),
    cashInFrom: text(valueFor(row, ["cash_in_from", "from_location", "From"])),
    orders: expenseOrders(row),
    screenshots,
    screenshotUrl: screenshots[0]?.url || "",
    screenshotName: screenshots[0]?.name || "",
    teamMemberName: text(valueFor(row, ["team_member_name", "Team Member"])),
    userId: text(valueFor(row, ["user_id", "employee_code"])),
    receiptNumber: text(valueFor(row, ["receipt_number", "receiptNumber", "orders_raw", "orders_names"])),
    ordersRaw: text(valueFor(row, ["orders_raw", "orders_names"])),
    source: "supabase",
  };
}

function memberIdentity(account = {}, rows = []) {
  const accountNames = [account.username, account.name].map(canonical).filter(Boolean);
  const accountEmail = canonical(account.email);
  const accountId = text(account.id || account.userId || account.userSupabaseId);
  const hit = (rows || []).find((row) => {
    const rowId = text(valueFor(row, ["id", "ID"]));
    if (accountId && rowId && accountId === rowId) return true;
    const rowNames = [valueFor(row, ["Name", "name"]), valueFor(row, ["Username", "username"])].map(canonical).filter(Boolean);
    if (accountNames.some((name) => rowNames.includes(name))) return true;
    const rowEmail = canonical(valueFor(row, ["Email", "email"]));
    return !!accountEmail && !!rowEmail && accountEmail === rowEmail;
  });

  const name = text(valueFor(hit || {}, ["Name", "name"])) || text(account.name || account.username);
  const code = text(valueFor(hit || {}, ["Employee Code", "employee_code", "code"]));
  const id = text(valueFor(hit || {}, ["id", "ID"])) || accountId;
  const email = text(valueFor(hit || {}, ["Email", "email"])) || text(account.email);
  return { row: hit || null, name, code, id, email };
}

function expenseRowMatchesMember(row = {}, member = {}) {
  const name = canonical(member.name);
  const rowName = canonical(valueFor(row, ["team_member_name", "Team Member", "team_member_raw"]));
  if (name && rowName && (rowName === name || rowName.includes(name) || name.includes(rowName))) return true;
  const userId = canonical(member.code || member.id);
  const rowUserId = canonical(valueFor(row, ["user_id", "employee_code"]));
  if (userId && rowUserId && userId === rowUserId) return true;
  const email = canonical(member.email);
  const rowEmail = canonical(valueFor(row, ["email", "Email"]));
  return !!email && !!rowEmail && email === rowEmail;
}

function expensesTable() {
  return text(process.env.SUPABASE_EXPENSES_TABLE) || "expenses";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function ilike(value, contains = true) {
  const safe = text(value).replace(/[%*_]/g, (match) => `\\${match}`);
  return `ilike.${contains ? `*${safe}*` : safe}`;
}

async function selectCurrentExpenseRows(member) {
  const specs = [];
  if (member.name) {
    specs.push(["team_member_name", ilike(member.name, true)]);
    specs.push(["team_member_raw", ilike(member.name, true)]);
  }
  if (member.code || member.id) specs.push(["user_id", `eq.${text(member.code || member.id)}`]);
  if (member.email) specs.push(["email", ilike(member.email, false)]);

  if (specs.length) {
    const results = await Promise.allSettled(specs.map(([column, filter]) => select(expensesTable(), {
      select: "*",
      [column]: filter,
      order: "expense_date.desc,notion_created_time.desc,id.desc",
      limit: "5000",
    })));
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    if (fulfilled.length) {
      const merged = new Map();
      for (const result of fulfilled) {
        for (const row of Array.isArray(result.value) ? result.value : []) {
          const id = text(valueFor(row, ["id", "ID"])) || JSON.stringify(row);
          if (!merged.has(id)) merged.set(id, row);
        }
      }
      return [...merged.values()];
    }
  }

  const all = await selectAll(expensesTable(), { limit: 5000, order: "expense_date.desc,notion_created_time.desc,id.desc" });
  return all.filter((row) => expenseRowMatchesMember(row, member));
}

function lastSettledInfo(rows = []) {
  let lastSettledAt = null;
  let lastSettledDate = null;
  for (const row of rows || []) {
    const fundsType = canonical(valueFor(row, ["funds_type", "Funds Type"]));
    const reason = canonical(valueFor(row, ["reason", "Reason"]));
    if (fundsType !== "settled my account" && reason !== "settled my account") continue;
    const created = dateTimeValue(valueFor(row, ["notion_created_time", "created_at"]));
    if (!created) continue;
    if (!lastSettledAt || new Date(created).getTime() > new Date(lastSettledAt).getTime()) {
      lastSettledAt = created;
      lastSettledDate = dateValue(valueFor(row, ["expense_date", "Date"]));
    }
  }
  return { lastSettledAt, lastSettledDate };
}

export async function expensesForAccount(account = {}) {
  const members = await selectAll(teamMembersTable(), { limit: 5000, order: "name.asc,id.asc" });
  const member = memberIdentity(account, members);
  if (!member.name) {
    const error = new Error("User not found.");
    error.status = 400;
    throw error;
  }
  const rows = await selectCurrentExpenseRows(member);
  const info = lastSettledInfo(rows);
  return {
    success: true,
    items: rows.map(serializeExpense),
    lastSettledAt: info.lastSettledAt,
    lastSettledDate: info.lastSettledDate,
    source: "supabase",
  };
}

export async function expenseTypeOptions() {
  const rows = await selectAll(expensesTable(), { limit: 5000, order: "expense_date.desc,notion_created_time.desc,id.desc" });
  const seen = new Set();
  const options = [];
  for (const row of rows) {
    const value = text(valueFor(row, ["funds_type", "Funds Type"]));
    const key = canonical(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    options.push(value);
  }
  return options.sort((a, b) => a.localeCompare(b));
}

export async function cashInFromOptions() {
  const rows = await selectAll(teamMembersTable(), { limit: 5000, order: "name.asc,id.asc" });
  return rows.map((row) => {
    const name = text(valueFor(row, ["Name", "name"])) || "Unnamed";
    const id = text(valueFor(row, ["id", "ID"])) || text(valueFor(row, ["Employee Code", "employee_code"])) || name;
    return { id, name };
  }).filter((item) => item.id && item.name);
}
