# PLAN.md — Auto-Updates & Automated Releases

## Problem

Every release requires manually:
1. Bumping the version in `package.json`
2. Running `build:win` and `build:linux` locally
3. Uploading `.exe`, `.AppImage`, and `.deb` to GitHub Releases
4. Users have no way to know a new version exists — they must check GitHub themselves

## Goal

- Users get notified of updates and can install them from within the app
- Pushing a version tag (e.g. `v1.1.0`) to GitHub automatically builds all platforms and publishes a release — zero manual work

---

## Phase 1: Automated Builds with GitHub Actions (Manual Setup)

**Status:** TODO — set up manually

**What:** A GitHub Actions workflow that triggers on version tags, builds for Windows and Linux, and publishes everything to a GitHub Release automatically.

**File to create:** `.github/workflows/release.yml`

### Step-by-step

1. Create the workflow directory and file:
   ```bash
   mkdir -p .github/workflows
   ```

2. Create `.github/workflows/release.yml` with the following content:
   ```yaml
   name: Release

   on:
     push:
       tags:
         - 'v*'

   permissions:
     contents: write

   jobs:
     build-linux:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: npm ci
         - run: npm run build:linux
           env:
             GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

     build-windows:
       runs-on: windows-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: npm ci
         - run: npm run build:win
           env:
             GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

3. The `publish` config is already in `package.json`:
   ```json
   "publish": {
     "provider": "github",
     "owner": "AldinKajmovic",
     "repo": "mongoaio"
   }
   ```

4. `electron-builder` will automatically create/update a GitHub Release draft and upload all artifacts when `GH_TOKEN` is set.

### How to use it

```bash
# Bump version (updates package.json + creates git tag)
npm version patch   # 1.0.0 -> 1.0.1 (bug fixes)
npm version minor   # 1.0.0 -> 1.1.0 (new features)
npm version major   # 1.0.0 -> 2.0.0 (breaking changes)

# Push commit and tag — GitHub Actions builds + publishes automatically
git push origin master --tags
```

### What happens

1. Tag push triggers the workflow
2. Two parallel jobs run: Ubuntu builds `.deb` + `.AppImage`, Windows builds `.exe` (NSIS + portable)
3. `electron-builder` uploads all artifacts to a GitHub Release draft
4. You go to GitHub Releases, review, and click Publish (or edit the workflow to auto-publish by adding `releaseType: release` to the publish config)

### Important notes

- No secrets to configure — `GITHUB_TOKEN` is provided automatically by GitHub Actions
- No Wine needed — Windows builds run on a real Windows runner
- If a build fails, check the Actions tab on GitHub for logs

---

## Phase 2: In-App Auto-Updates

**Status:** DONE

### What was implemented

The app checks GitHub Releases for new versions on startup and shows a non-intrusive banner when an update is available.

### Files created/modified

| File | Change |
|------|--------|
| `src/main/updater.js` | **New** — main process updater logic (check, download, install via `electron-updater`) |
| `src/renderer/utils/updater.js` | **New** — renderer UI (update banner with Download / Restart buttons) |
| `styles/components/updater.css` | **New** — banner styling |
| `main.js` | Added `initUpdater(mainWindow)` call |
| `preload.js` | Added `getVersion`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, and event listeners |
| `src/renderer/renderer.js` | Added `initUpdater()` import and call |
| `src/renderer/components/connection-panel.js` | Added version label (`vX.X.X`) at bottom of panel |
| `styles/main.css` | Added `updater.css` import |
| `package.json` | Added `electron-updater` dependency and `publish` config |

### How it works

1. App launches, waits 5 seconds, then checks GitHub Releases API
2. If a newer version exists, a blue banner appears at the top: **"Version X.X.X is available"** with Download / Dismiss buttons
3. User clicks Download — progress shown in the banner
4. When done: **"Update downloaded — restart to install"** with Restart Now / Later buttons
5. Restart Now calls `autoUpdater.quitAndInstall()` — app restarts with the new version

### Platform support

| Platform | Auto-update |
|----------|-------------|
| Windows (NSIS installer) | Full auto-update (download + install + restart) |
| Linux (AppImage) | Full auto-update (replaces AppImage in place) |
| Linux (.deb) | Notification only — user must download new `.deb` manually |
| Windows (portable) | Notification only — user must download manually |

### Version display

The current version (`vX.X.X`) is shown at the bottom of the connection panel, read from `app.getVersion()` via IPC.

---

## Phase 3: Version Management

**Status:** Ready to use (no code changes needed)

### Release workflow

```bash
# 1. Bump version
npm version patch   # bug fix:     1.0.0 -> 1.0.1
npm version minor   # new feature: 1.0.0 -> 1.1.0
npm version major   # breaking:    1.0.0 -> 2.0.0

# 2. Push — GitHub Actions does the rest (once Phase 1 workflow is set up)
git push origin master --tags
```

### Manual release (before Phase 1 is set up)

```bash
# 1. Bump version
npm version patch

# 2. Build locally
npm run build:linux
npm run build:win    # requires Wine on Linux

# 3. Push code
git push origin master --tags

# 4. Upload dist/ artifacts to the GitHub Release that npm version created
```

---

## Notes

- **Code signing (optional, future):** Windows shows a SmartScreen warning for unsigned apps. A code signing certificate ($200-400/yr) removes this. Not required for functionality.
- **macOS (future):** Add a `build-macos` job on `macos-latest` runner. Requires Apple Developer account for signing.
- **Rate limits:** `electron-updater` uses GitHub's public releases API — 60 req/hr unauthenticated, 5000 authenticated. More than enough.
- **Rollback:** Delete/unpublish the GitHub Release. Users who haven't updated stay on their current version.
- **Testing updates locally:** Set `autoUpdater.forceDevUpdateConfig = true` and create a `dev-app-update.yml` file pointing to your repo. Or just test in a packaged build.
