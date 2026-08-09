"use client";

import { useEffect, useMemo, useState } from "react";

const SETTLEMENT_KEY = "settledmyaccount";

function text(value) { return String(value ?? "").trim(); }
function modernTrackingHref(order) {
  const groupId = text(order?.trackingGroupId);
  if (groupId) return `/next/orders/tracking?groupId=${encodeURIComponent(groupId)}`;
  const raw = text(order?.trackingUrl);
  if (!raw) return "";
  const match = raw.match(/[?&]groupId=([^&#]+)/i);
  if (match?.[1]) {
    let decoded = match[1];
    try { decoded = decodeURIComponent(decoded); } catch {}
    return `/next/orders/tracking?groupId=${encodeURIComponent(decoded)}`;
  }
  return raw.replace(/^\/orders\/tracking(?=\?|$)/i, "/next/orders/tracking");
}
function modernReceiptViewerHref(order) {
  const raw = text(order?.receiptViewerUrl);
  if (raw) return raw.replace(/^\/orders\/order-receipt-viewer(?=\?|$)/i, "/next/orders/receipt-viewer");
  const ids = (Array.isArray(order?.relationIds) ? order.relationIds : []).map((value) => text(value)).filter(Boolean);
  return ids.length ? `/next/orders/receipt-viewer?ids=${encodeURIComponent(ids.join(","))}` : "";
}
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function normalized(value) { return lower(value).replace(/[^a-z0-9\u0600-\u06ff]+/g, ""); }
function isSettlement(item) { return normalized(item?.fundsType) === SETTLEMENT_KEY || normalized(item?.reason) === SETTLEMENT_KEY; }
function money(value, { signed = false } = {}) {
  const amount = number(value);
  const formatted = new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(Math.abs(amount));
  if (signed && amount !== 0) return `${amount > 0 ? "+" : "-"}£${formatted}`;
  return `${amount < 0 ? "-" : ""}£${formatted}`;
}
function formatDate(value, fallback = "—") {
  const raw = text(value);
  if (!raw) return fallback;
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function transactionTime(item) {
  const raw = text(item?.createdTime || item?.created_time || item?.date);
  const value = raw ? new Date(raw.length === 10 ? `${raw}T00:00:00` : raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}
function transactionValue(item) { return number(item?.cashIn) - number(item?.cashOut); }
function screenshotsFor(item) {
  const rows = (Array.isArray(item?.screenshots) ? item.screenshots : [])
    .map((shot, index) => ({ name: text(shot?.name) || `Receipt ${index + 1}`, url: text(shot?.url) }))
    .filter((shot) => shot.url);
  if (rows.length) return rows;
  const fallback = text(item?.screenshotUrl);
  return fallback ? [{ name: text(item?.screenshotName) || "Receipt", url: fallback }] : [];
}
function ordersFor(item) { return Array.isArray(item?.orders) ? item.orders.filter(Boolean) : []; }
function responseFileName(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (!match) return fallback;
  try { return decodeURIComponent(match[1] || match[2] || fallback); } catch { return match[1] || match[2] || fallback; }
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (response.status === 401 && !body?.error?.toLowerCase?.().includes("password")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Login required.");
  }
  if (!response.ok || body?.success === false || body?.ok === false) {
    throw new Error(body?.error || body?.message || `Request failed with ${response.status}.`);
  }
  return body;
}
function splitBySettlement(items, apiSettledAt, apiSettledDate) {
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => transactionTime(b) - transactionTime(a));
  const settlement = sorted.find(isSettlement) || null;
  const boundaryRaw = text(apiSettledAt || settlement?.createdTime || settlement?.created_time || apiSettledDate || settlement?.date);
  const boundary = boundaryRaw ? new Date(boundaryRaw.length === 10 ? `${boundaryRaw}T23:59:59` : boundaryRaw).getTime() : 0;
  if (!boundary) return { recent: sorted, past: [], settlement: null };
  return {
    recent: sorted.filter((item) => !isSettlement(item) && transactionTime(item) > boundary),
    past: sorted.filter((item) => transactionTime(item) <= boundary || isSettlement(item)),
    settlement,
  };
}
async function imageFilesPayload(files) {
  const selected = Array.from(files || []);
  if (selected.length > 6) throw new Error("You can upload up to 6 receipt images.");
  return Promise.all(selected.map(async (file) => {
    if (!String(file.type || "").startsWith("image/")) throw new Error(`${file.name || "File"} is not an image.`);
    if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name || "Image"} is larger than 12 MB.`);
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read the selected image."));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to process the selected image."));
      img.src = source;
    });
    const maximum = 1500;
    const scale = Math.min(1, maximum / Math.max(image.width || 1, image.height || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { name: file.name || "receipt.jpg", dataUrl: canvas.toDataURL("image/jpeg", 0.8) };
  }));
}

function Modal({ title, subtitle, onClose, children, footer, className = "" }) {
  return (
    <div className="next-expense-users-modal" role="dialog" aria-modal="true">
      <button className="next-expense-users-modal__backdrop" type="button" onClick={onClose} aria-label="Close" />
      <section className={`next-expense-users-modal__card ${className}`}>
        <header><div><span>Expenses Users</span><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="next-expense-users-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className={`next-expense-users-toast is-${toast.type || "info"}`}><div><strong>{toast.title}</strong><span>{toast.message}</span></div><button type="button" onClick={onClose}>×</button></div>;
}

function ReceiptViewer({ item, onClose }) {
  const screenshots = screenshotsFor(item);
  return (
    <Modal title="Receipt screenshots" subtitle={`${screenshots.length} uploaded image${screenshots.length === 1 ? "" : "s"}.`} onClose={onClose} className="next-expense-users-receipts-modal">
      {screenshots.length ? <div className="next-expense-users-receipts">{screenshots.map((shot, index) => {
        const fallback = `/api/expenses/screenshot/${encodeURIComponent(text(item?.id))}?index=${index}`;
        return <a href={shot.url || fallback} target="_blank" rel="noreferrer" key={`${shot.url}-${index}`}><img src={shot.url || fallback} alt={shot.name} /><span>{shot.name}</span></a>;
      })}</div> : <div className="next-expense-users-empty-inline">No screenshots were uploaded.</div>}
    </Modal>
  );
}

function EditExpenseModal({ item, user, onClose, onSaved, notify }) {
  const originalShots = screenshotsFor(item);
  const [form, setForm] = useState({
    date: text(item?.date), reason: text(item?.reason), fundsType: text(item?.fundsType),
    from: text(item?.from), to: text(item?.to), cashIn: number(item?.cashIn) || "",
    cashOut: number(item?.cashOut) || "", kilometer: number(item?.kilometer) || "",
    cashInFrom: text(item?.cashInFrom), adminPassword: "",
  });
  const [existingShots, setExistingShots] = useState(originalShots);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.adminPassword.trim()) return notify("Admin password is required.", "error");
    if (!form.date) return notify("Expense date is required.", "error");
    setBusy(true);
    try {
      const screenshots = await imageFilesPayload(files);
      await requestJson(`/api/expenses/user-expense/${encodeURIComponent(text(item?.id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: form.adminPassword,
          expense: {
            date: form.date, reason: form.reason, fundsType: form.fundsType,
            from: form.from, to: form.to, cashIn: number(form.cashIn), cashOut: number(form.cashOut),
            kilometer: number(form.kilometer), cashInFrom: form.cashInFrom,
            screenshotUrls: existingShots.map((shot) => shot.url), screenshots,
          },
        }),
      });
      notify("Expense updated", `${user.name}'s transaction was saved.`, "success");
      await onSaved();
      onClose();
    } catch (error) { notify("Update failed", error?.message || "Failed to update the expense.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Edit expense" subtitle={`Update the selected transaction for ${user.name}.`} onClose={onClose} footer={<><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></>}>
      <div className="next-expense-users-form-grid">
        <label><span>Date *</span><input type="date" value={form.date} onChange={update("date")} /></label>
        <label><span>Funds type</span><input value={form.fundsType} onChange={update("fundsType")} /></label>
        <label className="is-wide"><span>Reason</span><input value={form.reason} onChange={update("reason")} /></label>
        <label><span>From</span><input value={form.from} onChange={update("from")} /></label>
        <label><span>To</span><input value={form.to} onChange={update("to")} /></label>
        <label><span>Cash in</span><input type="number" min="0" step="0.01" value={form.cashIn} onChange={update("cashIn")} /></label>
        <label><span>Cash out</span><input type="number" min="0" step="0.01" value={form.cashOut} onChange={update("cashOut")} /></label>
        <label><span>Kilometer</span><input type="number" min="0" step="0.01" value={form.kilometer} onChange={update("kilometer")} /></label>
        <label><span>Cash in from</span><input value={form.cashInFrom} onChange={update("cashInFrom")} /></label>
        <div className="is-wide next-expense-users-existing-receipts"><span>Current receipts</span>{existingShots.length ? <div>{existingShots.map((shot, index) => <article key={`${shot.url}-${index}`}><img src={shot.url} alt="" /><span>{shot.name}</span><button type="button" onClick={() => setExistingShots((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></article>)}</div> : <small>No current receipts.</small>}</div>
        <label className="is-wide"><span>Add receipt images</span><input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><small>{files.length ? `${files.length} selected` : "Up to 6 images, 12 MB each."}</small></label>
        <label className="is-wide"><span>Admin password *</span><input type="password" autoComplete="current-password" value={form.adminPassword} onChange={update("adminPassword")} /></label>
      </div>
    </Modal>
  );
}

function DeleteExpenseModal({ item, user, onClose, onDeleted, notify }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!password.trim()) return notify("Admin password is required.", "error");
    setBusy(true);
    try {
      await requestJson(`/api/expenses/user-expense/${encodeURIComponent(text(item?.id))}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminPassword: password }),
      });
      notify("Expense deleted", `${user.name}'s transaction was removed.`, "success");
      await onDeleted();
      onClose();
    } catch (error) { notify("Delete failed", error?.message || "Failed to delete the expense.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Delete expense" subtitle="This permanently removes the transaction and its stored receipts." onClose={onClose} footer={<><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="danger-button" type="button" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</button></>}>
      <div className="next-expense-users-delete-warning"><strong>{text(item?.reason) || text(item?.fundsType) || "Expense transaction"}</strong><span>{formatDate(item?.date)} · {money(transactionValue(item), { signed: true })}</span></div>
      <label className="next-expense-users-password-field"><span>Admin password *</span><input type="password" autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    </Modal>
  );
}

function TransactionRow({ item, onReceipt, onEdit, onDelete }) {
  const value = transactionValue(item);
  const cashIn = number(item?.cashIn) > 0;
  const settlement = isSettlement(item);
  const orders = ordersFor(item);
  const shots = screenshotsFor(item);
  const from = text(item?.from || item?.cashInFrom) || (cashIn ? "Cash in" : "—");
  const to = text(item?.to) || (cashIn ? "Wallet" : "—");
  return (
    <article className={`next-expense-users-transaction ${cashIn ? "is-in" : "is-out"} ${settlement ? "is-settlement" : ""}`}>
      <div className="next-expense-users-transaction__icon">{settlement ? "✓" : cashIn ? "↙" : "↗"}</div>
      <div className="next-expense-users-transaction__main">
        <header><div><strong>{text(item?.reason) || text(item?.fundsType) || (cashIn ? "Cash in" : "Cash out")}</strong><span>{text(item?.fundsType) || (cashIn ? "Cash in" : "Cash out")}</span></div><b>{money(value, { signed: true })}</b></header>
        <div className="next-expense-users-transaction__meta"><span>{formatDate(item?.date)}</span><span>{from} → {to}</span>{number(item?.kilometer) > 0 ? <span>{number(item.kilometer)} km</span> : null}</div>
        {orders.length ? <div className="next-expense-users-order-links">{orders.map((order, index) => {
          const href = modernTrackingHref(order) || "/next/orders";
          const receiptHref = modernReceiptViewerHref(order);
          return <span className="next-expense-users-order-link-group" key={text(order?.key || order?.orderId) || index}><a href={href} target="_blank" rel="noreferrer">{text(order?.label || order?.orderId) || "Linked order"}</a>{receiptHref ? <a className="receipt-link" href={receiptHref} target="_blank" rel="noreferrer">Receipts</a> : null}</span>;
        })}</div> : null}
      </div>
      <div className="next-expense-users-transaction__actions">
        <button type="button" disabled={!shots.length} onClick={() => onReceipt(item)} title="Receipts">▧<span>{shots.length || ""}</span></button>
        <button type="button" onClick={() => onEdit(item)} title="Edit">✎</button>
        <button className="danger" type="button" onClick={() => onDelete(item)} title="Delete">×</button>
      </div>
    </article>
  );
}

function UserExpensesModal({ user, onClose, onUsersRefresh, notify }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [receiptItem, setReceiptItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [exporting, setExporting] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const body = await requestJson(`/api/expenses/user/${encodeURIComponent(text(user?.id || user?.userId))}`);
      setPayload(body);
    } catch (error) { notify("Unable to load expenses", error?.message || "Failed to load this user's expenses.", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [user?.id, user?.userId]);

  const split = useMemo(() => splitBySettlement(payload?.items || [], payload?.lastSettledAt, payload?.lastSettledDate), [payload]);
  const currentBalance = useMemo(() => split.recent.reduce((sum, item) => sum + transactionValue(item), 0), [split.recent]);
  const allVisibleBase = showPast ? [...split.recent, ...split.past] : split.recent;
  const filtered = useMemo(() => {
    const q = lower(query);
    const rows = allVisibleBase.filter((item) => {
      const date = text(item?.date);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      const value = transactionValue(item);
      if (type === "in" && value <= 0) return false;
      if (type === "out" && value >= 0) return false;
      if (type === "settlement" && !isSettlement(item)) return false;
      if (type !== "settlement" && type !== "all" && isSettlement(item)) return false;
      if (!q) return true;
      return [item?.reason, item?.fundsType, item?.from, item?.to, item?.cashInFrom, ...ordersFor(item).map((order) => order?.label)].join(" ").toLowerCase().includes(q);
    });
    return rows.sort((a, b) => {
      if (sort === "oldest") return transactionTime(a) - transactionTime(b);
      if (sort === "amount-high") return Math.abs(transactionValue(b)) - Math.abs(transactionValue(a));
      if (sort === "amount-low") return Math.abs(transactionValue(a)) - Math.abs(transactionValue(b));
      return transactionTime(b) - transactionTime(a);
    });
  }, [allVisibleBase, query, type, sort, dateFrom, dateTo]);
  const filteredNet = filtered.reduce((sum, item) => sum + transactionValue(item), 0);

  const refreshAfterMutation = async () => { await Promise.all([load(), onUsersRefresh()]); };
  const exportFile = async (fileType) => {
    if (!filtered.length) return notify("Nothing to export", "No transactions match the active filters.", "info");
    setExporting(fileType);
    try {
      const response = await fetch(`/api/expenses/export/${fileType}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: `Expenses — ${user.name}`, userId: text(user?.id || user?.userId), items: filtered, dateFrom, dateTo, lastSettledAt: payload?.lastSettledAt, lastSettledDate: payload?.lastSettledDate }),
      });
      if (response.status === 401) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Expense export failed."); }
      downloadBlob(await response.blob(), responseFileName(response, fileType === "excel" ? `${user.name}_expenses.xlsx` : `${user.name}_expenses.pdf`));
      notify("Export downloaded", `${user.name}'s ${fileType.toUpperCase()} report is ready.`, "success");
    } catch (error) { notify("Export failed", error?.message || "Expense export failed.", "error"); }
    finally { setExporting(""); }
  };

  return (
    <>
      <Modal title={user.name || "User expenses"} subtitle={`${number(user.count)} recorded transaction${number(user.count) === 1 ? "" : "s"}.`} onClose={onClose} className="next-expense-users-sheet">
        <section className="next-expense-users-sheet-summary">
          <article className={currentBalance < 0 ? "negative" : "positive"}><span>Current balance</span><strong>{money(currentBalance)}</strong><small>Since last settlement</small></article>
          <article><span>Recent transactions</span><strong>{split.recent.length}</strong><small>{split.past.length} archived by settlement</small></article>
          <article><span>Last settled</span><strong>{formatDate(payload?.lastSettledDate || split.settlement?.date)}</strong><small>{payload?.lastSettledAt ? formatDate(payload.lastSettledAt) : "No settlement found"}</small></article>
          <article><span>Filtered net</span><strong>{money(filteredNet, { signed: true })}</strong><small>{filtered.length} visible</small></article>
        </section>

        <div className="next-expense-users-sheet-toolbar">
          <label className="next-expense-users-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reason, type, route, or order…" /></label>
          <select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option><option value="in">Cash in</option><option value="out">Cash out</option><option value="settlement">Settlements</option></select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Largest amount</option><option value="amount-low">Smallest amount</option></select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="From date" />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="To date" />
          <button type="button" onClick={() => { setQuery(""); setType("all"); setSort("newest"); setDateFrom(""); setDateTo(""); }}>Reset</button>
        </div>

        <div className="next-expense-users-sheet-actions">
          <button type="button" onClick={() => exportFile("pdf")} disabled={!!exporting}>{exporting === "pdf" ? "Preparing PDF…" : "Download PDF"}</button>
          <button type="button" onClick={() => exportFile("excel")} disabled={!!exporting}>{exporting === "excel" ? "Preparing Excel…" : "Download Excel"}</button>
          <button type="button" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh user"}</button>
        </div>

        {loading ? <div className="next-expense-users-sheet-loading"><span /><span /><span /></div> : filtered.length ? <div className="next-expense-users-transactions">{filtered.map((item) => <TransactionRow key={text(item?.id) || `${item?.date}-${item?.reason}-${transactionTime(item)}`} item={item} onReceipt={setReceiptItem} onEdit={setEditItem} onDelete={setDeleteItem} />)}</div> : <div className="next-expense-users-empty-inline"><strong>No matching transactions</strong><span>Change the filters or include expenses before the last settlement.</span></div>}

        {split.past.length ? <div className="next-expense-users-past-toggle"><span>{showPast ? "Past expenses are included in the list." : `${split.past.length} transaction${split.past.length === 1 ? "" : "s"} are before the last settlement.`}</span><button type="button" onClick={() => setShowPast((value) => !value)}>{showPast ? "Hide past expenses" : "Show past expenses"}</button></div> : null}
      </Modal>
      {receiptItem ? <ReceiptViewer item={receiptItem} onClose={() => setReceiptItem(null)} /> : null}
      {editItem ? <EditExpenseModal item={editItem} user={user} onClose={() => setEditItem(null)} onSaved={refreshAfterMutation} notify={notify} /> : null}
      {deleteItem ? <DeleteExpenseModal item={deleteItem} user={user} onClose={() => setDeleteItem(null)} onDeleted={refreshAfterMutation} notify={notify} /> : null}
    </>
  );
}

export default function ExpensesUsersClient({ account, initialUsersPayload, bootstrapWarnings = [] }) {
  const [users, setUsers] = useState(Array.isArray(initialUsersPayload?.users) ? initialUsersPayload.users : []);
  const [query, setQuery] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [selectedUser, setSelectedUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const notify = (title, message = "", type = "info") => {
    if (["success", "error", "info"].includes(message) && type === "info") {
      setToast({ title, message: title, type: message });
      return;
    }
    setToast({ title, message: message || title, type });
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const body = await requestJson("/api/expenses/users");
      setUsers(Array.isArray(body?.users) ? body.users : []);
      return body;
    } catch (error) { notify("Refresh failed", error?.message || "Failed to refresh expense users.", "error"); throw error; }
    finally { setBusy(false); }
  };

  const stats = useMemo(() => {
    const positive = users.filter((user) => number(user.total) > 0).length;
    const negative = users.filter((user) => number(user.total) < 0).length;
    const settled = users.filter((user) => Math.abs(number(user.total)) < 0.0001).length;
    const net = users.reduce((sum, user) => sum + number(user.total), 0);
    return { positive, negative, settled, net, transactions: users.reduce((sum, user) => sum + number(user.count), 0) };
  }, [users]);
  const visibleUsers = useMemo(() => {
    const q = lower(query);
    return users.filter((user) => {
      const total = number(user.total);
      if (balanceFilter === "positive" && total <= 0) return false;
      if (balanceFilter === "negative" && total >= 0) return false;
      if (balanceFilter === "settled" && Math.abs(total) >= 0.0001) return false;
      return !q || [user?.name, user?.id, user?.userId].join(" ").toLowerCase().includes(q);
    }).sort((a, b) => {
      if (sort === "balance-high") return number(b.total) - number(a.total);
      if (sort === "balance-low") return number(a.total) - number(b.total);
      if (sort === "transactions") return number(b.count) - number(a.count);
      if (sort === "settlement") return String(b.lastSettledDate || "").localeCompare(String(a.lastSettledDate || ""));
      return text(a.name).localeCompare(text(b.name));
    });
  }, [users, query, balanceFilter, sort]);

  return (
    <section className="next-expense-users-page">
      <section className="next-expense-users-hero">
        <div><span className="pill">Team expenses control</span><h2>Review each team member’s balance, receipts, routes, and settlement history.</h2><p>Open any user to inspect recent and past transactions, export filtered reports, and perform password-protected corrections without leaving the Next.js workspace.</p><div><button className="primary-button" type="button" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh balances"}</button><a className="secondary-button" href="/next/expenses">My Expenses</a><a className="secondary-button" href="/expenses/users">Classic Expenses Users</a></div></div>
        <aside><span>Visible users</span><strong>{users.length}</strong><small>{stats.transactions} total transactions</small></aside>
      </section>

      {bootstrapWarnings.length ? <div className="next-expense-users-warning"><strong>Some startup data was delayed.</strong><span>The page remains usable and can be refreshed from the toolbar.</span></div> : null}

      <section className="next-expense-users-stats">
        <article><span>Combined balance</span><strong className={stats.net < 0 ? "negative" : "positive"}>{money(stats.net, { signed: true })}</strong><small>Across visible users</small></article>
        <article><span>Positive balances</span><strong>{stats.positive}</strong><small>Users holding funds</small></article>
        <article><span>Negative balances</span><strong>{stats.negative}</strong><small>Users requiring reconciliation</small></article>
        <article><span>Settled balances</span><strong>{stats.settled}</strong><small>Current balance is zero</small></article>
      </section>

      <section className="next-expense-users-toolbar">
        <label className="next-expense-users-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team member…" /></label>
        <select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}><option value="all">All balances</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="settled">Settled</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="balance-high">Highest balance</option><option value="balance-low">Lowest balance</option><option value="transactions">Most transactions</option><option value="settlement">Latest settlement</option></select>
        <button type="button" onClick={() => { setQuery(""); setBalanceFilter("all"); setSort("name"); }}>Clear filters</button>
      </section>

      <div className="next-expense-users-results-line"><span>{visibleUsers.length} of {users.length} users</span><small>Signed balance = Cash in − Cash out</small></div>

      {visibleUsers.length ? <section className="next-expense-users-grid">{visibleUsers.map((user) => {
        const total = number(user.total);
        const initials = text(user.name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
        return <button type="button" className={`next-expense-user-card ${total < 0 ? "is-negative" : total > 0 ? "is-positive" : "is-settled"}`} onClick={() => setSelectedUser(user)} key={text(user.id || user.userId || user.name)}><header><span>{initials}</span><div><strong>{user.name || "Unknown user"}</strong><small>{text(user.userId || user.id) || "No employee code"}</small></div><em>Open</em></header><div className="next-expense-user-card__balance"><span>Current balance</span><strong>{money(total, { signed: true })}</strong></div><footer><span><b>{number(user.count)}</b> transactions</span><span><b>{formatDate(user.lastSettledDate)}</b> last settled</span></footer></button>;
      })}</section> : <section className="next-expense-users-empty"><span>⌕</span><h3>No users match the selected filters.</h3><p>Clear the search or choose a different balance status.</p></section>}

      {selectedUser ? <UserExpensesModal user={selectedUser} onClose={() => setSelectedUser(null)} onUsersRefresh={refresh} notify={notify} /> : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </section>
  );
}
