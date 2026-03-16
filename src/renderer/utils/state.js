import { DEFAULT_PAGE_SIZE, TOAST_DURATION_MS } from './constants.js';

window.onerror = function (message, source, lineno, colno, error) {
  console.error("GLOBAL ERROR:", message, source, lineno, colno, error);
  try {
    const el = document.createElement('div');
    el.className = 'toast error';
    el.textContent = `JS Error: ${message} at line ${lineno}`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), TOAST_DURATION_MS);
  } catch (e) { }
};

export const state = {
  connected: false,
  sourceUrl: '',
  targetUrl: '',
  currentSourceDb: null,
  currentTargetDb: null,
  currentColl: null,
  dbComparison: null,
  collComparison: null,
  docComparison: null,
  activeDocTab: 'different',
  collSearchQuery: '',
  fieldSearchQuery: '',
  fieldFilter: 'all',
  currentPage: 1,
  currentLimit: DEFAULT_PAGE_SIZE,
  dbFilter: 'all',
  collFilter: 'all',
  editor: {
    side: 'source',
    alias: null,
    db: null,
    coll: null,
    query: {},
    sort: {},
    projection: {},
    limit: DEFAULT_PAGE_SIZE,
    skip: 0,
    selectedField: null,
    selectedDocIndex: null
  }
};

// DOM helpers
// Instead of document.querySelector('.class'), you can type $('.class')
export const $ = (className) => document.querySelector(className);
export const $$ = (className) => document.querySelectorAll(className);

