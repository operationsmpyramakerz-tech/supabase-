import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEFAULT_OWN_CAR_RATE_EGP_PER_KM, ownCarRatePerKm, ownCarCostForKilometers } from '../lib/own-car-expense.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('Own car: amounts use 5.17 EGP/km rounded to two decimals', () => {
  assert.equal(DEFAULT_OWN_CAR_RATE_EGP_PER_KM, 5.17);
  assert.equal(ownCarCostForKilometers(1), 5.17);
  assert.equal(ownCarCostForKilometers(10), 51.7);
  assert.equal(ownCarCostForKilometers(2.5), 12.93);
  assert.equal(ownCarCostForKilometers(0), 0);
  assert.equal(ownCarCostForKilometers(-1), 0);
  assert.equal(ownCarCostForKilometers('invalid'), 0);
});

test('Own car: server rate can be overridden without changing historic rows', () => {
  const prior = process.env.EXPENSE_OWN_CAR_RATE_PER_KM;
  try {
    process.env.EXPENSE_OWN_CAR_RATE_PER_KM = '7.25';
    assert.equal(ownCarRatePerKm(), 7.25);
    assert.equal(ownCarCostForKilometers(3, ownCarRatePerKm()), 21.75);
    process.env.EXPENSE_OWN_CAR_RATE_PER_KM = 'not-a-price';
    assert.equal(ownCarRatePerKm(), 5.17);
  } finally {
    if (prior === undefined) delete process.env.EXPENSE_OWN_CAR_RATE_PER_KM;
    else process.env.EXPENSE_OWN_CAR_RATE_PER_KM = prior;
  }
});

test('Own car: server saves cash_out; admin edit recalculates from kilometers', () => {
  const source = read('lib/expenses-data.js');
  assert.match(source, /cash_out: cashOutAmount/);
  assert.match(source, /kilometer: isOwnCar \? kilometers : null/);
  assert.match(source, /cash_out: expenseFundsTypeKey\(payload\.fundsType\) === "owncar"/);
  assert.match(source, /cashOutAmount <= 0/);
});

test('Own car: UI and exports use stored monetary value, not km as currency', () => {
  assert.match(read('components/expenses/ExpensesDialogs.jsx'), /ownCarCostForKilometers\(form\.kilometer, ownCarRate\)/);
  assert.doesNotMatch(read('components/expenses/ExpensesClient.jsx'), /\$\{group\.kilometers\} km/);
  assert.match(read('lib/expense-export-service.js'), /number\(item\?\.cashOut\)/);
});
