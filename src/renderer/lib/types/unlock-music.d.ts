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

  export function RemoveBlobMusic(data: DecryptResult): void
}

declare module '@unlock/decrypt/utils' {
  import type { DecryptResult } from '@unlock/decrypt/entity'
  import type { IAudioMetadata } from 'music-metadata-browser'

  export interface IMusicMeta {
    title: string
    artists?: string[]
    album?: string
    albumartist?: string
    genre?: string[]
    year?: number
    date?: string
    trackNo?: number | null
    trackOf?: number | null
    diskNo?: number | null
    diskOf?: number | null
    comment?: string[]
    lyrics?: string[]
    composer?: string[]
    lyricist?: string[]
    conductor?: string[]
    remixer?: string[]
    producer?: string[]
    label?: string[]
    grouping?: string
    subtitle?: string[]
    bpm?: number
    catalognumber?: string[]
    picture?: ArrayBuffer
    picture_desc?: string
  }

  export function buildMusicMetaFromSources(
    explicit: Partial<IMusicMeta> & { artist?: string },
    parsed: IAudioMetadata
  ): IMusicMeta

  export function embedDecryptMetadata(result: DecryptResult): Promise<DecryptResult>
}

declare module '@unlock/utils/storage' {
  interface StorageApi {
    getAll(): Promise<Record<string, unknown>>
    loadJooxUUID(defaultValue?: string): Promise<string>
    saveJooxUUID(uuid: string): Promise<void>
  }

  export const storage: StorageApi
}
