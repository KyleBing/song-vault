/** 应用菜单 / IPC 导航目标 */
export type AppNavigateTarget =
  | 'lrc'
  | 'decode'
  | 'library'
  | 'sync'
  | 'settings'
  | 'about'

export const APP_NAVIGATE_CHANNEL = 'app:navigate' as const
