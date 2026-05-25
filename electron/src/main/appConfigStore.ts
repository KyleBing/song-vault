import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  APP_CONFIG_FILE_NAME,
  createDefaultAppConfig,
  normalizeAppConfig,
  type AppConfig
} from '../shared/appConfig'

export function getAppConfigPath(): string {
  return path.join(app.getPath('home'), APP_CONFIG_FILE_NAME)
}

export function loadAppConfig(): AppConfig {
  const filePath = getAppConfigPath()
  if (!fs.existsSync(filePath)) {
    return createDefaultAppConfig()
  }
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    return normalizeAppConfig(JSON.parse(text) as unknown)
  } catch {
    return createDefaultAppConfig()
  }
}

export function saveAppConfig(config: AppConfig): void {
  const filePath = getAppConfigPath()
  const normalized = normalizeAppConfig(config)
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
}
