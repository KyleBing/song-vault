/** common 标签字段 → 中文展示名 */
export const AUDIO_META_COMMON_LABELS: Record<string, string> = {
  title: '标题',
  artist: '艺术家',
  artists: '艺术家',
  album: '专辑',
  albumartist: '专辑艺术家',
  genre: '流派',
  year: '年份',
  date: '日期',
  track: '曲目号',
  disk: '光盘号',
  comment: '备注',
  composer: '作曲',
  lyricist: '作词',
  lyrics: '歌词',
  bpm: 'BPM',
  copyright: '版权',
  label: '厂牌',
  isrc: 'ISRC',
  movement: '乐章',
  movementIndex: '乐章序号',
  movementTotal: '乐章总数',
  part: '分部',
  partof: '所属作品',
  originalartist: '原艺术家',
  originalalbum: '原专辑',
  originalyear: '原年份',
  originaldate: '原日期',
  grouping: '分组',
  subtitle: '副标题',
  description: '描述',
  conductor: '指挥',
  remixer: '混音',
  encoder: '编码器',
  encodedby: '编码者',
  language: '语言',
  mood: '情绪',
  key: '调性',
  rating: '评分',
  replaygain_track_gain: '回放增益（曲目）',
  replaygain_album_gain: '回放增益（专辑）'
}

/** format 字段 → 中文展示名 */
export const AUDIO_META_FORMAT_LABELS: Record<string, string> = {
  duration: '时长',
  bitrate: '比特率',
  sampleRate: '采样率',
  bitsPerSample: '位深',
  codec: '编码',
  codecProfile: '编码配置',
  numberOfChannels: '声道数',
  container: '容器',
  lossless: '无损',
  tagTypes: '标签类型',
  trackInfo: '音轨信息',
  tool: '工具'
}

export function labelForCommonKey(key: string): string {
  return AUDIO_META_COMMON_LABELS[key] ?? key
}

export function labelForFormatKey(key: string): string {
  return AUDIO_META_FORMAT_LABELS[key] ?? key
}
