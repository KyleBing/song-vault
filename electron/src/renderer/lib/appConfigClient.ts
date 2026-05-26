import {
  createDefaultAppConfig,
  isAppAppearance,
  type AppAppearance,
  type AppConfig
} from '@shared/appConfig'
import { toIpcPlain } from '@shared/serialize'

const THEME_CACHE_KEY = 'smr-appearance'

let configPromise: Promise<AppConfig> | null = null
let loadedConfig: AppConfig | null = null

/** 上次成功应用的主题，供启动时同步渲染，避免刷新后闪回默认色 */
export function readThemeCache(): AppAppearance {
  try {
    const value = localStorage.getItem(THEME_CACHE_KEY)
    if (isAppAppearance(value)) return value
  } catch {
    /* 隐私模式等无法访问 localStorage */
  }
  return 'light'
}

/** 将当前主题写入 localStorage，供下次启动首屏同步使用 */
export function writeThemeCache(appearance: AppAppearance): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, appearance)
  } catch {
    /* ignore */
  }
}

/** 全应用只加载一次磁盘配置（bootstrap 与 App 共用） */
export function loadAppConfigOnce(): Promise<AppConfig> {
  if (loadedConfig) return Promise.resolve(loadedConfig)
  if (!configPromise) {
    configPromise = window.electronAPI
      .loadAppConfig()
      .then(({ config }) => {
        loadedConfig = config
        writeThemeCache(config.appearance)
        return config
      })
      .catch((err) => {
        configPromise = null
        console.error('加载应用配置失败', err)
        const fallback = createDefaultAppConfig()
        loadedConfig = fallback
        return fallback
      })
  }
  return configPromise
}

/** 将完整配置写入磁盘（经 toIpcPlain 剥离 Vue Proxy 后 IPC 传输） */
export async function saveAppConfig(config: AppConfig): Promise<void> {
  const plain = toIpcPlain(config)
  await window.electronAPI.saveAppConfig(plain)
  loadedConfig = plain
  writeThemeCache(plain.appearance)
}

/** 仅更新外观并写盘，不依赖目录配置是否已 hydrate */
export async function persistAppearance(
  appearance: AppAppearance
): Promise<void> {
  const config = await loadAppConfigOnce()
  if (config.appearance === appearance) return
  await saveAppConfig({ ...config, appearance })
}
