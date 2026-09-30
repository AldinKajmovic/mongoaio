import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInlineValue, parseTypedInline } from '../../src/renderer/editor/value-parse.js';

test('parseInlineValue recognises literals and keeps zero-padded text', () => {
  assert.equal(parseInlineValue('true'), true);
  assert.equal(parseInlineValue('null'), null);
  assert.equal(parseInlineValue('42'), 42);
  assert.equal(parseInlineValue('-1.5'), -1.5);
  assert.equal(parseInlineValue('0700'), '0700');
  assert.equal(parseInlineValue('0.5'), 0.5);
  assert.deepEqual(parseInlineValue('{"a":1}'), { a: 1 });
  assert.deepEqual(parseInlineValue('[1,2]'), [1, 2]);
  assert.equal(parseInlineValue('{nope'), '{nope');
  assert.equal(parseInlineValue(''), '');
  assert.equal(parseInlineValue('  '), '  ');
});

test('parseTypedInline understands mongosh constructors', () => {
  assert.deepEqual(parseTypedInline('ObjectId("65f000000000000000000001")'),
    { value: { $oid: '65f000000000000000000001' }, display: '65f000000000000000000001' });
  assert.deepEqual(parseTypedInline("ISODate('2024-01-02')").value, { $date: '2024-01-02T00:00:00.000Z' });
  assert.deepEqual(parseTypedInline('new Date("2024-01-02T03:04:05Z")').value, { $date: '2024-01-02T03:04:05.000Z' });
  assert.deepEqual(parseTypedInline('NumberLong(123)').value, { $numberLong: '123' });
  assert.deepEqual(parseTypedInline('NumberLong("-9")').value, { $numberLong: '-9' });
  assert.deepEqual(parseTypedInline('NumberDecimal("1.10")').value, { $numberDecimal: '1.10' });
});

test('parseTypedInline keeps huge integers exact', () => {
  assert.deepEqual(parseTypedInline('9007199254740993').value, { $numberLong: '9007199254740993' });
  assert.equal(parseTypedInline('9007199254740991').value, 9007199254740991, 'safe integers stay numbers');
});

test('malformed constructors fall back to text', () => {
  assert.equal(parseTypedInline('ObjectId("short")').value, 'ObjectId("short")');
  assert.equal(parseTypedInline('ISODate("not a date")').value, 'ISODate("not a date")');
  assert.equal(parseTypedInline('NumberLong(1.5)').value, 'NumberLong(1.5)');
  assert.equal(parseTypedInline('plain').display, undefined);
});
