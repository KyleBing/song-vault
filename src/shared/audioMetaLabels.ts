/** common 标签字段 → 中文展示名（music-metadata common） */
export const AUDIO_META_COMMON_LABELS: Record<string, string> = {
  title: '标题',
  titlesort: '标题排序',
  subtitle: '副标题',
  artist: '艺术家',
  artists: '艺术家',
  artistsort: '艺术家排序',
  album: '专辑',
  albumsort: '专辑排序',
  albumartist: '专辑艺术家',
  albumartistsort: '专辑艺术家排序',
  genre: '流派',
  year: '年份',
  date: '日期',
  originaldate: '原发行日期',
  originalyear: '原年份',
  releasedate: '发行日期',
  track: '曲目号',
  disk: '光盘号',
  totaltracks: '曲目总数',
  totaldiscs: '光盘总数',
  comment: '备注',
  description: '描述',
  longdescription: '详细描述',
  lyrics: '歌词',
  composer: '作曲',
  composersort: '作曲排序',
  lyricist: '作词',
  writer: '作者',
  conductor: '指挥',
  remixer: '混音',
  arranger: '编曲',
  engineer: '工程师',
  producer: '制作人',
  publisher: '出版者',
  djmixer: 'DJ 混音',
  mixer: '混音师',
  performer: '演奏者',
  'performer:instrument': '演奏（乐器）',
  bpm: 'BPM',
  copyright: '版权',
  label: '厂牌',
  catalognumber: '目录号',
  isrc: 'ISRC',
  barcode: '条形码',
  asin: 'ASIN',
  iswc: 'ISWC',
  movement: '乐章',
  movementindex: '乐章序号',
  movementtotal: '乐章总数',
  showmovement: '显示乐章',
  part: '分部',
  partof: '所属作品',
  work: '作品',
  grouping: '分组',
  originalartist: '原艺术家',
  originalalbum: '原专辑',
  encoder: '编码器',
  encodedby: '编码者',
  language: '语言',
  mood: '情绪',
  key: '调性',
  rating: '评分',
  media: '媒介类型',
  compilation: '合辑',
  gapless: '无缝播放',
  hdvideo: '高清视频',
  podcast: '播客',
  show: '节目',
  showsort: '节目排序',
  season: '季',
  episode: '集',
  episodetype: '集类型',
  podcasturl: '播客 URL',
  discsubtitle: '光盘副标题',
  category: '分类',
  keywords: '关键词',
  notes: '注释',
  website: '网站',
  replaygain_track_gain: '回放增益（曲目）',
  replaygain_track_peak: '回放增益峰值（曲目）',
  replaygain_track_minmax: '回放增益范围（曲目）',
  replaygain_album_gain: '回放增益（专辑）',
  replaygain_album_peak: '回放增益峰值（专辑）',
  replaygain_album_minmax: '回放增益范围（专辑）',
  replaygain_undo: '回放增益撤销',
  averagelevel: '平均电平',
  peaklevel: '峰值电平',
  musicbrainz_trackid: 'MusicBrainz 曲目 ID',
  musicbrainz_albumid: 'MusicBrainz 专辑 ID',
  musicbrainz_artistid: 'MusicBrainz 艺术家 ID',
  musicbrainz_albumartistid: 'MusicBrainz 专辑艺术家 ID',
  musicbrainz_releasegroupid: 'MusicBrainz 发行组 ID',
  musicbrainz_workid: 'MusicBrainz 作品 ID',
  musicbrainz_trmid: 'MusicBrainz TRM ID',
  musicbrainz_discid: 'MusicBrainz 光盘 ID',
  musicbrainz_recordingid: 'MusicBrainz 录音 ID',
  acoustid_id: 'AcoustID',
  acoustid_fingerprint: 'AcoustID 指纹',
  musicip_puid: 'MusicIP PUID',
  musicip_fingerprint: 'MusicIP 指纹',
  discogs_artist_id: 'Discogs 艺术家 ID',
  discogs_release_id: 'Discogs 发行 ID',
  discogs_label_id: 'Discogs 厂牌 ID',
  discogs_master_release_id: 'Discogs 主发行 ID',
  discogs_votes: 'Discogs 投票',
  discogs_rating: 'Discogs 评分',
  podcastid: '播客 ID',
  stik: '媒体类型（iTunes）',
  picture: '封面',
  artwork: '封面图'
}

