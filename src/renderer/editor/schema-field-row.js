import { escapeHtml } from '../utils/dom.js';


const TYPE_CLASS = {
  string: 'schema-type--string',
  int: 'schema-type--int',
  double: 'schema-type--double',
  long: 'schema-type--long',
  decimal128: 'schema-type--decimal',
  objectId: 'schema-type--objectid',
  date: 'schema-type--date',
  boolean: 'schema-type--boolean',
  array: 'schema-type--array',
  object: 'schema-type--object',
  null: 'schema-type--null',
  undefined: 'schema-type--undefined',
  binData: 'schema-type--bindata',
};

function typeClass(type) {
  return TYPE_CLASS[type] || 'schema-type--other';
}

export function renderFieldRow(field) {
  const path = field.path || '';
  const presence = Math.max(0, Math.min(100, Math.round(field.presence || 0)));
  const types = Array.isArray(field.types) ? field.types : [];
  const samples = Array.isArray(field.samples) ? field.samples : [];
  const optional = presence < 100;

  const segments = path.split('.');
  const depth = segments.length - 1;
  const leaf = segments[segments.length - 1];
  const parentPrefix = depth > 0 ? segments.slice(0, -1).join('.') + '.' : '';

  const typeSegs = types.map((t) =>
    `<span class="schema-type-seg ${typeClass(t.type)}" data-pct="${escapeHtml(t.percent)}" title="${escapeHtml(String(t.type))} — ${escapeHtml(t.percent)}%"></span>`
  ).join('');

  const typeChips = types.map((t) =>
    `<span class="schema-type-chip ${typeClass(t.type)}">
       <span class="schema-type-dot"></span>${escapeHtml(String(t.type))}
       <span class="schema-type-pct">${escapeHtml(t.percent)}%</span>
     </span>`
  ).join('');

  const samplesHtml = samples.length
    ? `<div class="schema-samples">${samples.map((s) => `<code class="schema-sample-val" title="${escapeHtml(String(s))}">${escapeHtml(String(s))}</code>`).join('')}</div>`
    : '';

  return `
    <div class="schema-field-row">
      <div class="schema-field-main">
        <span class="schema-field-path" data-depth="${depth}">${parentPrefix ? `<span class="schema-field-parent">${escapeHtml(parentPrefix)}</span>` : ''}<span class="schema-field-leaf">${escapeHtml(leaf)}</span></span>
        <div class="schema-presence" title="${presence}% of sampled documents contain this field">
          <div class="schema-presence-track">
            <div class="schema-presence-fill${optional ? ' schema-presence-fill--optional' : ''}" data-pct="${presence}"></div>
          </div>
          <span class="schema-presence-label">${presence}%</span>
          ${optional ? '<span class="schema-optional-badge">optional</span>' : ''}
        </div>
      </div>
      <div class="schema-type-bar">${typeSegs}</div>
      <div class="schema-type-chips">${typeChips}</div>
      ${samplesHtml}
    </div>
  `;
}
