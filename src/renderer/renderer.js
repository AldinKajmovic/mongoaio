/**
 * Imports all modules and initializes the application.
 */

// 0. Build the DOM shells before anything else references elements
import './utils/boot.js';

// 1. Load foundation (state.js reads DOM created above)
import './utils/state.js';
import './utils/dom.js';
import './utils/ui.js';

// 2. Load feature modules
import './utils/connections.js';
import './utils/navigation.js';
import './modals/add-collection.js';

// 3. View components
import './components/database-view.js';
import './components/collection-view.js';
import './components/document-view.js';
import './components/document-crud.js';

// 4. Editor modules
import './editor/tree.js';
import './editor/query.js';
import './editor/inline-edit.js';
import './editor/search.js';
import { initEditorShellLogic } from './editor/shell.js';
import './editor/resize.js';

initEditorShellLogic();
