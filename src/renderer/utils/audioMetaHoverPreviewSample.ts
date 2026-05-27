import type { AudioFileMetaInfo } from '@shared/audioFileMeta'

const PREVIEW_COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><rect fill="url(#g)" width="64" height="64" rx="6"/><text x="32" y="38" text-anchor="middle" fill="white" font-size="22" font-family="system-ui,sans-serif">♪</text></svg>`

export const AUDIO_META_HOVER_PREVIEW_PATH =
  'D:\\Music\\示例艺术家\\示例专辑\\01 - 示例曲目.flac'

/** 设置页悬停信息预览用的示例元数据 */
export function createAudioMetaHoverPreviewMeta(): AudioFileMetaInfo {
  return {
    filePath: AUDIO_META_HOVER_PREVIEW_PATH,
    ok: true,
    fileSizeBytes: 38_654_720,
    coverDataUrl: `data:image/svg+xml,${encodeURIComponent(PREVIEW_COVER_SVG)}`,
    common: {
      title: '示例曲目',
      artist: '示例艺术家',
      album: '示例专辑',
      genre: '流行',
      year: '2024',
      track: '1/12',
      comment: '设置预览用示例标签'
    },
    format: {
      duration: '245.8',
      bitrate: '1411200',
      sampleRate: '44100',
      bitsPerSample: '16',
      codec: 'FLAC',
      numberOfChannels: '2',
      container: 'FLAC',
      lossless: 'true'
    },
    native: [
      { id: 'ID3v2:TIT2', value: '示例曲目' },
      { id: 'ID3v2:TPE1', value: '示例艺术家' },
      { id: 'ID3v2:TALB', value: '示例专辑' }
    ]
  }
}
