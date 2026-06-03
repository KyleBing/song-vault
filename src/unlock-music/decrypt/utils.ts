import { IAudioMetadata, parseBlob as metaParseBlob } from 'music-metadata-browser';
import ID3Writer from 'browser-id3-writer';
import MetaFlac from 'metaflac-js';
import type { DecryptResult } from '@unlock/decrypt/entity';

export const FLAC_HEADER = [0x66, 0x4c, 0x61, 0x43];
export const MP3_HEADER = [0x49, 0x44, 0x33];
export const OGG_HEADER = [0x4f, 0x67, 0x67, 0x53];
export const M4A_HEADER = [0x66, 0x74, 0x79, 0x70];
//prettier-ignore
export const WMA_HEADER = [
  0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11,
  0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
];
export const WAV_HEADER = [0x52, 0x49, 0x46, 0x46];
export const AAC_HEADER = [0xff, 0xf1];
export const DFF_HEADER = [0x46, 0x52, 0x4d, 0x38];

export const AudioMimeType: { [key: string]: string } = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wma: 'audio/x-ms-wma',
  wav: 'audio/x-wav',
  dff: 'audio/x-dff',
};

export function BytesHasPrefix(data: Uint8Array, prefix: number[]): boolean {
  if (prefix.length > data.length) return false;
  return prefix.every((val, idx) => {
    return val === data[idx];
  });
}

export function BytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => {
    return val === b[idx];
  });
}

export function SniffAudioExt(data: Uint8Array, fallback_ext: string = 'mp3'): string {
  if (BytesHasPrefix(data, MP3_HEADER)) return 'mp3';
  if (BytesHasPrefix(data, FLAC_HEADER)) return 'flac';
  if (BytesHasPrefix(data, OGG_HEADER)) return 'ogg';
  if (data.length >= 4 + M4A_HEADER.length && BytesHasPrefix(data.slice(4), M4A_HEADER)) return 'm4a';
  if (BytesHasPrefix(data, WAV_HEADER)) return 'wav';
  if (BytesHasPrefix(data, WMA_HEADER)) return 'wma';
  if (BytesHasPrefix(data, AAC_HEADER)) return 'aac';
  if (BytesHasPrefix(data, DFF_HEADER)) return 'dff';
  return fallback_ext;
}

export function GetArrayBuffer(obj: Blob): Promise<ArrayBuffer> {
  if (!!obj.arrayBuffer) return obj.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rs = e.target?.result;
      if (!rs) {
        reject('read file failed');
      } else {
        resolve(rs as ArrayBuffer);
      }
    };
    reader.readAsArrayBuffer(obj);
  });
}

export function GetCoverFromFile(metadata: IAudioMetadata): string {
  if (metadata.common?.picture && metadata.common.picture.length > 0) {
    return URL.createObjectURL(
      new Blob([metadata.common.picture[0].data], { type: metadata.common.picture[0].format }),
    );
  }
  return '';
}

export interface IMusicMetaBasic {
  title: string;
  artist?: string;
}

export function GetMetaFromFile(
  filename: string,
  exist_title?: string,
  exist_artist?: string,
  separator = '-',
): IMusicMetaBasic {
  const meta: IMusicMetaBasic = { title: exist_title ?? '', artist: exist_artist };

  const items = filename.split(separator);
  if (items.length > 1) {
    if (!meta.artist) meta.artist = items[0].trim();
    if (!meta.title) meta.title = items[1].trim();
  } else if (items.length === 1) {
    if (!meta.title) meta.title = items[0].trim();
  }
  return meta;
}

/** 封面过大时逐步缩小（替代 unlock-music 中的 jimp，便于 Electron 打包） */
export async function shrinkCoverIfNeeded(image: {
  mime: string
  buffer: ArrayBuffer
}): Promise<void> {
  const maxBytes = 1 << 24
  while (image.buffer.byteLength >= maxBytes) {
    const blob = new Blob([image.buffer], { type: image.mime })
    const bitmap = await createImageBitmap(blob)
    const w = Math.max(1, Math.round(bitmap.width / 2))
    const h = Math.max(1, Math.round(bitmap.height / 2))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      break
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    )
    if (!out) break
    image.buffer = await out.arrayBuffer()
    image.mime = 'image/jpeg'
  }
}

export async function GetImageFromURL(
  src: string,
): Promise<{ mime: string; buffer: ArrayBuffer; url: string } | undefined> {
  try {
    const resp = await fetch(src);
    const mime = resp.headers.get('Content-Type');
    if (mime?.startsWith('image/')) {
      const buffer = await resp.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
      return { buffer, url, mime };
    }
  } catch (e) {
    console.warn(e);
  }
}

