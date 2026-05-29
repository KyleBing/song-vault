import { contextBridge, ipcRenderer } from 'electron'
import type { AudioFileMetrics } from '../shared/audioFileMetrics'
import type { AudioFileMetaInfo } from '../shared/audioFileMeta'
import type { AppConfig } from '../shared/appConfig'
import type {
  CopyLrcParams,
  CopyLrcResult,
  DeleteOrphanAudioParams,
  DeleteOrphanParams,
  DeleteOrphanResult,
  JobResult,
  RunJobParams
} from '../shared/lrcJob'
import type {
  ReadMusicFileResult,
  WriteDecryptedMusicParams,
  WriteDecryptedMusicResult
} from '../shared/musicDecryptJob'
import type {
  BrowseCreateDirParams,
  BrowseDeleteFilesParams,
  BrowseDeleteFilesResult,
  BrowseDeletePathParams,
  BrowseMoveFilesParams,
  BrowseMoveFilesResult,
  BrowseRenamePathParams,
  BrowseRenameResult,
  DirAudioFileItem,
  FileStatFields,
  FindAudioInSearchRootsParams,
  ListDirAudioFilesParams,
  ListSourceDirChildrenParams,
  SourceDirChild
} from '../shared/sourceDirBrowse'
import type {
  CompareLibrarySyncParams,
  CompareLibrarySyncResult,
  CopySyncFileParams,
  CopySyncFileResult,
  DeleteSyncFilesParams,
  DeleteSyncFilesResult,
  MoveSyncFileParams,
  MoveSyncFileResult,
  ValidateSyncRootsResult
} from '../shared/librarySyncJob'
import { toIpcPlain } from '../shared/serialize'
import {
  APP_NAVIGATE_CHANNEL,
  type AppNavigateTarget
} from '../shared/appNavigate'

