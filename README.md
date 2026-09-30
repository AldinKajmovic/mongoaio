# MongoAIO

A desktop MongoDB editor with compare & sync, built with Electron.

Connect two MongoDB instances side by side, compare databases, collections and documents, then sync the differences. The built-in DB Editor covers querying, inline editing, aggregation, schema analysis, index management, a mongosh-style shell and a live performance dashboard.

---

## Features

### Compare & Sync
- **Database comparison**: common, source-only and target-only databases and collections at a glance
- **Document diff**: field-by-field visual diffs, with documents matched by `_id` (including ObjectId vs. hex-string forms)
- **Copy & sync**: copy databases, collections or single documents between instances, or sync only the fields you pick. Raw BSON is copied as-is, so types are never lost

### DB Editor
- **Tree sidebar**: browse saved connections, databases and collections; search the tree; copy and paste collections between databases
- **Query bar**: filter, sort, projection, limit and skip, with pagination (10 / 25 / 50 / 100 per page)
- **Visual query builder**: drag fields from results into the builder to write filters
- **Tree, JSON and Table views**: nested documents expand in place, and table cells open a value viewer
- **Staged edits**: tree edits and field removals are staged first, then reviewed and committed in one atomic update per document. If a document changed underneath you, you get a conflict report instead of a silent overwrite. The last applied batch can be undone
- **Type-preserving writes**: edited values keep their stored BSON type, and untouched fields are never rewritten
- **Query history & saved queries**: the last 50 queries are kept, and you can save the ones you reuse
- **Explain**: a summary of the current query's plan plus the raw plan output
- **Query time limit & cancel**: pick a server-side limit per query (15s – 5m, via `maxTimeMS`) and cancel long-running operations
- **Import / Export**: JSON, JSON Lines and CSV, for the current query results or the whole collection. CSV cells are protected against formula injection

### Tools
- **Aggregation**: a stage-by-stage pipeline builder with operator templates, per-stage enable/disable and live preview (Ctrl+Enter runs the whole pipeline)
- **Schema**: samples documents and reports, for each field, how often it appears and which types it holds
- **Indexes**: list, create and drop indexes
- **Shell**: mongosh-style JavaScript against the live driver, with multiple tabs (see below)
- **Performance**: a live dashboard of operations, read/write, network and memory, plus the hottest collections and slowest operations

### App
- **Saved connections**: connection strings are encrypted with the OS keychain (Electron `safeStorage`)
- **Auto-update**: checks GitHub Releases on startup and shows a banner when a new version is out
- **Diagnostics**: renderer errors show up as toasts and go to a rotating log file. Connection strings are redacted from all logs

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (CI builds use Node 24)
- npm
- Optional, for integration tests: `mongod` on your `PATH`, or a disposable instance set in `MONGOAIO_TEST_URI`

---

## Getting Started

```bash
npm install
npm start
```

This opens the connection panel, where you enter MongoDB URIs or pick saved connections.

---

## Usage

### Comparing Databases

1. Enter a **Source** and a **Target** MongoDB connection URI
2. Click **Connect**. Databases from both instances are listed side by side
3. Click a database to compare its collections, then a collection to compare its documents
4. Click the stat pills (common / source only / target only) to filter the view
5. Use the copy/sync buttons to move documents or selected fields between instances

### DB Editor

1. Save a connection (alias + URI) in the connection panel
2. Click **DB Editor** in the top bar
3. Click a connection in the tree sidebar to connect, then browse its databases and collections
4. Select a collection and run a query. Switch between Tree, JSON and Table views
5. Double-click a value to edit it. Staged changes appear in the changes bar, where you review, confirm or discard them
6. Right-click a row or tree node for more actions (copy, delete, add field, …)
7. Use the top tabs to switch between **Collections**, **Aggregation**, **Schema**, **Indexes**, **Shell** and **Performance**

### Shell

The shell runs real mongosh-style JavaScript against the live driver, so the whole MongoDB API is available, not a fixed list of commands.

