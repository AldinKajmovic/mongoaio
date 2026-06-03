# MongoAIO

A desktop application for comparing, editing, and syncing MongoDB databases — built with Electron.

Connect two MongoDB instances side by side, compare databases, collections, and documents, then sync differences with a click. Includes a built-in DB editor with a query builder, inline editing, and a shell.

---

## Features

- **Database Comparison** — Compare two MongoDB instances: see common, source-only, and target-only databases and collections at a glance
- **Document Diff** — Field-by-field comparison of documents with visual diffs, inline editing, and selective field syncing
- **DB Editor** — Full-featured editor with tree sidebar, query builder (drag-and-drop fields), JSON/Tree/Table views, and pagination
- **Shell** — Execute queries and mongosh-style commands with multi-tab support
- **Copy & Sync** — Copy databases, collections, or individual documents between instances; sync selected fields across sides
- **Saved Connections** — Store and manage connection aliases for quick access
- **Search** — Local search with highlighting across all editor views, plus collection and document filtering in comparison mode
- **Keyboard Shortcuts** — Ctrl+F for search, Enter to run queries, Delete to remove documents, and more

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)

---

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the application

```bash
npm start
```

This launches the Electron app. You will see the connection panel where you can enter MongoDB URIs.

---

## Usage

### Comparing Databases

1. Enter a **Source** and **Target** MongoDB connection URI
2. Click **Connect** — databases from both instances are listed side by side
3. Click a database to compare its collections, then click a collection to compare documents
4. Use the stat pills (common / source only / target only) to filter the view
5. Use the sync buttons to copy or sync documents and fields between instances

### DB Editor

1. Save a connection (alias + URI) in the connection panel
2. Click the **DB Editor** button in the top bar
3. The tree sidebar lists your saved connections — click to connect and browse databases/collections
4. Select a collection to query it; use the filter, sort, projection, and limit fields
5. Switch between JSON, Tree, and Table views in the result panel
6. Double-click a field value or document to edit inline; right-click for context menu actions
7. Drag fields from the tree/table into the query builder to construct filters visually

### Shell

The shell evaluates real mongosh-style JavaScript against the live driver, so the
**full MongoDB operation surface** is available — not just a fixed list of commands.

1. Open the shell tab within the DB editor (a database must be selected in the tree)
2. Write any mongosh command, for example:
   - **CRUD:** `db.users.insertOne({...})`, `db.users.updateMany({...}, {$set:{...}})`, `db.users.deleteMany({...})`
   - **Reads with chaining:** `db.users.find({age:{$gte:30}}).sort({age:-1}).limit(20)`
   - **Aggregation pipelines:** `db.orders.aggregate([{$match:{...}}, {$group:{_id:"$status", n:{$sum:1}}}])`
   - **Indexes / bulk / findAndModify:** `db.users.createIndex({email:1})`, `db.users.bulkWrite([...])`, `db.users.findOneAndUpdate(...)`
   - **DB-level:** `db.getCollectionNames()`, `db.runCommand({...})`, `db.stats()`, `db.getSiblingDB("other").users.find()`
   - **mongosh helpers:** `ObjectId(...)`, `ISODate(...)`, `NumberLong(...)`, `NumberDecimal(...)`, `UUID(...)`
   - **Legacy aliases:** `insert`, `update`, `remove`, `save`, `count`, `getIndexes`, `findAndModify`
   - A bare JSON filter (e.g. `{"status":"active"}`) runs as a `find()` on the selected collection
3. Press **Enter** to execute (Shift+Enter for a newline); results appear below
4. Array results render as a **paginated table** (10 docs/page) — toggle to **JSON** with the button on each result
5. Each result has a **×** button to remove it; use the **+** in the tab bar for multiple shell tabs

> Result sets are capped at 1000 documents per command for performance; cursors are
> auto-iterated. Use `await` only when you need an intermediate async value in a multi-statement block.

---

## Building for Distribution

```bash

# Platform-specific
npm run build:win      # Windows (.exe)
npm run build:linux    # Linux (.deb, .AppImage)
```

---

## Project Structure

```
comparedb/
├── main.js              # Electron main process
├── preload.js           # Context bridge (security layer)
├── ipc-handlers.js      # IPC event routing
├── index.html           # Application shell
├── start.js             # Cross-platform launcher
├── src/
│   ├── main/            # Main process helpers
│   ├── db/              # Database layer (connection, queries, comparison, CRUD)
│   └── renderer/        # UI layer (components, editor, modals, utilities)
└── styles/              # CSS (variables, base, components, views)
```

---

## Versioning & Updates

When opening application, it will check for updates and notify you if there is a new version available.

---

