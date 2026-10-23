// الوحدة (ز): الملاحظات الخاصة على المستويات الخمسة (T-8.1، F-G1).
export { connectNotes, notesContext, useNotesContext } from './context';
export type { NotesContext, NotesContextProvider, NotesContextState } from './context';
export { NOTES_SELECTORS, lineElementFor } from './dom';
export { LineMarkers } from './markers';
export { MODULE_G, MODULE_G_ID, NOTES_PAGES, createModuleG } from './module';
export type { ModuleGOptions } from './module';
export { NoteNotFoundError, NoteTextError, NotesRepository, checkNoteText, defaultAnchorStatus } from './repository';
export { NOTES_LINE_MARKERS_KEY, NOTES_PAGE_CARD_KEY, defineNotesSettings } from './settings';
export { NOTES_SETTINGS_SECTION } from './section';
export { defaultLevel, notesForPage, notesForRepo, relationTo, sameSha, targetOptions } from './targets';
export type { PageNotes, Relation, TargetOption } from './targets';
export {
  ANCHOR_LABELS,
  ANCHOR_STATUSES,
  LEVEL_LABELS,
  MAX_NOTE_LENGTH,
  NOTE_LEVELS,
  NOTE_PREFIX,
  NOTE_SCHEMA_VERSION,
  describeTarget,
  isNote,
  isNoteTarget,
  noteRecordName,
} from './types';
export type { AnchorStatus, Note, NoteDraft, NoteLevel, NotePatch, NoteTarget } from './types';
export { NOTES_DRAWER_VIEW, NOTES_PANEL_VIEW, NotesView, createNotesView } from './view';
export { NotesWorkspace, useNotes } from './ui/NotesWorkspace';
export { PageCard } from './ui/PageCard';
