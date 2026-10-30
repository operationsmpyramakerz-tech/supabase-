// Stable document identity: order numbers come from server-verified order rows,
// never from editable PR fields or the selection of component row IDs.
export function prOrderIdentity(rows) {
  const values = Array.isArray(rows) ? rows : [];
  if (!values.length) throw new Error("Purchase Requisition must refer to an existing order.");
  const numbers = [...new Set(values.map(row => {
    const value = row?.order_number ?? row?.orderIdNumber ?? row?.orderNumber;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Order number could not be verified.");
    return parsed;
  }))].sort((a,b) => a-b);
  return { orderKey: numbers.map(number => `ORD-${number}`).join("+"), orderNumbers: numbers };
}
