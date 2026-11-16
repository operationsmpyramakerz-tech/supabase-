import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const dialogs = read('../components/expenses/ExpensesDialogs.jsx');
const styles = read('../public/css/expenses-classic-inline.css');
const page = read('../app/expenses/page.jsx');

test('only the Cash out Add Expense modal gets the squared flush-to-bottom finish', () => {
  assert.match(dialogs, /function ClassicModal\(\{ title, onClose, children, compact = false, bottomSheet = false, flushBottom = false \}\)/);
  assert.match(dialogs, /<ClassicModal title="Add Expense" onClose=\{\(\) => setStep\("order"\)\} flushBottom>/);
  assert.match(styles, /\.ex-modal-box--flush-bottom\s*\{[^}]*border-radius:\s*25px 25px 0 0/s);
});

test('Choose Order fills the bottom edge and has a centered floating cash-out icon', () => {
  assert.match(dialogs, /<div className="ex-modal-sheet-frame">/);
  assert.match(dialogs, /<ClassicExpenseIcon name="arrow-up-right" size=\{29\}\/>/);
  assert.match(dialogs, /<ClassicModal title="Choose Order" onClose=\{onClose\} compact bottomSheet>/);
  assert.match(styles, /\.ex-modal--bottom-sheet\s*\{[^}]*padding:\s*40px 0 0;/s);
  assert.match(styles, /\.ex-modal-box--bottom-sheet\s*\{[^}]*border-radius:\s*28px 28px 0 0;/s);
  assert.match(styles, /\.ex-modal-sheet-frame > \.ex-modal-sheet-icon\s*\{[^}]*top:\s*-28px;[^}]*place-items:\s*center;/s);
});

test('expense card matches picker item presentation, shows date and +N for other orders', () => {
  assert.match(dialogs, /className="order-preview-card order-preview-card--inline order-preview-card--expense"/);
  assert.match(dialogs, /<ExpensePickerTypeIcon name=/);
  assert.match(dialogs, /selectedOrders\[0\]\?\.orderId/);
  assert.match(dialogs, /selectedOrders\.length > 1/);
  assert.match(dialogs, /\+\{selectedOrders\.length - 1\}/);
  assert.match(dialogs, /date \? formatDate\(date\) : ""/);
  assert.match(dialogs, /className="order-change-btn order-preview-entry__change"/);
  assert.match(styles, /\.order-preview-entry__more\s*\{/);
});

test('backend order linking still receives every selected order (visual summary only)', () => {
  assert.match(dialogs, /selectedOrderIds: isManual \? \[\] : selectedOrders\.flatMap/);
  assert.match(dialogs, /selectedOrderKeys: isManual \? \[\] : selectedOrders\.map/);
  assert.match(dialogs, /orderKeys: draft\.selectedOrderKeys/);
  assert.match(page, /expenses-classic-inline\.css\?v=v432-cash-out-floating-badge/);
});
