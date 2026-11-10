import test from 'node:test';
import assert from 'node:assert/strict';
import { eventConfirmation, eventConfirmationLabel } from '../lib/event-confirmation.mjs';

test('new and legacy pending event requests are waiting for confirmation', () => {
  for (const status of ['submitted', 'under_review', 'approved', '', null]) {
    assert.equal(eventConfirmation(status), 'pending');
    assert.equal(eventConfirmationLabel(status), 'Pending Confirmation');
  }
});
test('approval and execution completion retain confirmed agenda state', () => {
  for (const status of ['in_progress', 'completed', 'confirmed']) {
    assert.equal(eventConfirmation(status), 'confirmed');
    assert.equal(eventConfirmationLabel(status), 'Confirmed');
  }
});
test('cancelled requests are not shown as confirmed or pending', () => {
  assert.equal(eventConfirmation('cancelled'), 'cancelled');
  assert.equal(eventConfirmationLabel('cancelled'), 'Cancelled');
});
