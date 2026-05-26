declare module '@unlock/decrypt' {
  import type { DecryptResult, FileInfo } from '@unlock/decrypt/entity'

  export function Decrypt(
    file: FileInfo,
    config: Record<string, unknown>
  ): Promise<DecryptResult>
}

declare module '@unlock/decrypt/entity' {
  export interface DecryptResult {
    title: string
    album?: string
    artist?: string
    mime: string
    ext: string
    file: string
    blob: Blob
    picture?: string
    message?: string
    rawExt?: string
    rawFilename?: string
  }

  export interface FileInfo {
    status: string
    name: string
    size: number
    percentage: number
    uid: number
    raw: File
  }
}

declare module '@unlock/utils/utils' {
  import type { DecryptResult } from '@unlock/decrypt/entity'

  export enum FilenamePolicy {
    ArtistAndTitle,
    TitleOnly,
    TitleAndArtist,
    SameAsOriginal
  }

  export function GetDownloadFilename(
    data: DecryptResult,
    policy: FilenamePolicy
  ): string
}

declare module '@unlock/utils/storage' {
  interface StorageApi {
    getAll(): Promise<Record<string, unknown>>
    loadJooxUUID(defaultValue?: string): Promise<string>
    saveJooxUUID(uuid: string): Promise<void>
  }

  export const storage: StorageApi
}
