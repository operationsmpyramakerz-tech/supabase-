import 'server-only';
import { rpc } from './supabase-rest';
import { buildAtomicOrderActionRequest } from './order-atomic-policy.mjs';

// Opt in only after running sql/ERP_Phase2Q3F_Atomic_Order_Actions.sql
// on Staging and verifying the SERVICE ROLE grant and end-to-end scenarios.
export function useAtomicOrderActions() {
  return String(process.env.ERP_ATOMIC_ORDER_MUTATIONS || '').trim().toLowerCase() === 'enabled';
}

export async function performAtomicOrderAction({ action, ids, rows, orderNumber, tableName }) {
  if (String(tableName || '') !== 'orders') {
    const error = new Error('Atomic order actions support only public.orders. Check SUPABASE_ORDERS_TABLE.');
    error.status = 503;
    throw error;
  }
  const args = buildAtomicOrderActionRequest({ action, ids, rows, orderNumber });
  let result;
  try {
    result = await rpc('erp_atomic_order_action', args, {
      timeoutMs: 30000,
      profileName: 'orders.atomic-whole-order',
    });
  } catch (cause) {
    const reason = String(cause?.details?.code || '');
    const error = new Error(reason === 'P0001'
      ? 'The order has changed. Refresh it before repeating the action.'
      : 'Atomic order action failed. Verify the RPC migration and server service-role permissions.');
    error.status = reason === 'P0001' ? 409 : 503;
    error.cause = cause;
    throw error;
  }
  if (result?.ok !== true || result?.action !== action || result?.affected !== ids.length) {
    const error = new Error('Atomic order result could not be verified. Refresh the order.');
    error.status = 503;
    throw error;
  }
  return result;
}
