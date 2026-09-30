/* =============================================
   Editor — Query Builder Panel
   ============================================= */

import { elements } from '../utils/state.js';
import { runEditorQuery } from './query.js';
import { openModal } from '../modals/base.js';
import {
  getQbItems, createQbItem, duplicateQbItem, removeQbItem, clearQbItems, valueText
} from './qb-state.js';
import { qbBlockHtml } from './qb-block.js';
import { buildAndApplyFilter } from './qb-filter.js';

/**
 * Add a field to the query builder.
 * @param {string} fieldName - dot path from the document root (`a.b.c`)
 * @param {any} value
 * @param {string} type
 */
export function addQbField(fieldName, value = '', type = 'String') {
  createQbItem(fieldName, value, type);
  renderQbFields();
}

/** Render the complex query blocks inside the panel. */
function renderQbFields() {
  const container = document.getElementById('editor-qb-fields');
  if (!container) return;
  container.innerHTML = '';

  for (const item of getQbItems()) {
    const block = document.createElement('div');
    block.className = 'editor-qb-block';
    if (!item.enabled) block.classList.add('disabled');
    block.innerHTML = qbBlockHtml(item);
    wireBlock(block, item);
    container.appendChild(block);
  }
}

/** Attach the listeners that keep one block's item in sync with its inputs. */
function wireBlock(block, item) {
  block.querySelector('.editor-qb-type-select').addEventListener('change', (e) => {
    item.type = e.target.value;
  });
  block.querySelector('.editor-qb-op-select').addEventListener('change', (e) => {
    item.op = e.target.value;
  });
  block.querySelector('.editor-qb-value-input').addEventListener('input', (e) => {
    item.value = e.target.value;
  });
  block.querySelector('.editor-qb-enabled-toggle').addEventListener('change', (e) => {
    item.enabled = e.target.checked;
    block.classList.toggle('disabled', !item.enabled);
  });

  const fieldInput = block.querySelector('.editor-qb-field-input');
  fieldInput.addEventListener('input', (e) => {
    item.field = e.target.value.trim();
    fieldInput.title = item.field;
  });

  const anyBtn = block.querySelector('.editor-qb-btn-any');
  if (anyBtn) {
    anyBtn.addEventListener('click', () => {
      item.field = item.field.split('.').filter(seg => !/^\d+$/.test(seg)).join('.');
      renderQbFields();
    });
  }

  block.querySelector('.editor-qb-btn-duplicate').addEventListener('click', () => {
    duplicateQbItem(item.id);
    renderQbFields();
  });
  block.querySelector('.editor-qb-btn-remove').addEventListener('click', () => {
    removeQbItem(item.id);
    renderQbFields();
  });
  block.querySelector('.editor-qb-btn-more').addEventListener('click', () => {
    openModal(`Edit Value: ${item.field || '(no field)'}`, valueText(item.value), (newValue) => {
      item.value = newValue;
      renderQbFields();
    });
  });
}

/** Initialise query builder event listeners. */
export function initQueryBuilder() {
  const dropzone = document.getElementById('editor-qb-dropzone');
  const btnClear = document.getElementById('btn-qb-clear');
  const btnRun = document.getElementById('btn-qb-run');

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');

      const json = e.dataTransfer.getData('application/json');
      if (json) {
        const payload = JSON.parse(json);
        addQbField(payload.field, payload.value, payload.type);
      } else {
        const fieldName = e.dataTransfer.getData('text/plain');
        if (fieldName) addQbField(fieldName);
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      clearQbItems();
      renderQbFields();
      elements.editorQueryFilter.value = '{}';
    });
  }

  if (btnRun) {
    btnRun.addEventListener('click', () => {
      buildAndApplyFilter();
      elements.editorQuerySkip.value = 0;
      runEditorQuery();
    });
  }
}
