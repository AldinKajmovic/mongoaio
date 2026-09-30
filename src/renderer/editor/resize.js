import { queryAllHtml } from '../utils/dom.js';

let editorResizeInited = false;

export function initEditorResizables() {
  if (editorResizeInited) return;
  editorResizeInited = true;

  // --- Panel resize (sidebar & query panel) ---
  setupPanelResize('editor-resize-sidebar', '.editor-sidebar', 'left');
  setupPanelResize('editor-resize-querypanel', '.editor-query-panel', 'right');

  // --- Tree view column resize ---
  setupTreeColumnResize();

  // --- Table view column resize ---
  setupTableColumnResize();
}

function setupPanelResize(handleId, panelSelector, side) {
  const handle = document.getElementById(handleId);
  const panel = document.querySelector(panelSelector);
  if (!handle || !panel) return;

  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.classList.add('active');
    document.body.classList.add('col-resizing');

    const onMouseMove = (e) => {
      const delta = side === 'left' ? e.clientX - startX : startX - e.clientX;
      const newWidth = Math.max(150, Math.min(600, startWidth + delta));
      panel.style.width = newWidth + 'px';
      panel.style.minWidth = newWidth + 'px';
    };

    const onMouseUp = () => {
      handle.classList.remove('active');
      document.body.classList.remove('col-resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function saveColumnWidths(viewType, elements) {
  const widths = Array.from(elements).map(el => el.style.width);
  localStorage.setItem('editor-col-widths-' + viewType, JSON.stringify(widths));
}

function loadColumnWidths(viewType) {
  try {
    const data = localStorage.getItem('editor-col-widths-' + viewType);
    return data ? JSON.parse(data) : null;
  } catch (e) { return null; }
}

function setupTreeColumnResize() {
  const header = document.getElementById('editor-tree-header');
  if (!header) return;

  const cols = queryAllHtml('.editor-data-col', header);
  const handles = queryAllHtml('.col-resize-handle', header);

  // Restore saved widths or use current rendered sizes
  const saved = loadColumnWidths('tree');
  cols.forEach((col, i) => {
    if (saved && saved[i]) {
      col.style.width = saved[i];
    } else {
      col.style.width = col.getBoundingClientRect().width + 'px';
    }
  });
  header.style.gridTemplateColumns = Array.from(cols).map(c => c.style.width).join(' ');
  syncTreeRowColumns(header.style.gridTemplateColumns);

  handles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const colIndex = parseInt(handle.dataset.col);
      const col = cols[colIndex];
      const startX = e.clientX;
      const startWidth = col.getBoundingClientRect().width;
      handle.classList.add('active');
      document.body.classList.add('col-resizing');

      const onMouseMove = (ev) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(60, startWidth + delta);
        col.style.width = newWidth + 'px';
        header.style.gridTemplateColumns = Array.from(cols).map(c => c.style.width || 'auto').join(' ');
        syncTreeRowColumns(header.style.gridTemplateColumns);
      };

      const onMouseUp = () => {
        handle.classList.remove('active');
        document.body.classList.remove('col-resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveColumnWidths('tree', cols);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

/**
 * Point every tree row at the current column template with one write. Rows read
 * it from `--tree-cols` on their container, so a resize drag costs a single
 * property update instead of one inline style per rendered row.
 */
export function syncTreeRowColumns(gridCols) {
  const rows = document.getElementById('editor-tree-rows');
  if (!rows) return;
  if (gridCols) rows.style.setProperty('--tree-cols', gridCols);
  else rows.style.removeProperty('--tree-cols');
}

export function setupTableColumnResize() {
  const table = document.querySelector('.editor-table');
  if (!table) return;

  const ths = queryAllHtml('.editor-table-th', table);

  // Restore saved widths or use current rendered widths
  const saved = loadColumnWidths('table');
  ths.forEach((th, i) => {
    if (saved && saved[i]) {
      th.style.width = saved[i];
      th.style.minWidth = saved[i];
    } else {
      const w = th.getBoundingClientRect().width + 'px';
      th.style.width = w;
      th.style.minWidth = w;
    }
  });

  const handles = queryAllHtml('.col-resize-handle', table);
  handles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const th = /** @type {HTMLElement} */ (handle.closest('.editor-table-th'));
      const startX = e.clientX;
      const startWidth = th.getBoundingClientRect().width;
      handle.classList.add('active');
      document.body.classList.add('col-resizing');

      const onMouseMove = (ev) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(40, startWidth + delta);
        th.style.width = newWidth + 'px';
        th.style.minWidth = newWidth + 'px';
      };

      const onMouseUp = () => {
        handle.classList.remove('active');
        document.body.classList.remove('col-resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveColumnWidths('table', ths);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}
