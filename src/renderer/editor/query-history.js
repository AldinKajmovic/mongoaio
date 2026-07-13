
import { state, elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import { openPopover as sharedOpenPopover, closePopover as sharedClosePopover } from '../utils/popover.js';
import { runEditorQuery } from './query.js';

const HIST_KEY = 'mongoaio.queryHistory';
const SAVED_KEY = 'mongoaio.savedQueries';
const HIST_CAP = 50;

let popover = null;

/* ----------------------------- persistence ------------------------------ */

function load(key) {
  try {
    const arr = JSON.parse(localStorage.getItem(key));
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function store(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (_) { /* quota / disabled storage — best effort */ }
}

/** Signature of a query entry, used for dedupe/equality. */
function sig(e) {
  return [e.filter, e.sort, e.projection, e.limit, e.skip, e.db, e.coll].join('');
}

/** Snapshot the current query bar + selected collection. */
function captureCurrent() {
  return {
    filter: (elements.editorQueryFilter?.value ?? '{}').trim() || '{}',
    sort: (elements.editorQuerySort?.value ?? '{}').trim() || '{}',
    projection: (elements.editorQueryProjection?.value ?? '{}').trim() || '{}',
    limit: elements.editorQueryLimit?.value ?? '',
    skip: elements.editorQuerySkip?.value ?? '',
    db: state.editor.db || '',
    coll: state.editor.coll || '',
    ts: Date.now(),
  };
}

/** Record a run into history (dedupe consecutive identical, newest first). */
function recordRun() {
  const entry = captureCurrent();
  // A run without a selected collection is a no-op query — don't record it.
  if (!entry.db || !entry.coll) return;

  const hist = load(HIST_KEY);
  if (hist.length && sig(hist[0]) === sig(entry)) {
    hist[0].ts = entry.ts; // refresh timestamp, keep single entry
  } else {
    hist.unshift(entry);
  }
  store(HIST_KEY, hist.slice(0, HIST_CAP));
}

/* ------------------------------- applying -------------------------------- */

/** Load an entry's values into the query bar and run it. */
function applyEntry(entry) {
  if (elements.editorQueryFilter) elements.editorQueryFilter.value = entry.filter ?? '{}';
  if (elements.editorQuerySort) elements.editorQuerySort.value = entry.sort ?? '{}';
  if (elements.editorQueryProjection) elements.editorQueryProjection.value = entry.projection ?? '{}';
  if (elements.editorQueryLimit) elements.editorQueryLimit.value = entry.limit ?? '10';
  if (elements.editorQuerySkip) elements.editorQuerySkip.value = entry.skip ?? '0';
  closePopover();
  runEditorQuery();
}

/* ------------------------------- popover --------------------------------- */

function makeIconButton(cls, title, svg) {
  const b = document.createElement('button');
  b.className = cls;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = svg; // static, trusted SVG markup only
  return b;
}

const SVG_STAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
const SVG_X = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

/** Build one list row for a query entry. */
function buildItem(entry, kind, index) {
  const row = document.createElement('div');
  row.className = 'qh-item';

  const main = document.createElement('button');
  main.className = 'qh-item-main';
  main.type = 'button';

  if (kind === 'saved' && entry.name) {
    const name = document.createElement('span');
    name.className = 'qh-item-name';
    name.textContent = entry.name;
    main.appendChild(name);
  }

  const meta = document.createElement('span');
  meta.className = 'qh-item-coll';
  meta.textContent = entry.coll ? `${entry.db}.${entry.coll}` : '(no collection)';
  main.appendChild(meta);

  const filter = document.createElement('span');
  filter.className = 'qh-item-filter';
  filter.textContent = entry.filter || '{}';
  main.appendChild(filter);

  main.title = `filter: ${entry.filter}\nsort: ${entry.sort}\nprojection: ${entry.projection}\nlimit: ${entry.limit}  skip: ${entry.skip}`;
  main.addEventListener('click', () => applyEntry(entry));
  row.appendChild(main);

  const actions = document.createElement('div');
  actions.className = 'qh-item-actions';

  if (kind === 'recent') {
    const starBtn = makeIconButton('qh-item-btn qh-item-save', 'Save this query', SVG_STAR);
    starBtn.addEventListener('click', (e) => { e.stopPropagation(); promptSave(entry); });
    actions.appendChild(starBtn);
  }

  const delBtn = makeIconButton('qh-item-btn qh-item-del', 'Remove', SVG_X);
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = kind === 'saved' ? SAVED_KEY : HIST_KEY;
    const arr = load(key);
    arr.splice(index, 1);
    store(key, arr);
    renderBody();
  });
  actions.appendChild(delBtn);

  row.appendChild(actions);
  return row;
}

function buildSection(titleText, entries, kind) {
  const section = document.createElement('div');
  section.className = 'qh-section';

  const title = document.createElement('div');
  title.className = 'qh-section-title';
  title.textContent = titleText;
  section.appendChild(title);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'qh-empty';
    empty.textContent = kind === 'saved' ? 'No saved queries yet.' : 'No recent queries.';
    section.appendChild(empty);
  } else {
    entries.forEach((entry, i) => section.appendChild(buildItem(entry, kind, i)));
  }
  return section;
}

