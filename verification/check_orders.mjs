import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/orders/orderActions.js', import.meta.url), 'utf8');
const { actionsFor, checkedOrder, transitionAndRead } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const order = { id: 7, status: 'ACCEPTED', total_price: '15.00', created_at: '2026-09-09T12:00:00Z', items: [] };
assert.deepEqual(actionsFor('PLACED', false), ['cancel']);
assert.deepEqual(actionsFor('PLACED', true), ['accept']);
assert.deepEqual(actionsFor('ACCEPTED', true), ['complete']);
for (const status of ['ACCEPTED', 'COMPLETED', 'CANCELLED']) assert.deepEqual(actionsFor(status, false), []);
for (const status of ['COMPLETED', 'CANCELLED']) assert.deepEqual(actionsFor(status, true), []);
for (const error of [{ code: 'ORDER_STATE_CONFLICT' }, { outcomeUnknown: true }, { status: 403, message: 'Forbidden' }]) {
  const calls = [];
  const result = await transitionAndRead({ id: 7,
    write: async id => { calls.push(['write', id]); throw error; },
    read: async id => { calls.push(['read', id]); return order; } });
  assert.deepEqual(calls, [['write', 7], ['read', 7]]);
  assert.equal(result.order.status, 'ACCEPTED'); assert.equal(result.type, 'warning');
}
const missing = await transitionAndRead({ id: 7, write: async () => order, read: async () => { throw new Error('Offline'); } });
assert.equal(missing.order, null); assert.equal(missing.error, 'Offline');
const wrong = await transitionAndRead({ id: 7, write: async () => order, read: async () => ({ ...order, id: 8 }) });
assert.equal(wrong.order, null);
assert.throws(() => checkedOrder({ ...order, total_price: 15 }));
assert.throws(() => checkedOrder({ ...order, status: 'PAID' }));
console.log('PASS: role/status actions; one write then read after conflict, timeout and denial; failed reload removes actionable data; wrong-order response rejected.');
