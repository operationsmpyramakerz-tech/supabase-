"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClassicExpenseIcon, ClassicFieldLabel, ClassicSelect, ExpenseDestinationSelect, ExpenseOrderMultiSelect, ClassicFileField, ExpenseCurrencyInput, fundsTypeOption, filesPayload, OTHER_SCOPE_ID, SCREENSHOT_REQUIRED_KEYS } from "./ExpensesDialogs";
import { expenseOrderCode, sameExpenseSelection } from "../../lib/expense-user-edit.mjs";
import { ownCarCostForKilometers } from "../../lib/own-car-expense.mjs";

const clean = value => String(value ?? "").trim();
const key = value => clean(value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, "");
const DEFAULT_TYPES = ["Online Transfer", "SWVL", "Go Bus", "By Bus", "ترام", "Train", "Metro", "Indrive", "Uber", "DiDi", "Taxi", "توكتوك", "نقل", "Public transportation", "Cash Payment", "Meal allowance", "مشال", "مصروفات", "Own car"];
const amount = value => Number(value) || 0;
const isSettlement = item => key(item.reason) === "settledmyaccount" || key(item.fundsType) === "settledmyaccount";
const dateKey = value => /^\d{4}-\d{2}-\d{2}/.test(clean(value)) ? clean(value).slice(0, 10) : "";
const orderCodes = item => [...new Set((item.orders || []).map(order => expenseOrderCode(order.orderId) || expenseOrderCode(order.label)).filter(Boolean))];
const optionId = code => `ord:${code.slice(4)}`;
const readShots = item => (item.screenshots?.length ? item.screenshots : item.screenshotUrl ? [{ url: item.screenshotUrl, name: item.screenshotName || "Receipt" }] : []).filter(shot => shot.url);
const initialScope = item => orderCodes(item).length ? orderCodes(item).map(optionId) : [OTHER_SCOPE_ID];

