import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import {
  copyLrcToAudio,
  deleteOrphanLrc,
  runJob,
  type CopyLrcParams,
  type DeleteOrphanParams,
  type RunJobParams
} from '../shared/lrcJob'
import {
  scanMusicDecode,
  type ScanMusicDecodeParams
} from '../shared/musicScanJob'
import {
  browseCreateDir,
  browseDeleteFiles,
  browseDeletePath,
  browseRenamePath,
  listDirAudioFiles,
  listSourceDirChildren,
  type BrowseCreateDirParams,
  type BrowseDeleteFilesParams,
  type BrowseDeletePathParams,
  type BrowseRenamePathParams,
  type ListDirAudioFilesParams,
  type ListSourceDirChildrenParams
} from '../shared/sourceDirBrowse'
import { toIpcPlain } from '../shared/serialize'
import { getAppConfigPath, loadAppConfig, saveAppConfig } from './appConfigStore'
import type { AppConfig } from '../shared/appConfig'

/** 是否为开发模式（未打包） */
const isDev = !app.isPackaged

const IPC_CHANNELS = [
  'pick-directory',
  'run-job',
  'scan-music-decode',
  'list-source-dir-children',
  'list-dir-audio-files',
  'browse-create-dir',
  'browse-rename-path',
  'browse-delete-path',
  'browse-delete-files',
  'delete-orphan-lrc',
  'copy-lrc-to-audio',
  'load-app-config',
  'save-app-config'
] as const

/** 注册 IPC（顶层执行，避免 dev 热更新后 handler 丢失） */
function registerIpcHandlers(): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('pick-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('run-job', async (_, params: RunJobParams) => {
    return toIpcPlain(runJob(toIpcPlain(params)))
  })

  ipcMain.handle('scan-music-decode', async (_, params: ScanMusicDecodeParams) => {
    return toIpcPlain(scanMusicDecode(toIpcPlain(params)))
  })

  ipcMain.handle(
    'list-source-dir-children',
    async (_, params: ListSourceDirChildrenParams) => {
      return toIpcPlain(listSourceDirChildren(toIpcPlain(params)))
    }
  )

  ipcMain.handle(
    'list-dir-audio-files',
    async (_, params: ListDirAudioFilesParams) => {
      return toIpcPlain(listDirAudioFiles(toIpcPlain(params)))
    }
  )

  ipcMain.handle('browse-create-dir', async (_, params: BrowseCreateDirParams) => {
    return toIpcPlain(browseCreateDir(toIpcPlain(params)))
  })

  ipcMain.handle('browse-rename-path', async (_, params: BrowseRenamePathParams) => {
    return toIpcPlain(browseRenamePath(toIpcPlain(params)))
  })

  ipcMain.handle('browse-delete-path', async (_, params: BrowseDeletePathParams) => {
    browseDeletePath(toIpcPlain(params))
    return toIpcPlain({ ok: true })
  })

  ipcMain.handle(
    'browse-delete-files',
    async (_, params: BrowseDeleteFilesParams) => {
      return toIpcPlain(browseDeleteFiles(toIpcPlain(params)))
    }
  )

  ipcMain.handle('delete-orphan-lrc', async (_, params: DeleteOrphanParams) => {
    return toIpcPlain(deleteOrphanLrc(toIpcPlain(params)))
  })

  ipcMain.handle('copy-lrc-to-audio', async (_, params: CopyLrcParams) => {
    return toIpcPlain(copyLrcToAudio(toIpcPlain(params)))
  })

  ipcMain.handle('load-app-config', () => {
    return toIpcPlain({
      config: loadAppConfig(),
      filePath: getAppConfigPath()
    })
  })

  ipcMain.handle('save-app-config', (_, config: AppConfig) => {
    saveAppConfig(toIpcPlain(config))
    return toIpcPlain({ filePath: getAppConfigPath() })
  })
}

registerIpcHandlers()

const DEVTOOLS_ACCELERATOR = 'CommandOrControl+Shift+I'

/** Ctrl+Shift+I（macOS 为 Cmd+Shift+I）切换开发者工具 */
function registerDevToolsShortcut(): void {
  if (globalShortcut.isRegistered(DEVTOOLS_ACCELERATOR)) {
    globalShortcut.unregister(DEVTOOLS_ACCELERATOR)
  }
  const ok = globalShortcut.register(DEVTOOLS_ACCELERATOR, () => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.toggleDevTools()
    }
  })
  if (!ok) {
    console.warn(`未能注册全局快捷键: ${DEVTOOLS_ACCELERATOR}`)
  }
}

/** 创建并加载主窗口 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'LRC 歌词归位',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerDevToolsShortcut()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 主进程热重载时 whenReady 不会再次触发，需补注册快捷键
if (app.isReady()) {
  registerDevToolsShortcut()
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
