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
import { toIpcPlain } from '../shared/serialize'

/** 暴露给渲染进程的安全 API（通过 contextBridge） */
const api = {
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('pick-directory'),

  runJob: async (params: RunJobParams): Promise<JobResult> => {
    const result = await ipcRenderer.invoke('run-job', toIpcPlain(params))
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
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
