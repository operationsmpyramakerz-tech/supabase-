// Position the Expenses multi-order picker inside the visible viewport.
// On narrow screens, prefer opening ABOVE the trigger, away from the
// navigation dock and on-screen keyboard. On desktop, use the side with room.
export function expenseOrderMenuPosition(rect, viewport, { preferAbove = false } = {}) {
  const margin = 12;
  const gap = 8;
  const viewTop = Number(viewport.top) || 0;
  const viewLeft = Number(viewport.left) || 0;
  const viewWidth = Math.max(0, Number(viewport.width) || 0);
  const viewHeight = Math.max(0, Number(viewport.height) || 0);
  const viewBottom = viewTop + viewHeight;
  const viewRight = viewLeft + viewWidth;
  const width = Math.max(0, Math.min(Math.max(rect.width, 290), viewWidth - 2 * margin));
  const left = Math.max(viewLeft + margin, Math.min(rect.left, viewRight - margin - width));
  const above = Math.max(0, rect.top - viewTop - margin - gap);
  const below = Math.max(0, viewBottom - rect.bottom - margin - gap);
  // A minimum usable area keeps the menu from opening upward when a very
  // small landscape viewport has no room above either. Below is the fallback.
  const openAbove = preferAbove ? above >= 185 || above > below : below < 270 && above > below;
  const maxHeight = Math.min(390, openAbove ? above : below);
  const top = openAbove ? rect.top - gap - maxHeight : rect.bottom + gap;
  return { width, left, top, maxHeight };
}
