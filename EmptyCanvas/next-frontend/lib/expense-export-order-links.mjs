import { expenseOrderNumbers, expenseOrderReference, expenseShareUrl } from './expense-public-share.mjs';
const text = value => String(value ?? '').trim();
// Each order column points to its own public detail page; Reason points to
// the combined detail page. The signed target cannot be changed by recipients.
export function expenseOrderLinks(item = {}, baseUrl = '', options) {
  const reference = expenseOrderReference(item);
  return expenseOrderNumbers(item).map(number => ({
    text: `ORD-${number}`,
    hyperlink: reference ? expenseShareUrl(baseUrl, item.id, 'order', number, reference.fingerprint, options) : '',
  }));
}
export function expenseReasonExportPayload(item = {}, baseUrl = '', options) {
  const links = expenseOrderLinks(item, baseUrl, options);
  const reference = expenseOrderReference(item);
  if (!links.length) return { text: text(item.reason), hyperlink: '', links: [] };
  return { text: text(item.reason) || links.map(entry => entry.text).join(', '), hyperlink: reference ? expenseShareUrl(baseUrl, item.id, 'order', 'all', reference.fingerprint, options) : '', links };
}
