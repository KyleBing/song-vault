/** 从音频文件解析出的指标（加密格式通常无法解析，字段为空） */
export interface AudioFileMetrics {
  bitrateKbps?: number
  durationSec?: number
  sampleRateHz?: number
  channels?: number
  codec?: string
  bitsPerSample?: number
  title?: string
  artist?: string
  album?: string
  genre?: string
  year?: number
}

export function emptyAudioFileMetrics(): AudioFileMetrics {
  return {}
}

/** 列配置或排序是否需要读取音频元数据 */
export function needsAudioMetadata(
  columnIds: readonly string[],
  sortKey?: string
): boolean {
  const keys = new Set([
    'bitrate',
    'duration',
    'sampleRate',
    'channels',
    'codec',
    'bitsPerSample',
    'title',
    'artist',
    'album',
    'genre',
    'year'
  ])
  if (sortKey && keys.has(sortKey)) return true
  return columnIds.some((id) => keys.has(id))
}
