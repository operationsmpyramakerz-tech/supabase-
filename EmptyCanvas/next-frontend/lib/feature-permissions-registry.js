// Shared permission catalog (Phase 1 audit v57). Registering a key does not
// automatically enforce it. Only explicitly guarded routes/features are active.
export const FEATURE_DEFINITIONS = Object.freeze(
[
  {
    "module": "home",
    "key": "home.view",
    "label": "Open dashboard"
  },
  {
    "module": "home",
    "key": "home.analysis",
    "label": "See team analysis"
  },
  {
    "module": "home",
    "key": "home.financial_analysis",
    "label": "See user expenses analysis"
  },
  {
    "module": "home",
    "key": "home.sla_view",
    "label": "View SLA metrics"
  },
  {
    "module": "home",
    "key": "home.sla_manage",
    "label": "Manage SLA settings"
  },
  {
    "module": "orders.my",
    "key": "orders.my.view",
    "label": "View My Orders"
  },
  {
    "module": "orders.my",
    "key": "orders.my.view_details",
    "label": "View order details"
  },
  {
    "module": "orders.my",
    "key": "orders.my.edit",
    "label": "Edit existing order"
  },
  {
    "module": "orders.my",
    "key": "orders.my.update_received",
    "label": "Update received quantities"
  },
  {
    "module": "orders.my",
    "key": "orders.my.archive",
    "label": "Archive order"
  },
  {
    "module": "orders.my",
    "key": "orders.my.unarchive",
    "label": "Unarchive order"
  },
  {
    "module": "orders.my",
    "key": "orders.my.delete",
    "label": "Delete order"
  },
  {
    "module": "orders.my",
    "key": "orders.my.export",
    "label": "Export current orders"
  },
  {
    "module": "orders.review",
    "key": "orders.review.view",
    "label": "View review orders"
  },
  {
    "module": "orders.review",
    "key": "orders.review.view_details",
    "label": "View review order details"
  },
  {
    "module": "orders.review",
    "key": "orders.review.approve",
    "label": "Approve / reject order"
  },
  {
    "module": "orders.review",
    "key": "orders.review.bulk_approve",
    "label": "Bulk approval"
  },
  {
    "module": "orders.review",
    "key": "orders.review.quantity",
    "label": "Edit review quantities"
  },
  {
    "module": "orders.review",
    "key": "orders.review.archive",
    "label": "Archive review order"
  },
  {
    "module": "orders.review",
    "key": "orders.review.unarchive",
    "label": "Restore review order"
  },
  {
    "module": "orders.review",
    "key": "orders.review.update_approval",
    "label": "Update approval decisions"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.view",
    "label": "View operations orders"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.details",
    "label": "View order details"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.approve",
    "label": "Approve / reject"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.ship",
    "label": "Mark as shipped"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.receive",
    "label": "Mark as arrived"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.withdrawal",
    "label": "Create withdrawal order"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.delivery",
    "label": "Create delivery order"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.edit",
    "label": "Edit saved order"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.export",
    "label": "Export / combine orders"
  },
  {
    "module": "orders.operations",
    "key": "orders.operations.upload_receipt",
    "label": "Add delivery receipt"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.view",
    "label": "View maintenance orders"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.details",
    "label": "Open maintenance details"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.log",
    "label": "Log maintenance / second log"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.mark_arrived",
    "label": "Mark delivered/arrived"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.edit",
    "label": "Edit maintenance request"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.archive",
    "label": "Archive maintenance request"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.delete",
    "label": "Delete maintenance request"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.checklist_view",
    "label": "Read checklist"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.checklist_manage",
    "label": "Edit checklist"
  },
  {
    "module": "orders.maintenance",
    "key": "orders.maintenance.export",
    "label": "Download maintenance reports/templates"
  },
  {
    "module": "orders.shopping",
    "key": "orders.shopping.view",
    "label": "Open Shopping Cart"
  },
  {
    "module": "orders.shopping",
    "key": "orders.shopping.submit",
    "label": "Submit new order"
  },
  {
    "module": "orders.shopping",
    "key": "orders.shopping.edit_submit",
    "label": "Submit an edited order"
  },
  {
    "module": "orders.shopping",
    "key": "orders.shopping.undo",
    "label": "Undo order submission"
  },
  {
    "module": "orders.tracking",
    "key": "orders.tracking.view",
    "label": "View order tracking"
  },
  {
    "module": "orders.documents",
    "key": "orders.documents.view_receipts",
    "label": "View order receipts"
  },
  {
    "module": "orders.documents",
    "key": "orders.documents.download_instructions",
    "label": "Download order instructions"
  },
  {
    "module": "orders.documents",
    "key": "orders.documents.manage_instructions",
    "label": "Update order instructions"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.view",
    "label": "View stocktaking columns"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.export",
    "label": "Export inventory report"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.add_row",
    "label": "Add component row"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.edit_rows",
    "label": "Edit inventory rows"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.start_inventory",
    "label": "Start inventory"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.update_inventory",
    "label": "Update counted quantity"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.authorize_column",
    "label": "Authorize column editing"
  },
  {
    "module": "stocktaking",
    "key": "stocktaking.upload_receipt",
    "label": "Upload stock receipt"
  },
  {
    "module": "products",
    "key": "products.view",
    "label": "View product catalog"
  },
  {
    "module": "products",
    "key": "products.create",
    "label": "Create product"
  },
  {
    "module": "products",
    "key": "products.edit",
    "label": "Edit product"
  },
  {
    "module": "products",
    "key": "products.delete",
    "label": "Delete product"
  },
  {
    "module": "products",
    "key": "products.export",
    "label": "Export products"
  },
  {
    "module": "products",
    "key": "products.image_upload",
    "label": "Upload product image"
  },
  {
    "module": "products",
    "key": "products.tag_manage",
    "label": "Manage tags"
  },
  {
    "module": "products",
    "key": "products.unit_create",
    "label": "Create units"
  },
  {
    "module": "kits",
    "key": "kits.view",
    "label": "View kits"
  },
  {
    "module": "kits",
    "key": "kits.create",
    "label": "Create kit"
  },
  {
    "module": "kits",
    "key": "kits.edit",
    "label": "Edit kit"
  },
  {
    "module": "kits",
    "key": "kits.delete",
    "label": "Delete kit"
  },
  {
    "module": "kits",
    "key": "kits.copy",
    "label": "Copy kit"
  },
  {
    "module": "kits",
    "key": "kits.item_add",
    "label": "Add component to kit"
  },
  {
    "module": "kits",
    "key": "kits.item_edit",
    "label": "Edit kit item"
  },
  {
    "module": "kits",
    "key": "kits.item_delete",
    "label": "Remove kit item"
  },
  {
    "module": "kits",
    "key": "kits.folder_create",
    "label": "Create kit folder"
  },
  {
    "module": "kits",
    "key": "kits.folder_manage",
    "label": "Rename / delete kit folder"
  },
  {
    "module": "kits",
    "key": "kits.send_stock",
    "label": "Send kit to stock"
  },
  {
    "module": "proposals",
    "key": "proposals.view",
    "label": "View proposals"
  },
  {
    "module": "proposals",
    "key": "proposals.create",
    "label": "Create proposal"
  },
  {
    "module": "proposals",
    "key": "proposals.edit",
    "label": "Edit proposal"
  },
  {
    "module": "proposals",
    "key": "proposals.delete",
    "label": "Delete proposal"
  },
  {
    "module": "proposals",
    "key": "proposals.copy",
    "label": "Copy proposal"
  },
  {
    "module": "proposals",
    "key": "proposals.item_add",
    "label": "Add proposal item"
  },
  {
    "module": "proposals",
    "key": "proposals.item_edit",
    "label": "Edit proposal item"
  },
  {
    "module": "proposals",
    "key": "proposals.item_delete",
    "label": "Remove proposal item"
  },
  {
    "module": "proposals",
    "key": "proposals.combine",
    "label": "Combine proposals"
  },
  {
    "module": "proposals",
    "key": "proposals.make_order",
    "label": "Create order from proposal"
  },
  {
    "module": "proposals",
    "key": "proposals.send_stock",
    "label": "Send proposal to stock"
  },
  {
    "module": "proposals",
    "key": "proposals.receipt_upload",
    "label": "Upload proposal receipt"
  },
  {
    "module": "events.requests",
    "key": "events.requests.view",
    "label": "View event requests"
  },
  {
    "module": "events.requests",
    "key": "events.requests.create",
    "label": "Create event request"
  },
  {
    "module": "events.requests",
    "key": "events.requests.edit",
    "label": "Edit event request"
  },
  {
    "module": "events.requests",
    "key": "events.requests.workflow",
    "label": "Change event workflow status"
  },
  {
    "module": "events.requests",
    "key": "events.requests.cancel",
    "label": "Cancel event request"
  },
  {
    "module": "events.requests",
    "key": "events.requests.archive",
    "label": "Archive event request"
  },
  {
    "module": "events.requests",
    "key": "events.requests.create_type",
    "label": "Manage event types"
  },
  {
    "module": "events.requests",
    "key": "events.requests.governorate_rates",
    "label": "Manage governorate rates"
  },
  {
    "module": "events.requests",
    "key": "events.requests.pdf",
    "label": "Export event PDF"
  },
  {
    "module": "events.calendar",
    "key": "events.calendar.view",
    "label": "View calendar events"
  },
  {
    "module": "events.components",
    "key": "events.components.view",
    "label": "View event components"
  },
  {
    "module": "events.components",
    "key": "events.components.create",
    "label": "Create event component"
  },
  {
    "module": "events.components",
    "key": "events.components.edit",
    "label": "Edit event component"
  },
  {
    "module": "events.components",
    "key": "events.components.delete",
    "label": "Delete event component"
  },
  {
    "module": "events.components",
    "key": "events.components.upload",
    "label": "Upload component media"
  },
  {
    "module": "events.team",
    "key": "events.team.view",
    "label": "View event team"
  },
  {
    "module": "events.team",
    "key": "events.team.member_create",
    "label": "Add team member"
  },
  {
    "module": "events.team",
    "key": "events.team.member_edit",
    "label": "Edit team member"
  },
  {
    "module": "events.team",
    "key": "events.team.member_delete",
    "label": "Delete team member"
  },
  {
    "module": "events.team",
    "key": "events.team.attendance_manage",
    "label": "Manage event attendance"
  },
  {
    "module": "events.team",
    "key": "events.team.photo_upload",
    "label": "Upload event team ID"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.view",
    "label": "View B2C databases"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.create",
    "label": "Create B2C database"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.edit",
    "label": "Edit B2C database"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.copy",
    "label": "Copy B2C database"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.delete",
    "label": "Delete B2C database"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.fields",
    "label": "Manage database fields"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.record_edit",
    "label": "Edit customer record"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.record_delete",
    "label": "Delete customer record"
  },
  {
    "module": "b2c.database",
    "key": "b2c.database.export",
    "label": "Export B2C data"
  },
  {
    "module": "b2c.forms",
    "key": "b2c.forms.view",
    "label": "View customer forms"
  },
  {
    "module": "b2c.forms",
    "key": "b2c.forms.create",
    "label": "Create customer form"
  },
  {
    "module": "b2c.forms",
    "key": "b2c.forms.edit",
    "label": "Edit customer form"
  },
  {
    "module": "b2c.forms",
    "key": "b2c.forms.builder",
    "label": "Edit form builder"
  },
  {
    "module": "b2c.forms",
    "key": "b2c.forms.submit",
    "label": "Submit form response"
  },
  {
    "module": "tasks",
    "key": "tasks.view",
    "label": "View task manager"
  },
  {
    "module": "tasks",
    "key": "tasks.project_create",
    "label": "Create project/ticket"
  },
  {
    "module": "tasks",
    "key": "tasks.project_edit",
    "label": "Edit project/ticket"
  },
  {
    "module": "tasks",
    "key": "tasks.project_archive",
    "label": "Archive ticket"
  },
  {
    "module": "tasks",
    "key": "tasks.project_delete",
    "label": "Delete ticket"
  },
  {
    "module": "tasks",
    "key": "tasks.mark_delivered",
    "label": "Mark project delivered"
  },
  {
    "module": "tasks",
    "key": "tasks.workflow_save",
    "label": "Save people workflow"
  },
  {
    "module": "tasks",
    "key": "tasks.workflow_delete",
    "label": "Delete workflow"
  },
  {
    "module": "tasks",
    "key": "tasks.workflow_archive",
    "label": "Archive workflow"
  },
  {
    "module": "tasks",
    "key": "tasks.assignment_archive",
    "label": "Archive assignment"
  },
  {
    "module": "tasks",
    "key": "tasks.assignment_delete",
    "label": "Delete assignment"
  },
  {
    "module": "tasks",
    "key": "tasks.assignment_work",
    "label": "Update assigned task work"
  },
  {
    "module": "tasks",
    "key": "tasks.section_work",
    "label": "Update department work"
  },
  {
    "module": "tasks",
    "key": "tasks.section_edit",
    "label": "Edit workflow section"
  },
  {
    "module": "tasks",
    "key": "tasks.attachment_upload",
    "label": "Upload task attachment"
  },
  {
    "module": "expenses",
    "key": "expenses.view",
    "label": "View expenses"
  },
  {
    "module": "expenses",
    "key": "expenses.cash_in",
    "label": "Record cash in"
  },
  {
    "module": "expenses",
    "key": "expenses.cash_out",
    "label": "Record cash out"
  },
  {
    "module": "expenses",
    "key": "expenses.settle",
    "label": "Settle expenses"
  },
  {
    "module": "expenses",
    "key": "expenses.export",
    "label": "Export expenses PDF/Excel"
  },
  {
    "module": "expenses",
    "key": "expenses.screenshot",
    "label": "Download expense screenshot"
  },
  {
    "module": "expenses.users",
    "key": "expenses.users.view",
    "label": "View user expenses"
  },
  {
    "module": "expenses.users",
    "key": "expenses.users.edit",
    "label": "Admin update user expenses"
  },
  {
    "module": "expenses.users",
    "key": "expenses.users.delete",
    "label": "Admin delete user expenses"
  },
  {
    "module": "expenses.users",
    "key": "expenses.users.export",
    "label": "Export users expense reports"
  },
  {
    "module": "kpis",
    "key": "kpis.view",
    "label": "View KPIs"
  },
  {
    "module": "kpis",
    "key": "kpis.standard_manage",
    "label": "Manage KPI standards"
  },
  {
    "module": "kpis",
    "key": "kpis.review_create",
    "label": "Create KPI review"
  },
  {
    "module": "kpis",
    "key": "kpis.scores_edit",
    "label": "Edit KPI scores"
  },
  {
    "module": "kpis",
    "key": "kpis.evidence_upload",
    "label": "Upload KPI evidence"
  },
  {
    "module": "kpis",
    "key": "kpis.report",
    "label": "Export KPI report"
  },
  {
    "module": "users",
    "key": "users.view",
    "label": "View team directory"
  },
  {
    "module": "users",
    "key": "users.member_create",
    "label": "Create user"
  },
  {
    "module": "users",
    "key": "users.member_edit",
    "label": "Edit user"
  },
  {
    "module": "users",
    "key": "users.member_delete",
    "label": "Delete user"
  },
  {
    "module": "users",
    "key": "users.member_move",
    "label": "Move user department"
  },
  {
    "module": "users",
    "key": "users.department_create",
    "label": "Create department"
  },
  {
    "module": "users",
    "key": "users.department_edit",
    "label": "Rename department"
  },
  {
    "module": "users",
    "key": "users.department_delete",
    "label": "Delete department"
  },
  {
    "module": "users",
    "key": "users.page_access_manage",
    "label": "Grant/revoke page access"
  },
  {
    "module": "users",
    "key": "users.feature_access_manage",
    "label": "Grant/revoke feature access (NEW)"
  },
  {
    "module": "users",
    "key": "users.sv_access_manage",
    "label": "Manage school / order review access"
  },
  {
    "module": "users",
    "key": "users.signup_approve",
    "label": "Approve signup"
  },
  {
    "module": "users",
    "key": "users.signup_reject",
    "label": "Reject signup"
  },
  {
    "module": "users",
    "key": "users.stock_column_create",
    "label": "Create stocktaking column"
  },
  {
    "module": "history",
    "key": "history.view",
    "label": "Read system history"
  },
  {
    "module": "history",
    "key": "history.clear",
    "label": "Clear system history"
  },
  {
    "module": "backup",
    "key": "backup.view",
    "label": "View backup tables"
  },
  {
    "module": "backup",
    "key": "backup.row_read",
    "label": "View backup table rows"
  },
  {
    "module": "backup",
    "key": "backup.row_create",
    "label": "Create database row"
  },
  {
    "module": "backup",
    "key": "backup.row_edit",
    "label": "Edit database row"
  },
  {
    "module": "backup",
    "key": "backup.export",
    "label": "Export backup"
  },
  {
    "module": "backup",
    "key": "backup.import",
    "label": "Import backup"
  },
  {
    "module": "backup",
    "key": "backup.delete_table",
    "label": "Delete one table data"
  },
  {
    "module": "backup",
    "key": "backup.delete_all",
    "label": "Delete all backed-up data"
  },
  {
    "module": "notifications",
    "key": "notifications.view",
    "label": "Read notifications"
  },
  {
    "module": "notifications",
    "key": "notifications.read_manage",
    "label": "Mark notifications read"
  },
  {
    "module": "notifications",
    "key": "notifications.preferences",
    "label": "Set notification channel preferences"
  },
  {
    "module": "account",
    "key": "account.view",
    "label": "View own profile"
  },
  {
    "module": "account",
    "key": "account.edit",
    "label": "Edit own profile"
  },
  {
    "module": "account",
    "key": "account.avatar",
    "label": "Upload/change profile image"
  },
  {
    "module": "account",
    "key": "account.password",
    "label": "Verify/change own password"
  },
  {
    "module": "sla",
    "key": "sla.view",
    "label": "Read SLA settings"
  },
  {
    "module": "sla",
    "key": "sla.manage",
    "label": "Update SLA settings"
  }
]
);

