import { $ } from '../utils/state.js';

export function initMainContent() {
  const container = $('#database-view-container');
  if (!container) return;

  // DB View
  container.innerHTML = `
    <div id="database-view" class="comparison-view">
      <div id="db-stats" class="stats-bar"></div>
      <div class="comparison-columns">
        <div class="column">
          <div class="column-header"><span class="source-header">Source Databases</span></div>
          <div id="source-db-list" class="items-list"></div>
        </div>
        <div class="column-divider"><div class="divider-line"></div></div>
        <div class="column">
          <div class="column-header"><span class="target-header">Target Databases</span></div>
          <div id="target-db-list" class="items-list"></div>
        </div>
      </div>
      <div id="cross-compare-banner" class="cross-compare-banner">
        <span>Compare <strong id="cc-source-name"></strong> vs <strong id="cc-target-name"></strong></span>
        <button id="btn-cross-compare" class="btn btn-primary btn-sm">Compare</button>
      </div>
    </div>
  `;

  // Coll View
  const collContainer = $('#collection-view-container');
  collContainer.innerHTML = `
    <div id="collection-view" class="comparison-view">
      <div class="view-header-bar">
        <strong id="coll-db-name"></strong>
        <input type="text" id="coll-search" placeholder="Search collections..." class="search-input">
      </div>
      <div id="coll-stats" class="stats-bar"></div>
      <div class="comparison-columns">
        <div class="column">
          <div class="column-header"><span class="source-header">Source Collections</span></div>
          <div id="source-coll-list" class="items-list"></div>
        </div>
        <div class="column-divider"><div class="divider-line"></div></div>
        <div class="column">
          <div class="column-header"><span class="target-header">Target Collections</span></div>
          <div id="target-coll-list" class="items-list"></div>
        </div>
      </div>
    </div>
  `;

  // Doc View
  const docContainer = $('#document-view-container');
  docContainer.innerHTML = `
    <div id="document-view" class="comparison-view">
      <div class="view-header-bar">
        <strong id="doc-coll-name"></strong>
        <div class="u-flex u-gap-8 u-items-center">
          <input type="text" id="field-search" placeholder="Search fields..." class="search-input">
          <select id="limit-select" class="saved-conn-select u-w-auto">
            <option value="10" selected>10 per page</option><option value="25">25</option><option value="50">50</option><option value="100">100</option>
          </select>
        </div>
      </div>
      <div id="doc-stats" class="stats-bar"></div>

      <div id="doc-content" class="doc-content"></div>
      <div id="pagination-footer" class="pagination-footer">
        <span id="pagination-info"></span>
        <div class="pagination-controls">
          <button id="prev-btn" class="btn btn-ghost btn-sm">Previous</button>
          <div id="page-numbers" class="page-numbers"></div>
          <button id="next-btn" class="btn btn-ghost btn-sm">Next</button>
        </div>
      </div>
    </div>
  `;
}
