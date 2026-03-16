import { $ } from './utils/state.js';

export function initShell() {
  const app = $('#app');
  if (!app) return;

  app.innerHTML = `
    <!-- App Header (shown when connected) -->
    <header id="app-header" class="app-header">
      <div class="header-left">
        <button id="btn-compare-back" class="btn btn-ghost btn-sm" title="Back to Connections"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
        <div class="logo"><h1>MongoAIO</h1></div>
        <div id="connection-status" class="status-badge disconnected">
          <span class="status-dot"></span>
          <span>Disconnected</span>
        </div>
      </div>
      <div class="header-right">
        <span id="source-url-label" class="url-label"></span>
        <span id="target-url-label" class="url-label"></span>
        <button id="btn-disconnect" class="btn btn-ghost btn-sm">Disconnect</button>
      </div>
    </header>

    <!-- Main Comparison Content -->
    <div id="main-content">
      <nav id="breadcrumb" class="breadcrumb"></nav>
      <div id="database-view-container"></div>
      <div id="collection-view-container"></div>
      <div id="document-view-container"></div>
    </div>

    <div id="connection-panel-container"></div>
    <div id="db-editor-view-container"></div>
    <div id="modals-container"></div>
    <div id="toast-container" class="toast-container"></div>
    <div id="loading-overlay-container"></div>
  `;
}
