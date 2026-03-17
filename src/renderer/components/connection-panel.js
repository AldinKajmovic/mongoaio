import { $ } from '../utils/state.js';

export function initConnectionPanel() {
  const container = $('#connection-panel-container');
  if (!container) return;

  container.innerHTML = `
    <div id="connection-panel">
      <div class="glass-panel connection-panel">
        <h2>MongoAIO</h2>
        <p class="subtitle">MongoDB editor with compare & sync feature</p>

        <div class="url-inputs">
          <div class="input-group">
            <label for="url-source">Source Connection URL</label>
            <div class="input-with-select">
              <input type="text" id="url-source" placeholder="mongodb://localhost:27017" spellcheck="false">
              <select id="select-source-saved" class="saved-conn-select">
                <option value="">Saved...</option>
              </select>
            </div>
          </div>

          <div class="input-group">
            <label for="url-target">Target Connection URL</label>
            <div class="input-with-select">
              <input type="text" id="url-target" placeholder="mongodb://localhost:27017" spellcheck="false">
              <select id="select-target-saved" class="saved-conn-select">
                <option value="">Saved...</option>
              </select>
            </div>
          </div>
        </div>

        <div class="actions">
          <button id="btn-connect" class="btn btn-primary btn-lg">Connect & Compare</button>
          <button id="btn-db-editor" class="btn btn-primary btn-lg">DB Editor</button>
        </div>

        <div class="saved-section">
          <h3>Save New Connection</h3>
          <div class="save-form">
            <input type="text" id="new-conn-alias" placeholder="Alias (e.g., Production)">
            <input type="text" id="new-conn-url" placeholder="mongodb://...">
            <button id="btn-save-conn" class="btn btn-secondary">Save</button>
          </div>
        </div>
        
        <div id="connection-list-section" class="saved-section u-mt-20">
          <h3>Saved Connections</h3>
          <div id="connection-list" class="u-flex u-flex-wrap u-gap-8">
            <!-- Populated by JS -->
          </div>
        </div>

        <div id="connection-disclaimer" class="disclaimer-note">
          <p>Use custom MongoDB connection URLs above to access your databases. <br/>Saved connections can be managed and selected from the dropdowns.</p>
        </div>
        <div class="version-label"><span id="app-version"></span></div>
      </div>
    </div>
  `;
}