/** 悬停「常规」模式下展示的 format 字段（顺序固定） */
export const AUDIO_META_NORMAL_FORMAT_KEYS = [
  'duration',
  'bitrate',
  'sampleRate',
  'bitsPerSample'
] as const

/** 悬停「常规」模式展示项（含 format 字段 + 文件大小） */
export const AUDIO_META_NORMAL_DISPLAY_KEYS = [
  ...AUDIO_META_NORMAL_FORMAT_KEYS,
  'fileSize'
] as const

/** format 字段 → 中文展示名 */
export const AUDIO_META_FORMAT_LABELS: Record<string, string> = {
  duration: '时长',
  bitrate: '比特率',
  sampleRate: '采样率',
  bitsPerSample: '位深',
  fileSize: '文件大小',
  codec: '编码',
  codecProfile: '编码配置',
  numberOfChannels: '声道数',
  numberOfSamples: '采样数',
  container: '容器',
  lossless: '无损',
  tagTypes: '标签类型',
  trackInfo: '音轨信息',
  trackOverlap: '音轨重叠',
  tool: '工具',
  hasAudio: '含音频',
  hasVideo: '含视频',
  audioCodec: '音频编码',
  videoCodec: '视频编码',
  audioBitrate: '音频比特率',
  videoBitrate: '视频比特率',
  creationTime: '创建时间',
  modificationTime: '修改时间',
  headerType: '头部类型'
}

/** 原生标签容器格式前缀 → 中文 */
export const AUDIO_META_NATIVE_FORMAT_LABELS: Record<string, string> = {
  vorbis: 'Vorbis',
  'ID3v2.4': 'ID3v2.4',
  'ID3v2.3': 'ID3v2.3',
  'ID3v2.2': 'ID3v2.2',
  ID3v1: 'ID3v1',
  iTunes: 'iTunes / MP4',
  APEv2: 'APEv2',
  asf: 'ASF / WMA',
  matroska: 'Matroska',
  AIFF: 'AIFF',
  exif: 'EXIF',
  'RIFF/INFO': 'RIFF INFO',
  'ID3v1.1': 'ID3v1.1'
}

/**
 * 原生标签 ID（帧名 / Vorbis 键名，不含格式前缀）→ 中文
 * 含 ID3v2、Vorbis、iTunes 等常见键名
 */