/** 暴露给渲染进程的安全 API（通过 contextBridge） */
const api = {
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('pick-directory'),

  runJob: async (params: RunJobParams): Promise<JobResult> => {
    const result = await ipcRenderer.invoke('run-job', toIpcPlain(params))
    return toIpcPlain(result)
  },

  readMusicFile: (filePath: string): Promise<ReadMusicFileResult> =>
    ipcRenderer.invoke('read-music-file', filePath),

  writeDecryptedMusic: (
    params: WriteDecryptedMusicParams
  ): Promise<WriteDecryptedMusicResult> =>
    ipcRenderer.invoke('write-decrypted-music', params),

  pickMusicFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('pick-music-files'),

  listSourceDirChildren: async (
    params: ListSourceDirChildrenParams
  ): Promise<SourceDirChild[]> => {
    const result = await ipcRenderer.invoke(
      'list-source-dir-children',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  listDirAudioFiles: async (
    params: ListDirAudioFilesParams
  ): Promise<DirAudioFileItem[]> => {
    const result = await ipcRenderer.invoke(
      'list-dir-audio-files',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  listDirEncryptedMusicFiles: async (
    params: ListDirAudioFilesParams
  ): Promise<DirAudioFileItem[]> => {
    const result = await ipcRenderer.invoke(
      'list-dir-encrypted-music-files',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  findAudioInSearchRootsByNames: async (
    params: FindAudioInSearchRootsParams
  ): Promise<Record<string, string[]>> => {
    const result = await ipcRenderer.invoke(
      'find-audio-in-search-roots',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  browseCreateDir: async (params: BrowseCreateDirParams) => {
    const result = await ipcRenderer.invoke(
      'browse-create-dir',
      toIpcPlain(params)
    )
    return toIpcPlain(result) as { path: string }
  },

  browseRenamePath: async (
    params: BrowseRenamePathParams
  ): Promise<BrowseRenameResult> => {
    const result = await ipcRenderer.invoke(
      'browse-rename-path',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  browseDeletePath: async (params: BrowseDeletePathParams): Promise<void> => {
    await ipcRenderer.invoke('browse-delete-path', toIpcPlain(params))
  },

  browseDeleteFiles: async (
    params: BrowseDeleteFilesParams
  ): Promise<BrowseDeleteFilesResult> => {
    const result = await ipcRenderer.invoke(
      'browse-delete-files',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  browseMoveFiles: async (
    params: BrowseMoveFilesParams
  ): Promise<BrowseMoveFilesResult> => {
    const result = await ipcRenderer.invoke(
      'browse-move-files',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  deleteOrphanLrc: async (
    params: DeleteOrphanParams
  ): Promise<DeleteOrphanResult> => {
    const result = await ipcRenderer.invoke(
      'delete-orphan-lrc',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  deleteOrphanAudio: async (
    params: DeleteOrphanAudioParams
  ): Promise<DeleteOrphanResult> => {
    const result = await ipcRenderer.invoke(
      'delete-orphan-audio',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  copyLrcToAudio: async (params: CopyLrcParams): Promise<CopyLrcResult> => {
    const result = await ipcRenderer.invoke(
      'copy-lrc-to-audio',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  loadAppConfig: async (): Promise<{ config: AppConfig; filePath: string }> => {
    const result = await ipcRenderer.invoke('load-app-config')
    return toIpcPlain(result)
  },

  saveAppConfig: async (
    config: AppConfig
  ): Promise<{ filePath: string }> => {
    const result = await ipcRenderer.invoke(
      'save-app-config',
      toIpcPlain(config)
    )
    return toIpcPlain(result)
  },

  revealAppConfigInFolder: (): Promise<{ filePath: string }> =>
    ipcRenderer.invoke('reveal-app-config-in-folder').then((result) => toIpcPlain(result)),

  /** 在系统文件管理器中打开目录；成功返回空字符串，失败返回错误信息 */
  openPathInFileManager: (dirPath: string): Promise<string> =>
    ipcRenderer.invoke('open-path-in-file-manager', dirPath),

  readAudioMetricsBatch: async (
    filePaths: string[]
  ): Promise<Record<string, AudioFileMetrics>> => {
    const result = await ipcRenderer.invoke(
      'read-audio-metrics-batch',
      toIpcPlain(filePaths)
    )
    return toIpcPlain(result)
  },

  readFileStatsBatch: async (
    filePaths: string[]
  ): Promise<Record<string, FileStatFields>> => {
    const result = await ipcRenderer.invoke(
      'read-file-stats-batch',
      toIpcPlain(filePaths)
    )
    return toIpcPlain(result)
  },

  readAudioMeta: async (filePath: string): Promise<AudioFileMetaInfo> => {
    const result = await ipcRenderer.invoke('read-audio-meta', filePath)
    return toIpcPlain(result)
  },

  compareLibrarySync: async (
    params: CompareLibrarySyncParams
  ): Promise<CompareLibrarySyncResult> => {
    const result = await ipcRenderer.invoke(
      'compare-library-sync',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  validateSyncRoots: async (
    leftRoot: string,
    rightRoot: string
  ): Promise<ValidateSyncRootsResult> => {
    const result = await ipcRenderer.invoke(
      'validate-sync-roots',
      leftRoot,
      rightRoot
    )
    return toIpcPlain(result)
  },

  copySyncFile: async (
    params: CopySyncFileParams
  ): Promise<CopySyncFileResult> => {
    const result = await ipcRenderer.invoke('copy-sync-file', toIpcPlain(params))
    return toIpcPlain(result)
  },

  moveSyncFile: async (
    params: MoveSyncFileParams
  ): Promise<MoveSyncFileResult> => {
    const result = await ipcRenderer.invoke('move-sync-file', toIpcPlain(params))
    return toIpcPlain(result)
  },

  deleteSyncFiles: async (
    params: DeleteSyncFilesParams
  ): Promise<DeleteSyncFilesResult> => {
    const result = await ipcRenderer.invoke(
      'delete-sync-files',
      toIpcPlain(params)
    )
    return toIpcPlain(result)
  },

  /** 订阅主进程菜单栏导航；返回取消订阅函数 */
  onAppNavigate: (callback: (view: AppNavigateTarget) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, view: AppNavigateTarget) => {
      callback(view)
    }
    ipcRenderer.on(APP_NAVIGATE_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(APP_NAVIGATE_CHANNEL, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