export const TASK_SCOPE_MARKER = "tasks.__scoped";

export const EVENT_REQUEST_SCOPE_MARKER = "events.requests.__scoped";
const knownKeys = new Set(FEATURE_DEFINITIONS.map((entry) => entry.key));
// Explicit opt-in for My Orders; existing Phase 2A advanced profiles remain intact.
export const MY_ORDERS_ENFORCEMENT_MARKER = "orders.my.__enforced";
// Separate explicit opt-in: existing all-scope grants must NOT broaden My Orders
// or narrow Operations Orders simply because another module was activated.
export const ORDER_SCOPE_MARKERS = Object.freeze({
  "orders.my": "orders.my.__scoped",
  "orders.operations": "orders.operations.__scoped",
  "orders.maintenance": "orders.maintenance.__scoped",
});
// Legacy opt-out markers for the original two Phase 2A modules. A newly
// enabled Expenses/Tasks/etc. profile must not silently migrate these too.
export const PHASE2A_LEGACY_MARKERS = Object.freeze({
  products: "products.__legacy",
  "orders.operations": "orders.operations.__legacy",
});
export function isKnownFeature(key) {
  const clean = String(key || "");
  return knownKeys.has(clean) || clean === MY_ORDERS_ENFORCEMENT_MARKER || Object.values(PHASE2A_LEGACY_MARKERS).includes(clean) || Object.values(ORDER_SCOPE_MARKERS).includes(clean) || clean === TASK_SCOPE_MARKER || clean === EVENT_REQUEST_SCOPE_MARKER;
}