export const AUDIO_META_NATIVE_TAG_LABELS: Record<string, string> = {
  // Vorbis / FLAC
  TITLE: '标题',
  ARTIST: '艺术家',
  ALBUM: '专辑',
  ALBUMARTIST: '专辑艺术家',
  TRACKNUMBER: '曲目号',
  TRACKNUM: '曲目号',
  TRACK: '曲目号',
  DISCNUMBER: '光盘号',
  DISC: '光盘号',
  DATE: '日期',
  YEAR: '年份',
  GENRE: '流派',
  DESCRIPTION: '描述',
  COMMENT: '备注',
  CONTACT: '联系人',
  COPYRIGHT: '版权',
  LICENSE: '许可',
  ORGANIZATION: '组织',
  LOCATION: '位置',
  PERFORMER: '演奏者',
  COMPOSER: '作曲',
  CONDUCTOR: '指挥',
  LYRICIST: '作词',
  REMIXER: '混音',
  ENCODER: '编码器',
  ENCODED_BY: '编码者',
  ENCODEDBY: '编码者',
  BPM: 'BPM',
  KEY: '调性',
  MOOD: '情绪',
  RATING: '评分',
  ISRC: 'ISRC',
  LANGUAGE: '语言',
  LABEL: '厂牌',
  CATALOGNUMBER: '目录号',
  CATALOGUE: '目录号',
  METADATA_BLOCK_PICTURE: '嵌入封面',
  METADATA_BLOCK_PICTURES: '嵌入封面',
  REPLAYGAIN_TRACK_GAIN: '回放增益（曲目）',
  REPLAYGAIN_TRACK_PEAK: '回放增益峰值（曲目）',
  REPLAYGAIN_ALBUM_GAIN: '回放增益（专辑）',
  REPLAYGAIN_ALBUM_PEAK: '回放增益峰值（专辑）',
  MUSICBRAINZ_TRACKID: 'MusicBrainz 曲目 ID',
  MUSICBRAINZ_ALBUMID: 'MusicBrainz 专辑 ID',
  MUSICBRAINZ_ARTISTID: 'MusicBrainz 艺术家 ID',
  MUSICBRAINZ_ALBUMARTISTID: 'MusicBrainz 专辑艺术家 ID',
  MUSICBRAINZ_RELEASEGROUPID: 'MusicBrainz 发行组 ID',
  // ID3v2.3 / 2.4
  TIT2: '标题',
  TIT3: '副标题',
  TPE1: '艺术家',
  TPE2: '乐队/合作艺术家',
  TPE3: '指挥',
  TPE4: '混音师',
  TEXT: '作词',
  TCOM: '作曲',
  TALB: '专辑',
  TRCK: '曲目号',
  TPOS: '光盘号',
  TCON: '流派',
  TYER: '年份',
  TDAT: '录制日期',
  TDRC: '录制日期',
  TDRL: '发行日期',
  TDOR: '原发行日期',
  TLAN: '语言',
  TCOP: '版权',
  TENC: '编码者',
  TPUB: '出版者',
  TDEN: '编码时间',
  TSSE: '编码软件',
  TLEN: '长度',
  TKEY: '调性',
  TBPM: 'BPM',
  TMOO: '情绪',
  COMM: '备注',
  USLT: '歌词（非同步）',
  SYLT: '歌词（同步）',
  APIC: '嵌入封面',
  GEOB: '封装对象',
  TXXX: '用户定义文本',
  WXXX: '用户定义 URL',
  POPM: '流行度/评分',
  RGRP: '分组标识',
  MCDI: 'CD 标识',
  PCNT: '播放次数',
  IPLS: '参与方列表',
  TMCL: '音乐家信用',
  TSO2: '专辑艺术家',
  TSOA: '专辑排序',
  TSOP: '艺术家排序',
  TSOT: '标题排序',
  TSRC: 'ISRC',
  TIT1: '内容组',
  // ID3v2.2 (3-char)
  TT2: '标题',
  TT3: '副标题',
  TP1: '艺术家',
  TP2: '乐队',
  TP3: '指挥',
  TP4: '混音师',
  TAL: '专辑',
  TRK: '曲目号',
  TPA: '光盘号',
  TCO: '流派',
  TYE: '年份',
  TDA: '日期',
  TLE: '长度',
  TBP: 'BPM',
  TEN: '编码者',
  TCR: '版权',
  TLA: '语言',
  TST: '副标题',
  PIC: '嵌入封面',
  COM: '备注',
  ULT: '歌词',
  // iTunes / MP4 常见
  '©nam': '标题',
  '©ART': '艺术家',
  '©alb': '专辑',
  '©gen': '流派',
  '©day': '日期',
  '©cmt': '备注',
  '©cpy': '版权',
  '©too': '编码工具',
  '©wrt': '作曲',
  trkn: '曲目号',
  disk: '光盘号',
  covr: '嵌入封面',
  gnre: '流派',
  tmpo: 'BPM',
  cpil: '合辑',
  pgap: '无缝播放',
  aART: '专辑艺术家',
  // ASF / WMA
  'WM/Title': '标题',
  'WM/AlbumTitle': '专辑',
  'WM/AlbumArtist': '专辑艺术家',
  'WM/Genre': '流派',
  'WM/Year': '年份',
  'WM/TrackNumber': '曲目号',
  'WM/PartOfSet': '光盘号',
  'WM/Composer': '作曲',
  'WM/Conductor': '指挥',
  'WM/Writer': '作者',
  'WM/Publisher': '出版者',
  'WM/EncodedBy': '编码者',
  'WM/EncodingTime': '编码时间',
  'WM/Bitrate': '比特率',
  'WM/Codec': '编码',
  // APE
  Title: '标题',
  Artist: '艺术家',
  Album: '专辑',
  Genre: '流派',
  Year: '年份',
  Track: '曲目号',
  Disc: '光盘号',
  Comment: '备注',
  Composer: '作曲',
  CoverArt: '嵌入封面'
}

