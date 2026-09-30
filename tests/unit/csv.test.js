const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { csvCell, coerceCell, parseCsv, flatten } = require('../../src/main/csv');

test('formula-looking text is neutralised on export and restored on import', () => {
  for (const text of ['=SUM(A1)', '+1', '-cmd', '@x', '\tx']) {
    const cell = csvCell(text);
    assert.ok(cell.startsWith("'") || cell.startsWith('"\''), `${JSON.stringify(text)} -> ${cell}`);
  }
  assert.equal(coerceCell("'=SUM(A1)"), '=SUM(A1)');
  assert.equal(coerceCell("'-5"), '-5', 'guarded negative stays text');
});

test('numbers and booleans are not guarded', () => {
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell(null), '');
});

test('cells with separators, quotes or newlines are quoted', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('l1\nl2'), '"l1\nl2"');
});

test('objects export as quoted Extended JSON', () => {
  const oid = new ObjectId();
  const cell = csvCell({ id: oid });
  const [row] = parseCsv(cell);
  assert.equal(JSON.parse(row[0]).id.$oid, oid.toHexString());
});

test('coerceCell types values without mangling identifiers', () => {
  assert.equal(coerceCell(''), undefined);
  assert.equal(coerceCell('true'), true);
  assert.equal(coerceCell('12'), 12);
  assert.equal(coerceCell('-0.5'), -0.5);
  assert.equal(coerceCell('0.5'), 0.5);
  assert.equal(coerceCell('00123'), '00123');
  assert.equal(coerceCell('0'), 0);
  assert.equal(coerceCell('12345678901234567890')._bsontype, 'Long');
  assert.ok(coerceCell('{"$oid":"65f000000000000000000001"}') instanceof ObjectId);
  assert.equal(coerceCell('{broken'), '{broken');
  assert.equal(coerceCell('hello'), 'hello');
});

test('parseCsv handles quotes, escaped quotes, CRLF and blank lines', () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '']]);
  assert.deepEqual(parseCsv('"multi\nline",2'), [['multi\nline', '2']]);
});

test('flatten produces dot paths and keeps BSON values whole', () => {
  const oid = new ObjectId();
  const d = new Date();
  assert.deepEqual(flatten({ a: { b: 1, c: { d: 2 } }, id: oid, when: d, list: [1] }, '', {}),
    { 'a.b': 1, 'a.c.d': 2, id: oid, when: d, list: [1] });
});