// Legacy accounts remain in their original page-access mode until an admin
// explicitly activates their feature profile. Active profiles are deny-by-default.
export function featureAllowed(account, key, { legacyAllowed = true, scopes = ["all"] } = {}) {
  if (!isKnownFeature(key)) return false;
  // The other modules remain on their previous authorization model until
  // their UI + backend entry points have been audited and switched together.
  const state = account?.featureAccess;
  // Expenses by Users is now a scoped module. These four actions accept
  // Own/Team/All, but the API still enforces the selected record scope.
  if (key.startsWith("expenses.users.")) scopes = ["own", "team", "all"];
  if (key.startsWith("tasks.") && state?.grants?.[TASK_SCOPE_MARKER]?.allowed === true) scopes = ["own", "team", "all"];
  if (["events.requests.view", "events.requests.edit", "events.requests.workflow", "events.requests.cancel", "events.requests.archive", "events.requests.pdf"].includes(key) && state?.grants?.[EVENT_REQUEST_SCOPE_MARKER]?.allowed === true) scopes = ["own", "team", "all"];
  if ((key.startsWith("orders.my.") && state?.grants?.[ORDER_SCOPE_MARKERS["orders.my"]]?.allowed === true)
    || (key.startsWith("orders.operations.") && state?.grants?.[ORDER_SCOPE_MARKERS["orders.operations"]]?.allowed === true)
    || (key.startsWith("orders.maintenance.") && state?.grants?.[ORDER_SCOPE_MARKERS["orders.maintenance"]]?.allowed === true)) scopes = ["own", "team", "all"];
  if (state?.mode !== "enforced") return !!legacyAllowed;
  // Explicitly opting out of an original pilot module restores ONLY its prior
  // page rules. The existing page-access gate still runs on every endpoint.
  if (key.startsWith("products.") && state.grants?.[PHASE2A_LEGACY_MARKERS.products]?.allowed === true) return !!legacyAllowed;
  if (key.startsWith("orders.operations.") && state.grants?.[PHASE2A_LEGACY_MARKERS["orders.operations"]]?.allowed === true) return !!legacyAllowed;
  const pilot = key.startsWith("products.") || key.startsWith("orders.operations.");
  if (key === MY_ORDERS_ENFORCEMENT_MARKER) return state.grants?.[key]?.allowed === true;
  if (key.startsWith("orders.my.")) {
    if (state.grants?.[MY_ORDERS_ENFORCEMENT_MARKER]?.allowed !== true) return !!legacyAllowed;
    const grant = state.grants?.[key];
    return grant?.allowed === true && scopes.includes(grant.scope || "all");
  }
  const moduleMarker = key.startsWith("orders.maintenance.") ? "orders.maintenance.view"
    : key.startsWith("orders.shopping.") ? "orders.shopping.view"
    : key.startsWith("tasks.") ? "tasks.view"
    : key.startsWith("events.calendar.") ? "events.calendar.view"
    : key.startsWith("events.requests.") ? "events.requests.view"
    : key.startsWith("events.components.") ? "events.components.view"
    : key.startsWith("events.team.") ? "events.team.view"
    : key.startsWith("kits.") ? "kits.view"
    : key.startsWith("proposals.") ? "proposals.view"
    : key.startsWith("orders.review.") ? "orders.review.view"
    : key.startsWith("stocktaking.") ? "stocktaking.view"
    : key.startsWith("expenses.users.") ? "expenses.users.view"
    : key.startsWith("expenses.") ? "expenses.view"
    : key.startsWith("users.") ? "users.view"
    : key.startsWith("b2c.database.") ? "b2c.database.view"
    : key.startsWith("b2c.forms.") ? "b2c.forms.view"
    : key.startsWith("backup.") ? "backup.view"
    : key.startsWith("history.") ? "history.view"
    : key.startsWith("kpis.") ? "kpis.view"
    : key.startsWith("sla.") ? "sla.view"
    : key.startsWith("home.") ? "home.view" : null;
  // Module migrations are opt-in. Persist even a denied .view marker so
  // new grants never silently remove rights from previously enabled users.
  if (!pilot && (!moduleMarker || !Object.hasOwn(state.grants || {}, moduleMarker))) return !!legacyAllowed;
  // Newly migrated modules require View *and* the action grant. A hidden
  // page must not permit direct mutations through an independently checked API.
  if ((key.startsWith("kits.") || key.startsWith("proposals.") || key.startsWith("orders.review.") || key.startsWith("stocktaking.") || key.startsWith("expenses.") || key.startsWith("users.") || key.startsWith("b2c.database.") || key.startsWith("b2c.forms.") || key.startsWith("backup.") || key.startsWith("history.") || key.startsWith("kpis.") || key.startsWith("sla.") || key.startsWith("home.") || key.startsWith("orders.maintenance."))
      && key !== moduleMarker && state.grants?.[moduleMarker]?.allowed !== true) return false;
  const grant = state?.grants?.[key];
  return grant?.allowed === true && scopes.includes(grant.scope || "all");
}

