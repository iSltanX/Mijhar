// مضيف الواجهات (T-1.4): حاويات Shadow DOM، والدرج، وتدفق صلاحية api.github.com، وأمر اللوحة، ومفاتيح الوحدات.
export { extensionApi } from './browser-api';
export type { CommandInfo, ExtEvent, ExtensionApi, PermissionsApi, PermissionsSet, TabLike } from './browser-api';
export {
  applySurface,
  DRAWER_MESSAGE,
  isDrawerMessage,
  OPEN_OPTIONS_MESSAGE,
  openPanel,
  PANEL_COMMAND,
  PANEL_SHORTCUT,
  readSurfaceMirror,
  SURFACE_MIRROR_KEY,
  toggleDrawer,
} from './commands';
export type { DrawerAction, DrawerMessage, PanelCommandDeps, PanelOutcome } from './commands';
export { Drawer, DRAWER_NAME, DRAWER_OPEN_ATTR, DRAWER_WIDTH_PX } from './drawer';
export type { DrawerControls, DrawerOptions } from './drawer';
export { API_GITHUB_HOST, API_GITHUB_ORIGIN, API_GITHUB_PERMISSION, ApiGithubPermission, fetchApiGithub, PermissionNotGrantedError } from './permissions';
export type { ApiFetchDeps } from './permissions';
export { openSettings } from './settings-runtime';
export type { OpenedSettings, OpenSettingsOptions } from './settings-runtime';
export { applyStyles, createShadowHost, deepActiveElement, githubTheme, HOST_ATTR, HOST_TAG, INLINE_HOST_CSS, STYLES_ATTR } from './shadow';
export type { ShadowHostOptions, ShadowParts, StyleMode } from './shadow';
export { mountSurface } from './surface';
export type { SurfaceOptions, UiSurface } from './surface';
export {
  createSettingsRegistry,
  DEFAULT_SURFACE,
  defineCoreSettings,
  isModuleEnabled,
  isSurface,
  isUnitId,
  SURFACE_KEY,
  SURFACES,
  UNIT_DEFAULT_ENABLED,
  UNIT_IDS,
  UNITS,
  unitOf,
} from './units';
export type { Surface, UnitId, UnitInfo } from './units';
