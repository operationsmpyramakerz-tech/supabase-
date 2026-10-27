import "server-only";

import { directPageMutationAccess } from "./order-action-auth";
import { featureAllowed } from "./feature-permissions-registry";

const ORDER_PAGES = ["Current Orders", "Orders Review", "Requested Orders", "Operations Orders"];

// Instruction templates are shared across all orders. A session by itself is
// not sufficient to change them; require edit-level page access as well as any
// explicitly configured feature restriction. View-only users may still select
// existing templates when exporting orders they can access.
export function canDownloadSharedOrderInstructions(account = {}) {
  return featureAllowed(account, "orders.documents.download_instructions");
}

export function canManageSharedOrderInstructions(account = {}) {
  return directPageMutationAccess(account, ORDER_PAGES) === true
    && canDownloadSharedOrderInstructions(account)
    && featureAllowed(account, "orders.documents.manage_instructions");
}

export { ORDER_PAGES };
