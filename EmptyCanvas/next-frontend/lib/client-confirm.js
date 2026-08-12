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
    .ops-next-confirm{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:22px;font-family:inherit}
    .ops-next-confirm__backdrop{position:absolute;inset:0;background:rgba(12,15,20,.56);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
    .ops-next-confirm__card{position:relative;z-index:1;width:min(460px,100%);padding:32px 30px 28px;border:1px solid rgba(15,23,42,.08);border-radius:26px;background:#fff;box-shadow:0 34px 100px rgba(0,0,0,.28);text-align:center;animation:opsNextConfirmIn .2s ease-out}
    .ops-next-confirm__icon{width:62px;height:62px;margin:0 auto 17px;display:grid;place-items:center;border-radius:20px;background:#fff2f1;color:#e32d26;box-shadow:inset 0 0 0 1px #ffd5d1}
    .ops-next-confirm__icon svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2.25;stroke-linecap:round;stroke-linejoin:round}
    .ops-next-confirm[data-variant=archive] .ops-next-confirm__icon{background:#fff7ed;color:#d97706;box-shadow:inset 0 0 0 1px #fed7aa}
    .ops-next-confirm[data-variant=restore] .ops-next-confirm__icon{background:#ecfdf5;color:#059669;box-shadow:inset 0 0 0 1px #a7f3d0}
    .ops-next-confirm__card h2{margin:0;color:#17191e;font-size:25px;line-height:1.2;letter-spacing:-.025em;font-weight:900}
    .ops-next-confirm__card p{max-width:370px;margin:12px auto 0;color:#626a76;font-size:14px;line-height:1.62;font-weight:550}
    .ops-next-confirm__actions{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:25px}
    .ops-next-confirm__button{min-height:50px;border:0;border-radius:14px;padding:12px 16px;font:inherit;font-size:14px;font-weight:850;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background .16s ease}
    .ops-next-confirm__button:focus-visible{outline:3px solid rgba(227,45,38,.22);outline-offset:3px}
    .ops-next-confirm__button--cancel{background:#f0f1f3;color:#2d333c}
    .ops-next-confirm__button--cancel:hover{background:#e6e8eb;transform:translateY(-1px)}
    .ops-next-confirm__button--confirm{background:linear-gradient(180deg,#ff3a31,#ef2119);color:#fff;box-shadow:0 10px 22px rgba(239,33,25,.3),inset 0 1px 0 rgba(255,255,255,.28)}
    .ops-next-confirm__button--confirm:hover{transform:translateY(-1px);box-shadow:0 14px 28px rgba(239,33,25,.38),inset 0 1px 0 rgba(255,255,255,.28)}
    .ops-next-confirm[data-variant=archive] .ops-next-confirm__button--confirm{background:linear-gradient(180deg,#f59e0b,#d97706);box-shadow:0 10px 22px rgba(217,119,6,.28),inset 0 1px 0 rgba(255,255,255,.28)}
    .ops-next-confirm[data-variant=restore] .ops-next-confirm__button--confirm{background:linear-gradient(180deg,#10b981,#059669);box-shadow:0 10px 22px rgba(5,150,105,.28),inset 0 1px 0 rgba(255,255,255,.28)}
    body.ops-next-confirm-open{overflow:hidden!important}
    @keyframes opsNextConfirmIn{from{opacity:0;transform:translateY(12px) scale(.975)}to{opacity:1;transform:none}}
    @media(max-width:520px){.ops-next-confirm{padding:16px}.ops-next-confirm__card{padding:27px 20px 21px;border-radius:22px}.ops-next-confirm__actions{grid-template-columns:1fr}.ops-next-confirm__button--confirm{grid-row:1}.ops-next-confirm__button--cancel{grid-row:2}}
    @media(prefers-reduced-motion:reduce){.ops-next-confirm__card{animation:none}.ops-next-confirm__button{transition:none}}
  `;
  document.head.appendChild(style);
}

function ensureOverlay() {
  ensureStyles();
  if (overlay?.isConnected) return overlay;
  overlay = document.createElement("div");
  overlay.className = "ops-next-confirm";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="ops-next-confirm__backdrop" data-ops-next-cancel></div>
    <section class="ops-next-confirm__card" role="alertdialog" aria-modal="true" aria-labelledby="opsNextConfirmTitle" aria-describedby="opsNextConfirmMessage">
      <div class="ops-next-confirm__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.74 3h15.12A2 2 0 0 0 21.3 17L13.7 3.7a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
      </div>
      <h2 id="opsNextConfirmTitle">Delete item?</h2>
      <p id="opsNextConfirmMessage">This action permanently removes the selected item and cannot be undone.</p>
      <div class="ops-next-confirm__actions">
        <button type="button" class="ops-next-confirm__button ops-next-confirm__button--cancel" data-ops-next-cancel>No, keep it.</button>
        <button type="button" class="ops-next-confirm__button ops-next-confirm__button--confirm" data-ops-next-confirm>Yes, Delete!</button>
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
  document.body.classList.remove("ops-next-confirm-open");
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
  document.body.classList.add("ops-next-confirm-open");

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
