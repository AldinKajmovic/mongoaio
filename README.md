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

1. Open the shell tab within the DB editor
2. Write a JSON filter (e.g. `{"status": "active"}`) or a mongosh-style command (e.g. `db.users.find({"age": 30})`)
3. Press **Enter** to execute; results appear below
4. Use the **+** button to open multiple shell tabs

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

Versioning and an auto-update mechanism are coming soon. Stay tuned for release tags and a changelog.

---

