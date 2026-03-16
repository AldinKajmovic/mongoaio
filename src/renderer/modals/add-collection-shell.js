import { $ } from '../utils/state.js';

export function initAddCollectionShell() {
  const container = $('#modals-container');
  if (!container) return;

  container.insertAdjacentHTML('beforeend', `
    <div id="add-coll-overlay" class="modal-overlay">
      <div class="modal glass-panel add-coll-modal">
        <div class="modal-header">
          <h3>Add New Collection</h3>
          <div class="modal-header-actions">
            <button id="add-coll-minimize" class="btn btn-ghost btn-icon btn-sm" title="Minimize">&#9723;</button>
            <button id="add-coll-close" class="btn btn-ghost btn-icon btn-sm" title="Close">&#10005;</button>
          </div>
        </div>
        <div class="add-coll-context-bar" id="add-coll-context"></div>
        <div class="add-coll-name-row">
          <label>Collection Name:</label>
          <input type="text" id="add-coll-name" autocomplete="off">
        </div>
        <div class="add-coll-tabs" id="add-coll-tabs">
          <button class="add-coll-tab active" data-tab="options">Options</button>
          <button class="add-coll-tab" data-tab="storage">Storage Engine</button>
          <button class="add-coll-tab" data-tab="validator">Validator</button>
          <button class="add-coll-tab" data-tab="collation">Collation</button>
        </div>
        <div class="add-coll-body">
          ${optionsPanel()}
          ${storagePanel()}
          ${validatorPanel()}
          ${collationPanel()}
        </div>
        <p id="add-coll-error" class="modal-error"></p>
        <div class="modal-footer">
          <button id="add-coll-validate-json" class="btn btn-ghost btn-sm u-mr-auto" hidden>Validate JSON</button>
          <button id="add-coll-cancel" class="btn btn-ghost">Cancel</button>
          <button id="add-coll-create" class="btn btn-success" disabled>Create</button>
        </div>
      </div>
    </div>
  `);
}

function optionsPanel() {
  return `
    <div class="add-coll-panel" id="add-coll-panel-options">
      <label class="add-coll-radio">
        <input type="radio" name="add-coll-type" value="default" checked>
        <span>Create default collection</span>
      </label>
      <label class="add-coll-radio">
        <input type="radio" name="add-coll-type" value="capped">
        <span>Create capped collection</span>
      </label>
      <div class="add-coll-section" id="add-coll-capped-fields" hidden>
        <div class="add-coll-form-row">
          <label>Maximum size in bytes:</label>
          <input type="number" id="add-coll-capped-size" min="1">
        </div>
        <div class="add-coll-form-row">
          <label>Maximum number of documents:</label>
          <input type="number" id="add-coll-capped-max" min="0">
        </div>
      </div>
      <label class="add-coll-radio">
        <input type="radio" name="add-coll-type" value="timeseries">
        <span>Create Time Series collection</span>
      </label>
      <div class="add-coll-section" id="add-coll-ts-fields" hidden>
        <div class="add-coll-form-row">
          <label>Time Field:</label>
          <input type="text" id="add-coll-ts-timefield">
        </div>
        <div class="add-coll-form-row">
          <label>Meta Field:</label>
          <input type="text" id="add-coll-ts-metafield" placeholder="Optional">
        </div>
        <div class="add-coll-form-row">
          <label>Granularity:</label>
          <select id="add-coll-ts-granularity" class="add-coll-select">
            <option value="seconds">seconds</option>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
          </select>
        </div>
        <div class="add-coll-form-row">
          <label>Expire After Seconds:</label>
          <input type="number" id="add-coll-ts-expire" placeholder="Optional" min="0">
        </div>
      </div>
      <label class="add-coll-radio">
        <input type="radio" name="add-coll-type" value="clustered">
        <span>Create clustered collection</span>
      </label>
      <div class="add-coll-section" id="add-coll-clustered-fields" hidden>
        <div class="add-coll-form-row">
          <label>Index Name:</label>
          <div class="add-coll-input-with-info">
            <input type="text" id="add-coll-clustered-name" placeholder="Optional">
            <span class="add-coll-info-icon" title="Name for the clustered index. Defaults to collection name if empty.">&#9432;</span>
          </div>
        </div>
      </div>
    </div>`;
}

