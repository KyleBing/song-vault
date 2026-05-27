/**
 * 加密音乐文件扩展名（对齐 unlock-music 的 decrypt/index.ts 路由）。
 * 扩展名均为小写、不含点。
 */

/** 网易云音乐 */
export const NETEASE_ENCRYPTED_EXTENSIONS = new Set(['ncm', 'uc'])

/** QQ 音乐（含 QMC / Moo / 微云 hex 后缀 / TM / cache 等） */
export const QQ_ENCRYPTED_EXTENSIONS = new Set([
  'qmc3',
  'qmc2',
  'qmc0',
  'qmcflac',
  'qmcogg',
  'tkm',
  'bkcmp3',
  'bkcm4a',
  'bkcflac',
  'bkcwav',
  'bkcape',
  'bkcogg',
  'bkcwma',
  'mggl',
  'mflac',
  'mflac0',
  'mgg',
  'mgg1',
  'mgg0',
  '666c6163',
  '6d7033',
  '6f6767',
  '6d3461',
  '776176',
  'tm0',
  'tm3',
  'tm2',
  'tm6',
  'cache'
])

export type MusicPlatform = 'netease' | 'qq'

export function classifyEncryptedExtension(
  ext: string
): MusicPlatform | null {
  const e = ext.toLowerCase()
  if (NETEASE_ENCRYPTED_EXTENSIONS.has(e)) return 'netease'
  if (QQ_ENCRYPTED_EXTENSIONS.has(e)) return 'qq'
  return null
}

export function isEncryptedMusicExtension(ext: string): boolean {
  return classifyEncryptedExtension(ext) !== null
}

/** 酷狗 / 酷我 / JOOX 等（unlock-music 路由中的其它加密格式） */
export const OTHER_ENCRYPTED_EXTENSIONS = new Set([
  'kgm',
  'kgma',
  'vpr',
  'kwm',
  'ofl_en',
  'xm'
])

/** 是否可由 unlock-music 解密（用于文件管理列表过滤） */
export function isDecryptableExtension(ext: string): boolean {
  const e = ext.toLowerCase()
  return isEncryptedMusicExtension(e) || OTHER_ENCRYPTED_EXTENSIONS.has(e)
}

export const PLATFORM_LABELS: Record<MusicPlatform, string> = {
  netease: '网易云',
  qq: 'QQ音乐'
}