export const elements = {
  get connectionPanel() { return $('#connection-panel'); },
  get appHeader() { return $('#app-header'); },
  get mainContent() { return $('#main-content'); },
  get urlSource() { return $('#url-source'); },
  get urlTarget() { return $('#url-target'); },
  get btnConnect() { return $('#btn-connect'); },
  get btnEditor() { return $('#btn-db-editor'); },
  get btnDisconnect() { return $('#btn-disconnect'); },
  get connectionStatus() { return $('#connection-status'); },
  get breadcrumb() { return $('#breadcrumb'); },
  get sourceUrlLabel() { return $('#source-url-label'); },
  get targetUrlLabel() { return $('#target-url-label'); },

  get dbView() { return $('#database-view'); },
  get dbStats() { return $('#db-stats'); },
  get sourceDbList() { return $('#source-db-list'); },
  get targetDbList() { return $('#target-db-list'); },

  get collView() { return $('#collection-view'); },
  get collDbName() { return $('#coll-db-name'); },
  get collStats() { return $('#coll-stats'); },
  get sourceCollList() { return $('#source-coll-list'); },
  get targetCollList() { return $('#target-coll-list'); },

  get docView() { return $('#document-view'); },
  get docCollName() { return $('#doc-coll-name'); },
  get docStats() { return $('#doc-stats'); },
  get docContent() { return $('#doc-content'); },


  // DB Editor elements
  get editorView() { return $('#db-editor-view'); },
  get editorQueryFilter() { return $('#editor-query-filter'); },
  get editorQuerySort() { return $('#editor-query-sort'); },
  get editorQueryProjection() { return $('#editor-query-projection'); },
  get editorQueryLimit() { return $('#editor-query-limit'); },
  get editorQuerySkip() { return $('#editor-query-skip'); },
  get btnEditorRunQuery() { return $('#btn-editor-run-query'); },
  get btnEditorSortAsc() { return $('#btn-editor-sort-asc'); },
  get btnEditorSortDesc() { return $('#btn-editor-sort-desc'); },
  get btnEditorRefresh() { return $('#btn-editor-refresh'); },
  get btnEditorFirst() { return $('#btn-editor-first'); },
  get btnEditorPrev() { return $('#btn-editor-prev'); },
  get btnEditorNext() { return $('#btn-editor-next'); },
  get btnEditorLast() { return $('#btn-editor-last'); },
  get editorPageSizeSelect() { return $('#editor-page-size-select'); },
  get editorPaginationInfo() { return $('#editor-pagination-info'); },
  get editorTree() { return $('#editor-tree'); },
  get editorSideSelect() { return $('#editor-side-select'); },
  get btnEditorTreeRefresh() { return $('#btn-editor-tree-refresh'); },
  get editorBreadcrumb() { return $('#editor-breadcrumb'); },
  get editorTreeSearch() { return $('#editor-tree-search'); },
  get btnEditorAddDoc() { return $('#btn-editor-add-doc'); },
  get btnEditorSearchLocal() { return $('#btn-editor-search-local'); },
  get btnImportConnections() { return $('#btn-import-connections'); },

  get btnEditorViewCollections() { return $('#btn-editor-view-collections'); },
  get btnEditorViewShell() { return $('#btn-editor-view-shell'); },

  get editorViewCollectionsContent() { return $('#editor-view-collections-content'); },
  get editorViewShellContent() { return $('#editor-view-shell-content'); },

  get editorShellTextarea() { return $('#editor-shell-textarea'); },
  get btnShellRunLine() { return $('#btn-shell-run-line'); },
  get btnShellRunAll() { return $('#btn-shell-run-all'); },
  get shellJsonError() { return $('#shell-json-error'); },
  get editorShellResults() { return $('#editor-shell-results'); },
  get shellActiveTarget() { return $('#shell-active-target'); },

  get loadingOverlay() { return $('#loading-overlay'); },
  get loadingText() { return $('#loading-text'); },

  get modalOverlay() { return $('#modal-overlay'); },
  get modalTitle() { return $('#modal-title'); },
  get modalEditor() { return $('#modal-editor'); },
  get modalSyncList() { return $('#modal-sync-list'); },
  get modalError() { return $('#modal-error'); },
  get modalClose() { return $('#modal-close'); },
  get modalCancel() { return $('#modal-cancel'); },
  get modalConfirm() { return $('#modal-confirm'); },

  get insertDocOverlay() { return $('#insert-doc-overlay'); },
  get insertDocTitle() { return $('#insert-doc-title'); },
  get insertDocEditor() { return $('#insert-doc-editor'); },
  get insertDocLineNumbers() { return $('#insert-doc-line-numbers'); },
  get insertDocError() { return $('#insert-doc-error'); },
  get insertDocClose() { return $('#insert-doc-close'); },
  get insertDocMinimize() { return $('#insert-doc-minimize'); },
  get insertDocValidate() { return $('#insert-doc-validate'); },
  get insertDocFormat() { return $('#insert-doc-format'); },
  get insertDocWordwrap() { return $('#insert-doc-wordwrap'); },
  get insertDocAddContinue() { return $('#insert-doc-add-continue'); },
  get insertDocCancel() { return $('#insert-doc-cancel'); },
  get insertDocAdd() { return $('#insert-doc-add'); },

  get confirmOverlay() { return $('#confirm-overlay'); },
  get confirmTitle() { return $('#confirm-title'); },
  get confirmMessage() { return $('#confirm-message'); },
  get confirmClose() { return $('#confirm-close'); },
  get confirmCancel() { return $('#confirm-cancel'); },
  get confirmOk() { return $('#confirm-ok'); },

  get toastContainer() { return $('#toast-container'); },
  get collSearch() { return $('#coll-search'); },
  get fieldSearch() { return $('#field-search'); },

  get paginationFooter() { return $('#pagination-footer'); },
  get paginationInfo() { return $('#pagination-info'); },
  get prevBtn() { return $('#prev-btn'); },
  get nextBtn() { return $('#next-btn'); },
  get pageNumbers() { return $('#page-numbers'); },
  get limitSelect() { return $('#limit-select'); },

  get deleteDocsOverlay() { return $('#delete-docs-overlay'); },
  get deleteDocsEditor() { return $('#delete-docs-editor'); },
  get deleteDocsLineNumbers() { return $('#delete-docs-line-numbers'); },
  get deleteDocsError() { return $('#delete-docs-error'); },
  get deleteDocsConfirm() { return $('#delete-docs-confirm'); },
  get deleteDocsCancel() { return $('#delete-docs-cancel'); },
  get deleteDocsClose() { return $('#delete-docs-close'); },
  get deleteDocsValidate() { return $('#delete-docs-validate'); },
  get deleteDocsPredefined() { return $('#delete-docs-predefined'); },
  get deleteDocsHistory() { return $('#delete-docs-history'); },

  // Connection UI
  get selectSourceSaved() { return $('#select-source-saved'); },
  get selectTargetSaved() { return $('#select-target-saved'); },
  get newConnAlias() { return $('#new-conn-alias'); },
  get newConnUrl() { return $('#new-conn-url'); },
  get btnSaveConn() { return $('#btn-save-conn'); },

  // Add DB modal
  get addDbOverlay() { return $('#add-db-overlay'); },
  get addDbName() { return $('#add-db-name'); },
  get addDbError() { return $('#add-db-error'); },
  get addDbConfirm() { return $('#add-db-confirm'); },
  get addDbCancel() { return $('#add-db-cancel'); },
  get addDbClose() { return $('#add-db-close'); }
};
