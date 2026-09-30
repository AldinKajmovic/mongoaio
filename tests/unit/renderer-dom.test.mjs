import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = new EventTarget();
const { parseRelaxedJSON, getNestedValue, setNestedValue, escapeHtml } = await import('../../src/renderer/utils/dom.js');

test('strict JSON is parsed as-is', () => {
  assert.deepEqual(parseRelaxedJSON('{"a": 1, "$or": [{"b": 2}]}'), { a: 1, $or: [{ b: 2 }] });
});

test('unquoted keys, dotted paths and operators', () => {
  assert.deepEqual(parseRelaxedJSON('{name: "x", age: {$gt: 5}, "a.b": 1, nested.path: 2}'),
    { name: 'x', age: { $gt: 5 }, 'a.b': 1, 'nested.path': 2 });
});

test('mongosh constructors become typed markers', () => {
  assert.deepEqual(parseRelaxedJSON('{_id: ObjectId("65f000000000000000000001")}'), { _id: { $oid: '65f000000000000000000001' } });
  assert.deepEqual(parseRelaxedJSON('{at: {$gte: ISODate("2024-01-01")}}'), { at: { $gte: { $date: '2024-01-01' } } });
  assert.deepEqual(parseRelaxedJSON("{at: new Date('2024-01-01T00:00:00Z')}"), { at: { $date: '2024-01-01T00:00:00Z' } });
  assert.deepEqual(parseRelaxedJSON('{n: NumberLong("9007199254740993")}'), { n: { $numberLong: '9007199254740993' } });
  assert.deepEqual(parseRelaxedJSON('{n: NumberLong(-5)}'), { n: { $numberLong: '-5' } });
  assert.deepEqual(parseRelaxedJSON('{p: NumberDecimal("1.10")}'), { p: { $numberDecimal: '1.10' } });
  assert.deepEqual(parseRelaxedJSON('{i: NumberInt(7), d: Double(2.5)}'), { i: 7, d: 2.5 });
});

test('invalid input throws', () => {
  assert.throws(() => parseRelaxedJSON('{a: }'));
  assert.throws(() => parseRelaxedJSON('not json'));
});

test('nested get/set refuse prototype keys', () => {
  const o = {};
  setNestedValue(o, 'a.b.0', 1);
  assert.equal(getNestedValue(o, 'a.b.0'), 1);
  setNestedValue(o, '__proto__.polluted', true);
  assert.equal({}.polluted, undefined);
  assert.equal(getNestedValue(o, 'constructor.name'), undefined);
});

test('escapeHtml covers attribute breakers', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
});
