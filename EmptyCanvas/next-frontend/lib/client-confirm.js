"use client";

let overlay = null;
let resolver = null;
let lastFocus = null;
let keyHandler = null;

function ensureStyles() {
  if (document.getElementById("opsNextConfirmStyles")) return;
  const style = document.createElement("style");
  style.id = "opsNextConfirmStyles";
  style.textContent = `
    .ops-next-confirm[hidden]{display:none!important}
    .ops-next-confirm[data-variant=archive] .system-delete-dialog__icon{color:#d97706}
    .ops-next-confirm[data-variant=archive] .system-delete-dialog__button--confirm{background:linear-gradient(180deg,#f59e0b,#d97706);box-shadow:0 9px 22px rgba(217,119,6,.3)}
    .ops-next-confirm[data-variant=restore] .system-delete-dialog__icon{color:#059669}
    .ops-next-confirm[data-variant=restore] .system-delete-dialog__button--confirm{background:linear-gradient(180deg,#10b981,#059669);box-shadow:0 9px 22px rgba(5,150,105,.3)}
  `;
  document.head.appendChild(style);
}

function ensureOverlay() {
  ensureStyles();
  if (overlay?.isConnected) return overlay;
  overlay = document.createElement("div");
  overlay.className = "ops-next-confirm system-delete-dialog";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="system-delete-dialog__backdrop" data-ops-next-cancel></div>
    <section class="system-delete-dialog__card" role="alertdialog" aria-modal="true" aria-labelledby="opsNextConfirmTitle" aria-describedby="opsNextConfirmMessage">
      <div class="system-delete-dialog__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.74 3h15.12A2 2 0 0 0 21.3 17L13.7 3.7a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
      </div>
      <h2 id="opsNextConfirmTitle">Delete item?</h2>
      <p id="opsNextConfirmMessage" class="system-delete-dialog__message">This action permanently removes the selected item and cannot be undone.</p>
      <div class="system-delete-dialog__actions">
        <button type="button" class="system-delete-dialog__button system-delete-dialog__button--cancel" data-ops-next-cancel>No, keep it.</button>
        <button type="button" class="system-delete-dialog__button system-delete-dialog__button--confirm" data-ops-next-confirm>Yes, Delete!</button>
      </div>
    </section>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-ops-next-confirm]")) finish(true);
    else if (event.target.closest("[data-ops-next-cancel]")) finish(false);
  });
  return overlay;
}

function finish(answer) {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("ops-next-confirm-open", "system-delete-dialog-open");
  if (keyHandler) document.removeEventListener("keydown", keyHandler, true);
  keyHandler = null;
  const resolve = resolver;
  resolver = null;
  if (lastFocus && typeof lastFocus.focus === "function") {
    try { lastFocus.focus({ preventScroll: true }); } catch { try { lastFocus.focus(); } catch {} }
  }
  lastFocus = null;
  resolve?.(!!answer);
}

export function confirmAction(options = {}) {
  if (typeof document === "undefined") return Promise.resolve(false);
  const modal = ensureOverlay();
  if (resolver) finish(false);
  lastFocus = document.activeElement;

  const itemName = String(options.itemName || options.name || "").trim();
  const itemType = String(options.itemType || options.entity || "item").trim();
  const variant = ["delete", "archive", "restore"].includes(String(options.variant || "").toLowerCase())
    ? String(options.variant).toLowerCase()
    : "delete";
  const defaultTitle = variant === "archive" ? `Archive ${itemType}?` : variant === "restore" ? `Restore ${itemType}?` : `Delete ${itemType}?`;
  const defaultMessage = itemName
    ? `You’re going to permanently delete “${itemName}”. This action cannot be undone.`
    : `You’re going to permanently delete this ${itemType}. This action cannot be undone.`;

  modal.dataset.variant = variant;
  modal.querySelector("#opsNextConfirmTitle").textContent = String(options.title || defaultTitle);
  modal.querySelector("#opsNextConfirmMessage").textContent = String(options.message || defaultMessage);
  modal.querySelector("button[data-ops-next-cancel]").textContent = String(options.cancelLabel || "No, keep it.");
  modal.querySelector("button[data-ops-next-confirm]").textContent = String(options.confirmLabel || (variant === "archive" ? "Yes, Archive!" : variant === "restore" ? "Yes, Restore!" : "Yes, Delete!"));
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("ops-next-confirm-open", "system-delete-dialog-open");

  return new Promise((resolve) => {
    resolver = resolve;
    keyHandler = (event) => {
      if (event.key === "Escape") { event.preventDefault(); finish(false); return; }
      if (event.key !== "Tab") return;
      const buttons = [...modal.querySelectorAll("button:not(:disabled)")];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyHandler, true);
    window.requestAnimationFrame(() => modal.querySelector("button[data-ops-next-cancel]")?.focus());
  });
}

export function confirmDelete(options = {}) {
  return confirmAction({ ...options, variant: "delete" });
}