1. Open the **Shell** tab (a database must be selected in the tree)
2. Write any mongosh command, for example:
   - **CRUD:** `db.users.insertOne({...})`, `db.users.updateMany({...}, {$set:{...}})`, `db.users.deleteMany({...})`
   - **Reads with chaining:** `db.users.find({age:{$gte:30}}).sort({age:-1}).limit(20)`
   - **Aggregation:** `db.orders.aggregate([{$match:{...}}, {$group:{_id:"$status", n:{$sum:1}}}])`
   - **Indexes / bulk / findAndModify:** `db.users.createIndex({email:1})`, `db.users.bulkWrite([...])`, `db.users.findOneAndUpdate(...)`
   - **DB-level:** `db.getCollectionNames()`, `db.runCommand({...})`, `db.stats()`, `db.getSiblingDB("other").users.find()`
   - **Helpers:** `ObjectId(...)`, `ISODate(...)`, `NumberLong(...)`, `NumberDecimal(...)`, `UUID(...)`
   - **Legacy aliases:** `insert`, `update`, `remove`, `save`, `count`, `getIndexes`, `findAndModify`
   - A bare JSON filter (e.g. `{"status":"active"}`) runs as `find()` on the selected collection
3. Press **Enter** to run (Shift+Enter adds a newline)
4. Array results show as a paginated table (10 docs per page). Each result has a toggle to switch it to JSON
5. Remove a result with its **×** button. Open more shell tabs with **+**

> Each command returns at most 1000 documents, and cursors are iterated automatically. You only need `await` for an intermediate async value inside a multi-statement block.
>
> Commands follow the same time limit as queries (toolbar, 15s – 5m) and show a **Cancel** button while running. A cancelled or timed-out script stops at its next database call, and its server operations are killed.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd+F | Search the loaded results |
| Enter | Run the query / shell command |
| Shift+Enter | New line in the shell |
| Ctrl/Cmd+Enter | Run the full aggregation pipeline |
| Delete | Delete the selected documents |
| Escape | Close the open popover, modal or search |

---

## Testing

Tests use the built-in `node:test` runner, with no test framework dependency.

```bash
npm run lint        # ESLint, incl. a rule that every value put into HTML is escaped
npm run typecheck   # JSDoc type check of the files listed in jsconfig.json
npm run test:unit   # pure logic (main process + renderer modules)
npm test            # unit + integration (starts a throwaway mongod, skipped if none is available)
npm run test:e2e    # drives the real Electron app over the DevTools protocol
npm run test:all    # everything
```

> Never point `MONGOAIO_TEST_URI` at a database with real data. The tests create and drop `mongoaio_test_*` and `e2e_*` databases.

---

## Building for Distribution

```bash
npm run pack          # unpacked build in dist/ (quick check)
npm run build:win     # Windows: NSIS installer + portable .exe
npm run build:linux   # Linux: .deb + AppImage
npm run build:mac     # macOS: .dmg + .zip (x64 + arm64)
```

Pushing a `v*` tag triggers the GitHub Actions release workflow, which builds every platform and publishes to GitHub Releases. The auto-updater picks new versions up from there.

---

## Project Structure

```
mongoaio/
├── main.js              # App lifecycle, window, navigation lockdown, quit cleanup
├── preload.js           # contextBridge: the only renderer→main surface (window.api)
├── ipc-handlers.js      # Core IPC (connections, CRUD, compare, copy/sync)
├── start.js             # Cross-platform launcher (npm start)
├── index.html           # Shell page + CSP
├── build/               # Installer icons
├── src/
│   ├── main/            # Main-process services: tool IPC, validation, saved connections,
│   │                    #   import/export, logging, diagnostics, auto-update
│   ├── db/              # Database layer: connection, queries, CRUD, comparison, aggregation,
│   │                    #   schema, indexes, metrics, type preservation, mongosh shell
│   └── renderer/        # UI (vanilla ES modules): components, editor, modals, utils
├── styles/              # CSS (base, components, views)
└── tests/               # unit, integration, e2e + helpers
```

---

## Logs & Troubleshooting

Logs are written to the `logs/` folder in the app's user-data directory, and rotated at 5 MB. Set `MONGOAIO_LOG_LEVEL` (`debug`, `info`, `warn`, `error`) to change how much gets logged.

On Linux, saved connection strings are only encrypted when a secret service (gnome-keyring, KWallet) is running and unlocked. Without one they are stored in plaintext, and the app logs a warning.
