import { defineStore } from 'pinia'
import type { AppAppearance } from '@shared/appConfig'
import {
  persistAppearance,
  readThemeCache,
  writeThemeCache
} from '@renderer/lib/appConfigClient'

/** 同步 document 的 data-theme 并更新 localStorage 缓存 */
function applyDocumentTheme(appearance: AppAppearance): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = appearance
  writeThemeCache(appearance)
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    appearance: readThemeCache() as AppAppearance
  }),
  actions: {
    /** 切换主题并异步持久化到配置文件 */
    setAppearance(appearance: AppAppearance): void {
      if (this.appearance === appearance) return
      this.appearance = appearance
      applyDocumentTheme(appearance)
      void persistAppearance(appearance).catch((err) => {
        console.error('保存主题设置失败', err)
      })
    },
    /** 从缓存或磁盘配置恢复主题，不写盘 */
    hydrate(appearance: AppAppearance): void {
      this.appearance = appearance
      applyDocumentTheme(appearance)
    }
  }
})