export interface IMusicMeta {
  title: string;
  artists?: string[];
  album?: string;
  albumartist?: string;
  genre?: string[];
  year?: number;
  date?: string;
  trackNo?: number | null;
  trackOf?: number | null;
  diskNo?: number | null;
  diskOf?: number | null;
  comment?: string[];
  lyrics?: string[];
  composer?: string[];
  lyricist?: string[];
  conductor?: string[];
  remixer?: string[];
  producer?: string[];
  label?: string[];
  grouping?: string;
  subtitle?: string[];
  bpm?: number;
  catalognumber?: string[];
  picture?: ArrayBuffer;
  picture_desc?: string;
}

const MP3_META_FRAME_IDS = new Set([
  'TPE1',
  'TIT2',
  'TALB',
  'TPE2',
  'TCON',
  'TYER',
  'TDRC',
  'TRCK',
  'TPOS',
  'COMM',
  'USLT',
  'TCOM',
  'TBPM',
  'TPUB',
  'APIC'
]);

function nonEmptyString(...values: (string | undefined | null)[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function mergeStringLists(...sources: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of sources) {
    if (!source?.length) continue;
    for (const item of source) {
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export function splitArtistText(text?: string): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/[;,/|、·]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function pictureDataToArrayBuffer(data: Buffer | Uint8Array): ArrayBuffer {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Uint8Array.from(buf).buffer;
}

function buildMusicMetaExplicitOnly(
  explicit: Partial<IMusicMeta> & { artist?: string }
): IMusicMeta {
  return {
    title: explicit.title?.trim() ?? '',
    artists: mergeStringLists(explicit.artists, splitArtistText(explicit.artist)),
    album: nonEmptyString(explicit.album),
    albumartist: nonEmptyString(explicit.albumartist),
    genre: mergeStringLists(explicit.genre),
    year: explicit.year,
    date: nonEmptyString(explicit.date),
    trackNo: explicit.trackNo ?? undefined,
    trackOf: explicit.trackOf ?? undefined,
    diskNo: explicit.diskNo ?? undefined,
    diskOf: explicit.diskOf ?? undefined,
    comment: mergeStringLists(explicit.comment),
    lyrics: mergeStringLists(explicit.lyrics),
    composer: mergeStringLists(explicit.composer),
    lyricist: mergeStringLists(explicit.lyricist),
    conductor: mergeStringLists(explicit.conductor),
    remixer: mergeStringLists(explicit.remixer),
    producer: mergeStringLists(explicit.producer),
    label: mergeStringLists(explicit.label),
    grouping: nonEmptyString(explicit.grouping),
    subtitle: mergeStringLists(explicit.subtitle),
    bpm: explicit.bpm,
    catalognumber: mergeStringLists(explicit.catalognumber),
    picture: explicit.picture,
    picture_desc: explicit.picture_desc
  };
}

/** 合并解密结果、显式字段与解析出的内嵌标签（显式字段优先，避免重复） */
export function buildMusicMetaFromSources(
  explicit: Partial<IMusicMeta> & { artist?: string },
  parsed: IAudioMetadata,
  replaceExisting = false
): IMusicMeta {
  if (replaceExisting) {
    return buildMusicMetaExplicitOnly(explicit);
  }

  const common = parsed.common;
  const artists = mergeStringLists(
    explicit.artists,
    splitArtistText(explicit.artist),
    common.artists,
    splitArtistText(common.artist)
  );

  let picture = explicit.picture;
  if (!picture && common.picture?.[0]?.data) {
    picture = pictureDataToArrayBuffer(common.picture[0].data);
  }

  return {
    title: nonEmptyString(explicit.title, common.title) ?? '',
    artists,
    album: nonEmptyString(explicit.album, common.album),
    albumartist: nonEmptyString(explicit.albumartist, common.albumartist),
    genre: mergeStringLists(explicit.genre, common.genre),
    year: explicit.year ?? common.year ?? common.originalyear,
    date: nonEmptyString(explicit.date, common.date, common.originaldate),
    trackNo: explicit.trackNo ?? common.track?.no ?? undefined,
    trackOf: explicit.trackOf ?? common.track?.of ?? undefined,
    diskNo: explicit.diskNo ?? common.disk?.no ?? undefined,
    diskOf: explicit.diskOf ?? common.disk?.of ?? undefined,
    comment: mergeStringLists(explicit.comment, common.comment, common.description),
    lyrics: mergeStringLists(explicit.lyrics, common.lyrics),
    composer: mergeStringLists(explicit.composer, common.composer),
    lyricist: mergeStringLists(explicit.lyricist, common.lyricist),
    conductor: mergeStringLists(explicit.conductor, common.conductor),
    remixer: mergeStringLists(explicit.remixer, common.remixer),
    producer: mergeStringLists(explicit.producer, common.producer),
    label: mergeStringLists(explicit.label, common.label),
    grouping: nonEmptyString(explicit.grouping, common.grouping),
    subtitle: mergeStringLists(explicit.subtitle, common.subtitle),
    bpm: explicit.bpm ?? common.bpm,
    catalognumber: mergeStringLists(explicit.catalognumber, common.catalognumber),
    picture,
    picture_desc: explicit.picture_desc
  };
}

function formatTrackNumber(no?: number | null, of?: number | null): string | undefined {
  if (no == null || no <= 0) return undefined;
  if (of != null && of > 0) return `${no}/${of}`;
  return String(no);
}

function setFlacTags(writer: MetaFlac, key: string, values: string[] | undefined): void {
  if (!values?.length) return;
  try {
    writer.removeTag(key);
  } catch {
    /* 标签不存在时忽略 */
  }
  for (const value of values) {
    writer.setTag(`${key}=${value}`);
  }
}

const MANAGED_FLAC_TAG_KEYS = [
  'TITLE',
  'ARTIST',
  'ALBUM',
  'ALBUMARTIST',
  'GENRE',
  'DATE',
  'TRACKNUMBER',
  'TRACKTOTAL',
  'DISCNUMBER',
  'DISCTOTAL',
  'COMMENT',
  'LYRICS',
  'COMPOSER',
  'LYRICIST',
  'CONDUCTOR',
  'REMIXER',
  'PRODUCER',
  'LABEL',
  'GROUPING',
  'SUBTITLE',
  'CATALOGNUMBER',
  'BPM'
] as const;

function clearManagedFlacTags(writer: MetaFlac): void {
  for (const key of MANAGED_FLAC_TAG_KEYS) {
    try {
      writer.removeTag(key);
    } catch {
      /* ignore */
    }
  }
}

function setFlacTag(writer: MetaFlac, key: string, value?: string): void {
  if (!value?.trim()) return;
  try {
    writer.removeTag(key);
  } catch {
    /* ignore */
  }
  writer.setTag(`${key}=${value.trim()}`);
}

function nodeBufferToArrayBuffer(data: Buffer): ArrayBuffer {
  const copy = Buffer.from(data);
  return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
}

export function WriteMetaToMp3(
  audioData: Buffer,
  info: IMusicMeta,
  original: IAudioMetadata,
  replaceExisting = false
): Buffer {
  const meta = buildMusicMetaFromSources(info, original, replaceExisting);
  const writer = new ID3Writer(nodeBufferToArrayBuffer(audioData));

  if (!replaceExisting) {
    const frames =
      original.native['ID3v2.4'] ||
      original.native['ID3v2.3'] ||
      original.native['ID3v2.2'] ||
      [];
    frames.forEach((frame) => {
      if (!MP3_META_FRAME_IDS.has(frame.id)) {
        try {
          writer.setFrame(frame.id, frame.value);
        } catch {
          /* 保留其它原生帧 */
        }
      }
    });
  }

  if (meta.artists?.length) writer.setFrame('TPE1', meta.artists);
  if (meta.title) writer.setFrame('TIT2', meta.title);
  if (meta.album) writer.setFrame('TALB', meta.album);
  if (meta.albumartist) writer.setFrame('TPE2', meta.albumartist);
  if (meta.genre?.length) writer.setFrame('TCON', meta.genre);
  const year =
    meta.year ?? (meta.date && /^\d{4}/.test(meta.date) ? Number(meta.date.slice(0, 4)) : undefined);
  if (year) writer.setFrame('TYER', String(year));
  const trck = formatTrackNumber(meta.trackNo, meta.trackOf);
  if (trck) writer.setFrame('TRCK', trck);
  const tpos = formatTrackNumber(meta.diskNo, meta.diskOf);
  if (tpos) writer.setFrame('TPOS', tpos);
  if (meta.composer?.length) writer.setFrame('TCOM', meta.composer);
  if (meta.bpm) writer.setFrame('TBPM', String(meta.bpm));
  if (meta.label?.[0]) writer.setFrame('TPUB', meta.label[0]);
  if (meta.comment?.length) {
    writer.setFrame('COMM', {
      description: '',
      text: meta.comment.join('\n'),
      language: 'eng'
    });
  }
  if (meta.lyrics?.length) {
    writer.setFrame('USLT', {
      description: '',
      lyrics: meta.lyrics.join('\n\n'),
      language: 'eng'
    });
  }
  if (meta.picture?.byteLength) {
    writer.setFrame('APIC', {
      type: 3,
      data: meta.picture,
      description: meta.picture_desc || ''
    });
  }
  return Buffer.from(writer.addTag());
}

export function WriteMetaToFlac(
  audioData: Buffer,
  info: IMusicMeta,
  original: IAudioMetadata,
  replaceExisting = false
): Buffer {
  const meta = buildMusicMetaFromSources(info, original, replaceExisting);
  const writer = new MetaFlac(audioData);
  clearManagedFlacTags(writer);

  setFlacTag(writer, 'TITLE', meta.title);
  setFlacTags(writer, 'ARTIST', meta.artists);
  setFlacTag(writer, 'ALBUM', meta.album);
  setFlacTag(writer, 'ALBUMARTIST', meta.albumartist);
  setFlacTags(writer, 'GENRE', meta.genre);
  if (meta.date) setFlacTag(writer, 'DATE', meta.date);
  else if (meta.year) setFlacTag(writer, 'DATE', String(meta.year));
  const track = formatTrackNumber(meta.trackNo, meta.trackOf);
  if (track) {
    const [no, of] = track.includes('/') ? track.split('/') : [track, ''];
    setFlacTag(writer, 'TRACKNUMBER', no);
    if (of) setFlacTag(writer, 'TRACKTOTAL', of);
  }
  const disc = formatTrackNumber(meta.diskNo, meta.diskOf);
  if (disc) {
    const [no, of] = disc.includes('/') ? disc.split('/') : [disc, ''];
    setFlacTag(writer, 'DISCNUMBER', no);
    if (of) setFlacTag(writer, 'DISCTOTAL', of);
  }
  setFlacTags(writer, 'COMMENT', meta.comment);
  if (meta.lyrics?.length) setFlacTag(writer, 'LYRICS', meta.lyrics.join('\n\n'));
  setFlacTags(writer, 'COMPOSER', meta.composer);
  setFlacTags(writer, 'LYRICIST', meta.lyricist);
  setFlacTags(writer, 'CONDUCTOR', meta.conductor);
  setFlacTags(writer, 'REMIXER', meta.remixer);
  setFlacTags(writer, 'PRODUCER', meta.producer);
  setFlacTags(writer, 'LABEL', meta.label);
  setFlacTag(writer, 'GROUPING', meta.grouping);
  setFlacTags(writer, 'SUBTITLE', meta.subtitle);
  setFlacTags(writer, 'CATALOGNUMBER', meta.catalognumber);
  if (meta.bpm) setFlacTag(writer, 'BPM', String(meta.bpm));
  if (meta.picture) {
    writer.importPictureFromBuffer(Buffer.from(meta.picture));
  }
  return writer.save();
}

/** 将解密结果中的元数据写入 mp3/flac 文件体 */
export async function embedDecryptMetadata(
  result: DecryptResult
): Promise<DecryptResult> {
  const ext = result.ext?.toLowerCase();
  if (ext !== 'mp3' && ext !== 'flac') return result;

  let parsed: IAudioMetadata;
  try {
    parsed = await metaParseBlob(result.blob);
  } catch (e) {
    console.warn('parse decrypted audio failed, skip metadata embed.', e);
    return result;
  }

  let picture: ArrayBuffer | undefined;
  if (result.picture?.startsWith('blob:')) {
    try {
      const resp = await fetch(result.picture);
      picture = await resp.arrayBuffer();
    } catch {
      /* 封面拉取失败时跳过 */
    }
  }

  const common = parsed.common;
  const hasEmbeddedTags = !!(common.album || common.artists?.length || common.title);
  // 对齐 UM：音频已有标签且无封面时，不再重复写入
  if (hasEmbeddedTags && !picture) return result;

  const explicit: Partial<IMusicMeta> = {
    title: result.title,
    album: result.album,
    artists: splitArtistText(result.artist),
    picture
  };
  const merged = buildMusicMetaFromSources(explicit, parsed);

  try {
    const buffer = Buffer.from(await result.blob.arrayBuffer());
    const tagged =
      ext === 'mp3'
        ? WriteMetaToMp3(buffer, merged, parsed)
        : WriteMetaToFlac(buffer, merged, parsed);
    const blob = new Blob([tagged], { type: result.mime });
    const oldFile = result.file;
    const next: DecryptResult = {
      ...result,
      blob,
      file: URL.createObjectURL(blob)
    };
    if (oldFile?.startsWith('blob:')) URL.revokeObjectURL(oldFile);
    return next;
  } catch (e) {
    console.warn('embed metadata failed, skip.', e);
    return result;
  }
}

export function SplitFilename(n: string): { name: string; ext: string } {
  const pos = n.lastIndexOf('.');
  return {
    ext: n.substring(pos + 1).toLowerCase(),
    name: n.substring(0, pos),
  };
}