/** (Re)render only the list body of the open popover. */
function renderBody() {
  if (!popover) return;
  const body = popover.querySelector('.qh-body');
  if (!body) return;
  body.innerHTML = '';
  body.appendChild(buildSection('Saved', load(SAVED_KEY), 'saved'));
  body.appendChild(buildSection('Recent', load(HIST_KEY), 'recent'));
}

/** Show an inline name field and store the given (or current) query as saved. */
function promptSave(sourceEntry) {
  if (!popover) return;
  const holder = popover.querySelector('.qh-save-holder');
  if (!holder || holder.querySelector('input')) return;

  const entry = sourceEntry || captureCurrent();
  if (!entry.db || !entry.coll) {
    toast('Select a collection before saving a query', 'warning');
    return;
  }

  holder.innerHTML = '';
  const form = document.createElement('div');
  form.className = 'qh-save-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'qh-save-input';
  input.placeholder = 'Name this query';

  const ok = document.createElement('button');
  ok.className = 'btn btn-primary btn-sm';
  ok.textContent = 'Save';

  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost btn-sm';
  cancel.textContent = 'Cancel';

  form.appendChild(input);
  form.appendChild(ok);
  form.appendChild(cancel);
  holder.appendChild(form);
  input.focus();

  const reset = () => { holder.innerHTML = ''; buildSaveButton(holder); };
  const commit = () => {
    const name = input.value.trim();
    if (!name) { toast('Please enter a name', 'warning'); input.focus(); return; }
    const saved = load(SAVED_KEY);
    saved.unshift({ ...entry, name, ts: Date.now() });
    store(SAVED_KEY, saved);
    toast('Query saved', 'success');
    reset();
    renderBody();
  };

  ok.addEventListener('click', commit);
  cancel.addEventListener('click', reset);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); reset(); }
  });
}

function buildSaveButton(holder) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm qh-save-current';
  btn.textContent = '+ Save current query';
  btn.addEventListener('click', () => promptSave(null));
  holder.appendChild(btn);
}

// Build the popover element (not yet mounted); the shared helper mounts and
// positions it and manages outside-click / Escape dismissal.
function buildPopover() {
  const pop = document.createElement('div');
  pop.className = 'qh-popover';

  const header = document.createElement('div');
  header.className = 'qh-header';

  const title = document.createElement('span');
  title.className = 'qh-title';
  title.textContent = 'Query History';
  header.appendChild(title);

  const clear = document.createElement('button');
  clear.className = 'btn btn-ghost btn-sm qh-clear';
  clear.textContent = 'Clear history';
  clear.addEventListener('click', () => {
    store(HIST_KEY, []);
    renderBody();
  });
  header.appendChild(clear);
  pop.appendChild(header);

  const saveHolder = document.createElement('div');
  saveHolder.className = 'qh-save-holder';
  buildSaveButton(saveHolder);
  pop.appendChild(saveHolder);

  const body = document.createElement('div');
  body.className = 'qh-body';
  pop.appendChild(body);

  return pop;
}

function closePopover() {
  sharedClosePopover();
}

function openPopover(anchor) {
  const pop = buildPopover();
  popover = pop;      // set before renderBody(), which reads `popover`
  renderBody();
  sharedOpenPopover(anchor, pop, {
    className: 'qh-popover',
    align: 'left',
    onClose: () => { popover = null; },
  });
}

/* -------------------------------- init ----------------------------------- */

export function initQueryHistory() {
  // Record runs from both the main Run button and the query-builder Run button.
  // Delegated on document so it fires after each button's own (target-phase)
  // handler — e.g. the query builder writes the filter before this runs.
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-editor-run-query') || e.target.closest('#btn-qb-run')) {
      recordRun();
    }
  });

  const btn = document.getElementById('btn-editor-query-history');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popover) closePopover();
      else openPopover(btn);
    });
  }
}