function lookupInMap(map: Record<string, string>, key: string): string | undefined {
  if (map[key]) return map[key]
  const lower = key.toLowerCase()
  if (map[lower]) return map[lower]
  const upper = key.toUpperCase()
  if (map[upper]) return map[upper]
  return undefined
}

function normalizeMetaKey(key: string): string {
  return key.trim().toLowerCase().replace(/[-\s]+/g, '').replace(/_/g, '')
}

/** 将 camelCase / SNAKE_CASE 转为可读英文（未知键兜底） */
function humanizeMetaKey(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return spaced || key
}

function labelFromCommonAliases(key: string): string | undefined {
  const direct = lookupInMap(AUDIO_META_COMMON_LABELS, key)
  if (direct) return direct
  const norm = normalizeMetaKey(key)
  for (const [k, label] of Object.entries(AUDIO_META_COMMON_LABELS)) {
    if (normalizeMetaKey(k) === norm) return label
  }
  return undefined
}

export function labelForCommonKey(key: string): string {
  return labelFromCommonAliases(key) ?? humanizeMetaKey(key)
}

export function labelForFormatKey(key: string): string {
  return (
    lookupInMap(AUDIO_META_FORMAT_LABELS, key) ??
    labelFromCommonAliases(key) ??
    humanizeMetaKey(key)
  )
}

function nativeTagParts(fullId: string): { formatId: string; tagId: string } {
  const sep = fullId.indexOf(':')
  if (sep < 0) return { formatId: '', tagId: fullId }
  return {
    formatId: fullId.slice(0, sep),
    tagId: fullId.slice(sep + 1)
  }
}

function labelForNativeTagId(tagId: string): string {
  const direct =
    lookupInMap(AUDIO_META_NATIVE_TAG_LABELS, tagId) ??
    labelFromCommonAliases(tagId)
  if (direct) return direct
  return humanizeMetaKey(tagId)
}

/** 原生标签完整 ID（如 vorbis:TITLE、ID3v2.4:TIT2）→ 中文展示名 */
export function labelForNativeTag(fullId: string): string {
  const { formatId, tagId } = nativeTagParts(fullId)
  const tagLabel = labelForNativeTagId(tagId)
  if (!formatId) return tagLabel
  const formatLabel =
    AUDIO_META_NATIVE_FORMAT_LABELS[formatId] ??
    AUDIO_META_NATIVE_FORMAT_LABELS[formatId.toLowerCase()] ??
    formatId
  return `${formatLabel} · ${tagLabel}`
}

export function nativeTagFormatId(fullId: string): string {
  return nativeTagParts(fullId).formatId.toLowerCase()
}

export function isVorbisNativeTag(fullId: string): boolean {
  return nativeTagFormatId(fullId) === 'vorbis'
}

/** Vorbis 专用 Tab：仅展示键名（不含「Vorbis ·」前缀） */
export function labelForVorbisNativeTag(fullId: string): string {
  return labelForNativeTagId(nativeTagParts(fullId).tagId)
}

function normalizedMetaToken(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

/** common 键名或原生 tagId 是否属于 MusicBrainz */
export function isMusicBrainzMetaKey(key: string): boolean {
  return normalizedMetaToken(key).includes('musicbrainz')
}

export function isMusicBrainzNativeTag(fullId: string): boolean {
  return isMusicBrainzMetaKey(nativeTagParts(fullId).tagId)
}

const MUSICBRAINZ_LABEL_PREFIX = /^MusicBrainz\s+/i

function musicBrainzPanelLabel(label: string): string {
  return label.replace(MUSICBRAINZ_LABEL_PREFIX, '')
}

/** MusicBrainz Tab：common 字段中文名（不含 MusicBrainz 前缀） */
export function labelForMusicBrainzCommonKey(key: string): string {
  return musicBrainzPanelLabel(labelForCommonKey(key))
}

/** MusicBrainz Tab：原生标签键名（不含 MusicBrainz 前缀） */
export function labelForMusicBrainzNativeTag(fullId: string): string {
  return musicBrainzPanelLabel(
    labelForNativeTagId(nativeTagParts(fullId).tagId)
  )
}