function Editor({ item, ownCarRate, saveExpense, onSaved, onClose, notify, rows, setSelected }) {
  const overlay = useRef(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const sync = () => {
      const height = Math.min(window.innerHeight, viewport?.height || window.innerHeight);
      overlay.current?.style.setProperty("--edit-visible-height", `${Math.floor(height)}px`);
      overlay.current?.style.setProperty("--edit-visible-top", `${Math.max(0, viewport?.offsetTop || 0)}px`);
    };
    sync();
    window.addEventListener("resize", sync);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => { window.removeEventListener("resize", sync); viewport?.removeEventListener("resize", sync); viewport?.removeEventListener("scroll", sync); };
  }, []);
  const [support, setSupport] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState(() => ({ date: dateKey(item.date || item.createdTime), destination: clean(item.destinationUserId), fundsType: clean(item.fundsType), reason: clean(item.reason), from: clean(item.from), to: clean(item.to), cashInFrom: clean(item.cashInFrom || (amount(item.cashIn) > 0 ? item.from : "")), cashIn: amount(item.cashIn), cashOut: amount(item.cashOut), kilometer: amount(item.kilometer) }));
  const [selectedOrders, setSelectedOrders] = useState(() => initialScope(item));
  const [shots, setShots] = useState(() => readShots(item));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settlement = isSettlement(item);
  const cashIn = amount(item.cashIn) > 0;
  const cashOut = !cashIn || amount(item.cashOut) > 0;
  const editableOrders = !cashIn && !settlement;
  const ownCar = key(form.fundsType) === "owncar" && cashOut && !cashIn && !settlement;
  const ownCost = ownCarCostForKilometers(form.kilometer, ownCarRate);
  const manual = selectedOrders.includes(OTHER_SCOPE_ID);
  const orderChanged = !sameExpenseSelection(selectedOrders, initialScope(item));
  const dirty = orderChanged || files.length > 0 || shots.length !== readShots(item).length || Object.entries(form).some(([field, value]) => {
    const original = field === "date" ? dateKey(item.date || item.createdTime) : field === "destination" ? clean(item.destinationUserId) : field === "cashInFrom" ? clean(item.cashInFrom || (amount(item.cashIn) > 0 ? item.from : "")) : ["cashIn", "cashOut", "kilometer"].includes(field) ? amount(item[field]) : clean(item[field]);
    return String(value) !== String(original);
  });
  const requiredShot = SCREENSHOT_REQUIRED_KEYS.has(key(form.fundsType)) || (cashIn && key(form.fundsType) === "onlinetransfer");
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const input = field => event => update(field, event.target.value);
  useEffect(() => {
    const controller = new AbortController();
    setSupport(null); setLoadError("");
    (async () => {
      try {
        const response = await fetch(`/next/api/expenses/edit-options?expenseId=${encodeURIComponent(item.id)}`, { credentials: "include", cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Unable to load edit options.");
        if (!controller.signal.aborted) setSupport(result);
      } catch (e) { if (!controller.signal.aborted) setLoadError(e.message || "Unable to load edit options."); }
    })();
    return () => controller.abort();
  }, [item.id, attempt]);
  const orderOptions = useMemo(() => {
    const options = (support?.orderOptions || []).map(order => {
      const kind = key(order.orderType);
      const maintenance = kind.includes("maintenance"), withdrawal = kind.includes("withdraw");
      return { value: clean(order.id), label: clean(order.orderId), note: clean(order.createdByName) || "Unknown user", searchText: `${order.orderType || ""} ${order.label || ""}`, icon: maintenance ? "tool" : withdrawal ? "log-out" : "shopping-cart", tone: maintenance ? "maintenance" : withdrawal ? "withdrawal" : "products", relationIds: order.relationIds || [] };
    });
    // Keep existing order labels even if they are old, outside the picker scope,
    // or outside its result limit. They are not authorized for NEW relations.
    for (const code of orderCodes(item)) if (!options.some(option => option.value === optionId(code))) options.push({ value: optionId(code), label: code, note: "Existing link · unavailable for relinking", relationIds: [], icon: "shopping-cart", tone: "products" });
    return options;
  }, [support, item]);
  const destinations = useMemo(() => {
    const options = (support?.destinationPeople || []).map(member => ({ value: clean(member.id), label: clean(member.name), note: clean(member.department) })).filter(member => member.value && member.label);
    if (item.destinationUserId && !options.some(option => option.value === item.destinationUserId)) options.push({ value: item.destinationUserId, label: item.destinationUserName || "Previous destination", note: "Existing destination" });
    return options;
  }, [support, item]);
  const funds = useMemo(() => {
    const seen = new Set();
    const base = cashIn || settlement ? ["Cash Payment", "Online Transfer"] : [...DEFAULT_TYPES, ...(support?.fundsTypes || [])];
    return [item.fundsType, ...base].filter(value => { const k = key(value); if (!k || seen.has(k) || (["cashreceipt", "cashreciept"].includes(k) && value !== item.fundsType) || (k === "settledmyaccount" && !settlement)) return false; seen.add(k); return true; }).map(fundsTypeOption);
  }, [support, item, cashIn, settlement]);
  const changeOrders = values => {
    if (values.includes(OTHER_SCOPE_ID) && !manual) update("reason", "");
    setSelectedOrders(values);
  };
  const save = async event => {
    event.preventDefault();
    if (busy || !support) return;
    setError("");
    const fail = message => setError(message);
    if (!form.date || !form.fundsType) return fail("Date and funds type are required.");
    if (editableOrders && (!selectedOrders.length || (manual && !clean(form.reason)))) return fail("Select orders or enter Other reason.");
    if (editableOrders && !form.destination) return fail("Select a destination user.");
    if (cashIn && !settlement && !(Number(form.cashIn) > 0)) return fail("Enter a valid cash in amount.");
    if (cashOut && !settlement && !(ownCar ? ownCost > 0 : Number(form.cashOut) > 0)) return fail(ownCar ? "Enter a valid distance." : "Enter a valid cash out amount.");
    if (cashIn && !settlement && !clean(form.cashInFrom)) return fail("Payment by is required.");
    if (requiredShot && !shots.length && !files.length) return fail("A screenshot is required for this funds type.");
    if (files.length && shots.length + files.length > 6) return fail("Up to 6 receipt images are allowed.");
    const selected = selectedOrders.map(id => orderOptions.find(option => option.value === id)).filter(Boolean);
    if (editableOrders && orderChanged && !manual && (selected.length !== selectedOrders.length || selected.some(option => !option.relationIds.length))) return fail("One existing order is unavailable for relinking. Keep the original selection or choose available orders.");
    setBusy(true);
    try {
      const orderSelection = editableOrders && orderChanged ? { orderIds: manual ? [] : [...new Set(selected.flatMap(option => option.relationIds))], orderKeys: manual ? [] : selectedOrders } : undefined;
      const reason = settlement ? "Settled my account" : editableOrders && orderChanged && !manual ? selected.map(option => option.label).join(", ") : form.reason;
      await saveExpense(item.id, {
        date: form.date, destinationUserId: form.destination, fundsType: form.fundsType, reason,
        from: cashIn && !settlement ? form.cashInFrom : form.from, to: form.to, cashInFrom: cashIn ? form.cashInFrom : clean(item.cashInFrom),
        cashIn: cashIn ? Number(form.cashIn) : 0, cashOut: cashOut ? (ownCar ? ownCost : Number(form.cashOut)) : 0,
        kilometer: ownCar ? Number(form.kilometer) : 0,
        ...(orderSelection ? { orderSelection } : {}), screenshotUrls: shots.map(shot => shot.url), screenshots: await filesPayload(files),
      });
      notify("Saved", "Expense updated successfully.", "success");
      onClose();
      await onSaved().catch(() => {});
    } catch (err) { fail(err.message || "Failed to update expense."); }
    finally { setBusy(false); }
  };
  return <div className="expense-user-edit-overlay" ref={overlay} onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <section className="expense-user-edit" role="dialog" aria-modal="true" aria-labelledby="expense-user-edit-title">
      <header className="expense-user-edit-head"><span className="expense-user-edit-badge"><ClassicExpenseIcon name="edit-3" size={26}/></span><h2 id="expense-user-edit-title">Edit Expense</h2></header>
      <form onSubmit={save} className="expense-user-edit-form">
        <div className="expense-user-edit-scroll ex-modal-sheet-scroll">
          {rows.length > 1 ? <div className="expense-user-edit-group"><ClassicFieldLabel icon="tag">Expense to edit</ClassicFieldLabel><select className="ex-input" aria-label="Expense to edit" value={item.id} disabled={busy} onChange={event => { if (!dirty || window.confirm("Switch expense? Unsaved changes will be discarded.")) setSelected(event.target.value); }}>{rows.map((row, index) => <option key={row.id} value={row.id}>{index + 1}. {row.fundsType || "Expense"} · EGP {amount(row.cashIn) || amount(row.cashOut)} · {row.from || "—"} → {row.to || "—"}</option>)}</select></div> : null}
          {loadError ? <div className="expense-user-edit-error" role="alert">{loadError} <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button></div> : !support ? <div role="status">Loading expense options…</div> : null}
          <fieldset disabled={busy || !support} className="expense-user-edit-fields">
            <div className="expense-user-edit-group"><h3>Expense details</h3>
              <ClassicFieldLabel icon="calendar">Date <span className="req-star">*</span></ClassicFieldLabel><input className="ex-input" type="date" aria-label="Date" value={form.date} onChange={input("date")}/>
              <ClassicFieldLabel icon="user">Destination{editableOrders ? <span className="req-star">*</span> : null}</ClassicFieldLabel><ExpenseDestinationSelect value={form.destination} onChange={value => update("destination", value)} options={destinations}/>
              {editableOrders ? <><ClassicFieldLabel icon="file-text">Orders / Reason <span className="req-star">*</span></ClassicFieldLabel><ExpenseOrderMultiSelect value={selectedOrders} onChange={changeOrders} options={orderOptions}/>{manual ? <><ClassicFieldLabel icon="edit-3">Other reason</ClassicFieldLabel><input className="ex-input" aria-label="Other reason" value={form.reason} onChange={input("reason")}/></> : null}</> : <><ClassicFieldLabel icon="file-text">Reason</ClassicFieldLabel><input className="ex-input" aria-label="Reason" value={settlement ? "Settled my account" : form.reason} onChange={input("reason")} readOnly={settlement}/></>}
            </div>
            <div className="expense-user-edit-group"><h3>{settlement ? "Settlement" : cashIn && !cashOut ? "Cash In" : "Cash Out"}</h3>
              <ClassicFieldLabel icon="tag">Funds Type <span className="req-star">*</span></ClassicFieldLabel><ClassicSelect value={form.fundsType} onChange={value => update("fundsType", value)} options={funds} placeholder="Select funds type..." ariaLabel="Funds types" compactFundsCards/>
              {cashIn && !settlement ? <><ClassicFieldLabel icon="user">Payment by <span className="req-star">*</span></ClassicFieldLabel><input className="ex-input" aria-label="Payment by" value={form.cashInFrom} onChange={input("cashInFrom")}/></> : <><ClassicFieldLabel icon="log-out" compact>From</ClassicFieldLabel><input className="ex-input ex-input--compact" aria-label="From" value={form.from} onChange={input("from")}/><ClassicFieldLabel icon="log-in" compact>To</ClassicFieldLabel><input className="ex-input ex-input--compact" aria-label="To" value={form.to} onChange={input("to")}/></>}
              {cashIn ? <><ClassicFieldLabel icon="plus-circle">Cash In</ClassicFieldLabel><ExpenseCurrencyInput value={form.cashIn} onChange={input("cashIn")} label="Cash in amount in EGP"/></> : null}
              {cashOut ? ownCar ? <><ClassicFieldLabel icon="navigation">Kilometers <span className="req-star">*</span></ClassicFieldLabel><input className="ex-input" type="number" min="0.01" step="any" aria-label="Kilometers" value={form.kilometer} onChange={input("kilometer")}/><p className="expense-own-car-preview"><span>{ownCarRate} EGP / km</span><strong>{ownCost.toFixed(2)} EGP</strong></p></> : <><ClassicFieldLabel icon="minus-circle">Cash Out <span className="req-star">*</span></ClassicFieldLabel><ExpenseCurrencyInput value={form.cashOut} onChange={input("cashOut")} label="Cash out amount in EGP"/></> : null}
              {shots.length ? <div className="expense-user-edit-receipts"><ClassicFieldLabel icon="image">Existing receipts</ClassicFieldLabel>{shots.map((shot, index) => <div className="expense-upload-preview" key={`${shot.url}-${index}`}><img className="expense-upload-preview__image" src={shot.url} alt={`Receipt ${index + 1}`} loading="lazy"/><div className="expense-upload-preview__details"><strong>{shot.name || `Receipt ${index + 1}`}</strong></div><button type="button" className="expense-upload-preview__remove" aria-label={`Remove receipt ${index + 1}`} onClick={() => setShots(current => current.filter((_, i) => i !== index))}><ClassicExpenseIcon name="x" size={16}/></button></div>)}</div> : null}
              <ClassicFileField files={files} onChange={setFiles} required={requiredShot && !shots.length} hint={ownCar ? "Upload Google Maps distance screenshot." : "Upload receipt screenshots."}/>
            </div>
          </fieldset>
          {error ? <div className="expense-user-edit-error" role="alert">{error}</div> : null}
        </div>
        <footer className="expense-user-edit-footer"><button type="button" className="ex-btn expense-user-edit-cancel" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="ex-btn expense-user-edit-save" disabled={busy || !support}>{busy ? "Saving…" : "Save changes"}</button></footer>
      </form>
    </section>
  </div>;
}
export default function EditUserExpense({ rows, ...props }) {
  const [selected, setSelected] = useState(rows[0]?.id);
  const item = rows.find(row => row.id === selected) || rows[0];
  return item ? <Editor key={item.id} item={item} rows={rows} setSelected={setSelected} {...props}/> : null;
}
