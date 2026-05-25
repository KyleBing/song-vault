import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import {
  copyLrcToAudio,
  deleteOrphanLrc,
  runJob,
  type CopyLrcParams,
  type DeleteOrphanParams,
  type RunJobParams
} from '../shared/lrcJob'
import { toIpcPlain } from '../shared/serialize'

/** 是否为开发模式（未打包） */
const isDev = !app.isPackaged

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

  ipcMain.handle('delete-orphan-lrc', async (_, params: DeleteOrphanParams) => {
    return toIpcPlain(deleteOrphanLrc(toIpcPlain(params)))
  })

  ipcMain.handle('copy-lrc-to-audio', async (_, params: CopyLrcParams) => {
    return toIpcPlain(copyLrcToAudio(toIpcPlain(params)))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