function storagePanel() {
  return `
    <div class="add-coll-panel" id="add-coll-panel-storage" hidden>
      <p class="add-coll-hint">Enter the configuration to the storage engine:</p>
      <div class="insert-doc-editor-wrap">
        <div id="add-coll-storage-lines" class="insert-doc-line-numbers">1\n2</div>
        <textarea id="add-coll-storage-editor" class="insert-doc-textarea" spellcheck="false">{\n}</textarea>
      </div>
    </div>`;
}

function validatorPanel() {
  return `
    <div class="add-coll-panel" id="add-coll-panel-validator" hidden>
      <div class="add-coll-validator-header">
        <div class="add-coll-form-row-inline">
          <label>Validation Level:</label>
          <select id="add-coll-validation-level" class="add-coll-select">
            <option value="strict">strict</option>
            <option value="moderate">moderate</option>
            <option value="off">off</option>
          </select>
        </div>
        <div class="add-coll-form-row-inline">
          <label>Validation Action:</label>
          <select id="add-coll-validation-action" class="add-coll-select">
            <option value="error">error</option>
            <option value="warn">warn</option>
          </select>
        </div>
      </div>
      <p class="add-coll-hint">Enter the validator document for this collection:</p>
      <div class="insert-doc-editor-wrap">
        <div id="add-coll-validator-lines" class="insert-doc-line-numbers">1\n2</div>
        <textarea id="add-coll-validator-editor" class="insert-doc-textarea" spellcheck="false">{\n}</textarea>
      </div>
    </div>`;
}

function collationPanel() {
  return `
    <div class="add-coll-panel" id="add-coll-panel-collation" hidden>
      <p class="add-coll-hint u-mb-8">Use custom collation</p>
      ${collationRow('Locale:', 'add-coll-col-locale', localeOptions())}
      ${collationRow('Strength:', 'add-coll-col-strength', notSetPlus(['1 - Primary', '2 - Secondary', '3 - Tertiary', '4 - Quaternary', '5 - Identical']))}
      ${collationRow('Use Case-Level:', 'add-coll-col-caselevel', notSetPlus(['true', 'false']))}
      ${collationRow('Case-First:', 'add-coll-col-casefirst', notSetPlus(['upper', 'lower', 'off']))}
      ${collationRow('Numeric Ordering:', 'add-coll-col-numeric', notSetPlus(['true', 'false']))}
      ${collationRow('Alternate:', 'add-coll-col-alternate', notSetPlus(['non-ignorable', 'shifted']))}
      ${collationRow('Max-Variable:', 'add-coll-col-maxvar', notSetPlus(['punct', 'space']))}
      ${collationRow('Backwards:', 'add-coll-col-backwards', notSetPlus(['true', 'false']))}
      ${collationRow('Normalization:', 'add-coll-col-normalization', notSetPlus(['true', 'false']))}
    </div>`;
}

function collationRow(label, id, optionsHtml) {
  return `<div class="add-coll-form-row"><label>${label}</label><select id="${id}" class="add-coll-select">${optionsHtml}</select></div>`;
}

function notSetPlus(values) {
  return `<option value="">(not set)</option>` + values.map(v => {
    const val = v.split(' - ')[0];
    return `<option value="${val}">${v}</option>`;
  }).join('');
}

function localeOptions() {
  const locales = [
    ['simple', 'simple'], ['af', 'af - Afrikaans'], ['ar', 'ar - Arabic'],
    ['de', 'de - German'], ['en', 'en - English'], ['en_US', 'en_US - English (United States)'],
    ['es', 'es - Spanish'], ['fr', 'fr - French'], ['he', 'he - Hebrew'],
    ['hi', 'hi - Hindi'], ['it', 'it - Italian'], ['ja', 'ja - Japanese'],
    ['ko', 'ko - Korean'], ['nl', 'nl - Dutch'], ['pl', 'pl - Polish'],
    ['pt', 'pt - Portuguese'], ['ro', 'ro - Romanian'], ['ru', 'ru - Russian'],
    ['sv', 'sv - Swedish'], ['tr', 'tr - Turkish'], ['uk', 'uk - Ukrainian'],
    ['zh', 'zh - Chinese'], ['zh_Hant', 'zh_Hant - Chinese (Traditional)'],
  ];
  return locales.map(([val, label]) =>
    `<option value="${val}"${val === 'en_US' ? ' selected' : ''}>${label}</option>`
  ).join('');
}
