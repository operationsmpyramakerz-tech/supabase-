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
  assert.match(styles, /\.ex-modal-box--flush-bottom\s*\{[^}]*border-radius:\s*28px 28px 0 0/s);
});

test('Choose Order fills the bottom edge and has a centered floating cash-out icon', () => {
  assert.match(dialogs, /<div className="ex-modal-sheet-scroll">\{modalContent\}<\/div>/);
  assert.match(dialogs, /<ClassicExpenseIcon name="arrow-up-right" size=\{28\}\/>/);
  assert.match(dialogs, /<ClassicModal title="Choose Order" onClose=\{onClose\} compact bottomSheet>/);
  assert.match(styles, /\.ex-modal-box--bottom-sheet\s*\{[^}]*border-radius:\s*28px 28px 0 0;/s);
  assert.match(styles, /\.ex-modal-box--bottom-sheet \.ex-modal-sheet-icon--cash-out\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-28px;[^}]*left:\s*50%;[^}]*width:\s*56px;[^}]*height:\s*56px;/s);
  // The global animation on direct modal children must not override the badge's
  // centering transform (otherwise it shifts right by half its width).
  assert.match(styles, /\.ex-modal-box--bottom-sheet \.ex-modal-sheet-icon--cash-out\s*\{[^}]*transform:\s*translateX\(-50%\);\s*animation:\s*none !important;/s);
  assert.match(styles, /\.ex-modal-box--bottom-sheet\s*\{[^}]*overflow:\s*visible;/s);
  assert.match(styles, /\.ex-modal-box--bottom-sheet \.ex-modal-sheet-scroll\s*\{[^}]*overflow-y:\s*auto;/s);
});

test('Add Expense uses a full-width bottom sheet with floating Add Money, without an order preview', () => {
  assert.doesNotMatch(dialogs, /className="order-preview-card order-preview-card--inline order-preview-card--expense"/);
  assert.match(dialogs, /<span className="ex-modal-expense-icon" aria-hidden="true"><ClassicExpenseIcon name="money-add-badge" size=\{28\}\/><\/span>/);
  assert.match(dialogs, /<div className="ex-modal-expense-scroll">\{modalContent\}<\/div>/);
  assert.match(styles, /\.ex-modal--flush-bottom\s*\{[^}]*width:\s*100vw;[^}]*padding:\s*12px 0 0;/s);
  assert.match(styles, /\.ex-modal-box--flush-bottom\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
  assert.match(styles, /\.ex-modal-box--flush-bottom \.ex-modal-expense-icon\s*\{[^}]*top:\s*-28px;[^}]*left:\s*50%;[^}]*width:\s*56px;[^}]*height:\s*56px;[^}]*transform:\s*translateX\(-50%\);[^}]*animation:\s*none !important;/s);
  assert.match(styles, /\.ex-modal-box--flush-bottom \.ex-modal-expense-scroll\s*\{[^}]*overflow-y:\s*auto;/s);
});

test('backend order linking still receives every selected order (visual summary only)', () => {
  assert.match(dialogs, /selectedOrderIds: isManual \? \[\] : selectedOrders\.flatMap/);
  assert.match(dialogs, /selectedOrderKeys: isManual \? \[\] : selectedOrders\.map/);
  assert.match(dialogs, /orderKeys: draft\.selectedOrderKeys/);
  assert.match(page, /expenses-classic-inline\.css\?v=v437-destination-field/);
});
