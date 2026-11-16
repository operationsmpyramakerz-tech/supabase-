/**
 * Places the searchable Destination menu flush against its trigger.
 * Unlike the generic ClassicSelect, the top/bottom of this menu never floats
 * away from the corresponding field when it opens upwards on mobile.
 * All coordinates are in CSS viewport pixels (getBoundingClientRect units).
 */
export function expenseDestinationMenuPosition(rect, viewport, count = 0) {
  const edge = 10;
  const viewLeft = Number(viewport.left) || 0;
  const viewTop = Number(viewport.top) || 0;
  const viewWidth = Math.max(1, Number(viewport.width) || 1);
  const viewHeight = Math.max(1, Number(viewport.height) || 1);
  const rightLimit = viewLeft + viewWidth - edge;
  const bottomLimit = viewTop + viewHeight - edge;
  const width = Math.min(rect.width, Math.max(1, viewWidth - edge * 2));
  const left = Math.max(viewLeft + edge, Math.min(rect.left, rightLimit - width));
  const above = Math.max(0, rect.top - (viewTop + edge));
  const below = Math.max(0, bottomLimit - rect.bottom);
  // A search row plus up to five person cards; additional users scroll.
  const desiredHeight = Math.min(410, 73 + Math.max(1, Math.min(count, 5)) * 69);
  const useAbove = (below < Math.min(desiredHeight, 260) && above > below)
    || (above >= desiredHeight && above > below + 70);
  const height = Math.max(0, Math.min(desiredHeight, useAbove ? above : below));
  return {
    position: "fixed",
    left,
    width,
    top: useAbove ? rect.top - height : rect.bottom,
    height,
    maxHeight: height,
    zIndex: 100500,
  };
}
