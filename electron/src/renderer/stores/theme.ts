import { defineStore } from 'pinia'
import type { AppAppearance } from '@shared/appConfig'
import {
  persistAppearance,
  readThemeCache,
  writeThemeCache
} from '@renderer/lib/appConfigClient'

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
    setAppearance(appearance: AppAppearance): void {
      if (this.appearance === appearance) return
      this.appearance = appearance
      applyDocumentTheme(appearance)
      void persistAppearance(appearance).catch((err) => {
        console.error('保存主题设置失败', err)
      })
    },
    hydrate(appearance: AppAppearance): void {
      this.appearance = appearance
      applyDocumentTheme(appearance)
    }
  }
})
