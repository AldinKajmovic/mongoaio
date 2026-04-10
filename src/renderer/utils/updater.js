/**
 * Renderer-side auto-update UI.
 * Listens for update events from the main process and shows
 * a non-intrusive banner at the top of the app.
 */

let bannerEl = null;

function createBanner() {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement('div');
  bannerEl.id = 'update-banner';
  bannerEl.className = 'update-banner';
  document.body.prepend(bannerEl);
  return bannerEl;
}

function showBanner(html) {
  const banner = createBanner();
  banner.innerHTML = html;
  banner.style.display = 'flex';
}

function hideBanner() {
  if (bannerEl) bannerEl.style.display = 'none';
}

export function initUpdater() {
  // Show current version in the connection panel
  window.api.getVersion().then(version => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `v${version}`;
  });

  // Update available — show download prompt
  window.api.onUpdateAvailable((data) => {
    showBanner(`
      <span class="update-banner-text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Version ${data.version} is available
      </span>
      <button id="btn-update-download" class="btn btn-sm btn-update">Download</button>
      <button id="btn-update-dismiss" class="btn btn-sm btn-ghost">Dismiss</button>
    `);

    document.getElementById('btn-update-download').addEventListener('click', () => {
      window.api.downloadUpdate();
      showBanner(`
        <span class="update-banner-text">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Downloading update... <span id="update-progress">0%</span>
        </span>
      `);
    });

    document.getElementById('btn-update-dismiss').addEventListener('click', hideBanner);
  });

  // Download progress
  window.api.onUpdateDownloadProgress((data) => {
    const el = document.getElementById('update-progress');
    if (el) el.textContent = `${data.percent}%`;
  });

  // Update error — surface to user so failures aren't silent
  window.api.onUpdateError((data) => {
    console.error('Auto-update error:', data.message);
    showBanner(`
      <span class="update-banner-text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        Update check failed: ${data.message}
      </span>
      <button id="btn-update-error-dismiss" class="btn btn-sm btn-ghost">Dismiss</button>
    `);
    document.getElementById('btn-update-error-dismiss').addEventListener('click', hideBanner);
  });

  // Update downloaded — show install prompt
  window.api.onUpdateDownloaded(() => {
    showBanner(`
      <span class="update-banner-text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Update downloaded — restart to install
      </span>
      <button id="btn-update-install" class="btn btn-sm btn-update">Restart Now</button>
      <button id="btn-update-later" class="btn btn-sm btn-ghost">Later</button>
    `);

    document.getElementById('btn-update-install').addEventListener('click', () => {
      window.api.installUpdate();
    });

    document.getElementById('btn-update-later').addEventListener('click', hideBanner);
  });
}
