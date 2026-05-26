import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig } from '../shared/appConfig'
import type {
  CopyLrcParams,
  CopyLrcResult,
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
  BrowseRenamePathParams,
  BrowseRenameResult,
  DirAudioFileItem,
  ListDirAudioFilesParams,
  ListSourceDirChildrenParams,
  SourceDirChild
} from '../shared/sourceDirBrowse'
import { toIpcPlain } from '../shared/serialize'

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

  deleteOrphanLrc: async (
    params: DeleteOrphanParams
  ): Promise<DeleteOrphanResult> => {
    const result = await ipcRenderer.invoke(
      'delete-orphan-lrc',
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
    ipcRenderer.invoke('reveal-app-config-in-folder').then((result) => toIpcPlain(result))
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
