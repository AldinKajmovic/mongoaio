import { initShell } from '../shell.js';
import { initConnectionPanel } from '../components/connection-panel.js';
import { initMainContent } from '../components/main-content.js';
import { initEditorShell } from '../editor/editor-layout.js';
import { initModalsShell } from '../components/modals-shell.js';
import { initAddCollectionShell } from '../modals/add-collection-shell.js';

initShell();
initConnectionPanel();
initMainContent();
initEditorShell();
initModalsShell();
initAddCollectionShell();
