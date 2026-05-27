import { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } from 'electron'
import { join } from 'path'
import {
  copyLrcToAudio,
  deleteOrphanLrc,
  runJob,
  type CopyLrcParams,
  type DeleteOrphanParams,
  type RunJobParams
} from '../shared/lrcJob'
import { isDecryptableExtension } from '../shared/musicFormats'
import {
  readMusicFile,
  writeDecryptedMusic,
  type WriteDecryptedMusicParams
} from '../shared/musicDecryptJob'
import {
  browseCreateDir,
  browseDeleteFiles,
  browseDeletePath,
  browseRenamePath,
  findAudioInSearchRootsByNames,
  listDirAudioFiles,
  listDirEncryptedMusicFiles,
  listSourceDirChildren,
  type BrowseCreateDirParams,
  type BrowseDeleteFilesParams,
  type BrowseDeletePathParams,
  type BrowseRenamePathParams,
  type FindAudioInSearchRootsParams,
  type ListDirAudioFilesParams,
  type ListSourceDirChildrenParams
} from '../shared/sourceDirBrowse'
import { readAudioFileMetricsBatch } from '../shared/readAudioFileMetrics'
import { toIpcPlain } from '../shared/serialize'
import {
  getAppConfigPath,
  loadAppConfig,
  revealAppConfigInFolder,
  saveAppConfig
} from './appConfigStore'
import type { AppConfig } from '../shared/appConfig'

/** 是否为开发模式（未打包） */
const isDev = !app.isPackaged

const IPC_CHANNELS = [
  'pick-directory',
  'run-job',
  'read-music-file',
  'write-decrypted-music',
  'pick-music-files',
  'list-source-dir-children',
  'list-dir-audio-files',
  'list-dir-encrypted-music-files',
  'browse-create-dir',
  'browse-rename-path',
  'browse-delete-path',
  'browse-delete-files',
  'delete-orphan-lrc',
  'copy-lrc-to-audio',
  'load-app-config',
  'save-app-config',
  'reveal-app-config-in-folder',
  'read-audio-metrics-batch'
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

  ipcMain.handle('read-music-file', async (_, filePath: string) => {
    return readMusicFile(String(filePath))
  })

  ipcMain.handle(
    'write-decrypted-music',
    async (_, params: WriteDecryptedMusicParams) => {
      return writeDecryptedMusic({
        outputDir: params.outputDir,
        fileName: params.fileName,
        data: params.data instanceof Uint8Array ? params.data : new Uint8Array(params.data)
      })
    }
  )

  ipcMain.handle('pick-music-files', async () => {
    const exts = [
      'ncm',
      'uc',
      'qmc0',
      'qmc2',
      'qmc3',
      'qmcflac',
      'qmcogg',
      'mflac',
      'mflac0',
      'mgg',
      'mgg0',
      'mgg1',
      'mggl',
      'kgm',
      'kgma',
      'kwm',
      'xm',
      'tkm',
      'cache',
      'ofl_en'
    ]
    const patterns = exts.map((e) => ({ name: e.toUpperCase(), extensions: [e] }))
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '加密音乐', extensions: exts }, ...patterns]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths.filter((p) => {
      const ext = p.split('.').pop()?.toLowerCase() ?? ''
      return isDecryptableExtension(ext)
    })
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

  ipcMain.handle(
    'list-dir-encrypted-music-files',
    async (_, params: ListDirAudioFilesParams) => {
      return toIpcPlain(listDirEncryptedMusicFiles(toIpcPlain(params)))
    }
  )

  ipcMain.handle(
    'find-audio-in-search-roots',
    async (_, params: FindAudioInSearchRootsParams) => {
      return toIpcPlain(findAudioInSearchRootsByNames(toIpcPlain(params)))
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

  ipcMain.handle(
    'read-audio-metrics-batch',
    async (_, filePaths: unknown) => {
      const paths = Array.isArray(filePaths)
        ? filePaths.filter((p): p is string => typeof p === 'string')
        : []
      return toIpcPlain(await readAudioFileMetricsBatch(paths))
    }
  )

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

  ipcMain.handle('reveal-app-config-in-folder', () => {
    return toIpcPlain(revealAppConfigInFolder())
  })

  ipcMain.handle('open-path-in-file-manager', (_, dirPath: string) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      return '无效路径'
    }
    return shell.openPath(dirPath)
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

/** 默认窗口高度；宽高比 2:1（宽 = 2 × 高） */
const DEFAULT_WINDOW_HEIGHT = 760
const DEFAULT_WINDOW_WIDTH = DEFAULT_WINDOW_HEIGHT * 2
const MIN_WINDOW_HEIGHT = 600
const MIN_WINDOW_WIDTH = MIN_WINDOW_HEIGHT * 2

/** 创建并加载主窗口 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
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