export const PILOT_FEATURE_MODULES = Object.freeze(["products", "orders.operations", "orders.my", "orders.maintenance", "orders.shopping", "tasks", "events.requests", "events.calendar", "events.components", "events.team", "kits", "proposals", "orders.review", "stocktaking", "expenses", "expenses.users", "users", "b2c.database", "b2c.forms", "backup", "history", "kpis", "sla", "home"]);

// Permissions with both server-side enforcement and UI controls in Phase 2A.
// Do not show toggles for unprotected actions; that would imply false security.
export const ACTIVE_PILOT_FEATURE_KEYS = Object.freeze([
  "home.view", "home.analysis", "home.financial_analysis",
  "kpis.view", "kpis.standard_manage", "kpis.review_create", "kpis.scores_edit", "kpis.evidence_upload", "kpis.report",
  "sla.view", "sla.manage",
  "backup.view", "backup.row_read", "backup.row_create", "backup.row_edit", "backup.export", "backup.import", "backup.delete_table", "backup.delete_all",
  "history.view", "history.clear",
  "users.view", "users.member_create", "users.member_edit", "users.member_delete", "users.member_move",
  "users.department_create", "users.department_edit", "users.department_delete",
  "users.page_access_manage", "users.feature_access_manage", "users.sv_access_manage",
  "users.signup_approve", "users.signup_reject", "users.stock_column_create",
  "b2c.database.view", "b2c.database.create", "b2c.database.edit", "b2c.database.copy", "b2c.database.delete",
  "b2c.database.fields", "b2c.database.record_edit", "b2c.database.record_delete", "b2c.database.export",
  "b2c.forms.view", "b2c.forms.create", "b2c.forms.edit", "b2c.forms.builder", "b2c.forms.submit",
  "stocktaking.view", "stocktaking.export", "stocktaking.add_row", "stocktaking.edit_rows",
  "stocktaking.start_inventory", "stocktaking.update_inventory", "stocktaking.authorize_column", "stocktaking.upload_receipt",
  "expenses.view", "expenses.cash_in", "expenses.cash_out", "expenses.settle", "expenses.export", "expenses.screenshot",
  "expenses.users.view", "expenses.users.edit", "expenses.users.delete", "expenses.users.export",
  "kits.view", "kits.create", "kits.edit", "kits.delete", "kits.copy", "kits.item_add", "kits.item_edit", "kits.item_delete", "kits.folder_create", "kits.folder_manage", "kits.send_stock", "proposals.view", "proposals.create", "proposals.edit", "proposals.delete", "proposals.copy", "proposals.item_add", "proposals.item_edit", "proposals.item_delete", "proposals.combine", "proposals.make_order", "proposals.send_stock", "proposals.receipt_upload", "orders.review.view", "orders.review.view_details", "orders.review.approve", "orders.review.bulk_approve", "orders.review.quantity", "orders.review.archive", "orders.review.unarchive", "orders.review.update_approval",
  "orders.my.view", "orders.my.edit", "orders.my.archive",
  "orders.my.unarchive", "orders.my.delete", "orders.my.export",
  "products.view", "products.create", "products.edit", "products.delete",
  "products.tag_manage", "products.unit_create", "products.image_upload",
  "orders.operations.view", "orders.operations.approve", "orders.operations.ship",
  "orders.operations.receive", "orders.operations.withdrawal",
  "orders.operations.delivery", "orders.operations.edit", "orders.operations.export",
  "orders.maintenance.view", "orders.maintenance.details", "orders.maintenance.log",
  "orders.maintenance.mark_arrived", "orders.maintenance.edit", "orders.maintenance.archive",
  "orders.maintenance.delete", "orders.maintenance.checklist_manage", "orders.maintenance.export",
  "orders.shopping.view", "orders.shopping.submit", "orders.shopping.edit_submit", "orders.shopping.undo",
  "tasks.view", "tasks.project_create", "tasks.project_edit", "tasks.project_archive",
  "tasks.project_delete", "tasks.mark_delivered", "tasks.workflow_save",
  "tasks.workflow_delete", "tasks.workflow_archive", "tasks.assignment_archive",
  "tasks.assignment_delete", "tasks.assignment_work", "tasks.section_work",
  "tasks.section_edit", "tasks.attachment_upload",
  "events.calendar.view",
  "events.requests.view", "events.requests.create", "events.requests.edit",
  "events.requests.workflow", "events.requests.cancel", "events.requests.archive",
  "events.requests.create_type", "events.requests.governorate_rates", "events.requests.pdf",
  "events.components.view", "events.components.create", "events.components.edit",
  "events.components.delete", "events.components.upload",
  "events.team.view", "events.team.member_create", "events.team.member_edit",
  "events.team.member_delete", "events.team.attendance_manage", "events.team.photo_upload",
]);
