import { IAudioMetadata, parseBlob as metaParseBlob } from 'music-metadata-browser';
import ID3Writer from 'browser-id3-writer';
import MetaFlac from 'metaflac-js';
import type { DecryptResult } from '@unlock/decrypt/entity';
import {
  rebuildFlacWithVorbisTags,
  validateFlacBufferStructure,
  flacVorbisField,
  type FlacCoverWriteMode
} from './flacRewrite';
import {
  readUnmanagedVorbisCommentsFromBuffer,
  rebuildOggWithVorbisComments
} from './oggRewrite';
import {
  collectItunesIlstFields,
  readUnmanagedItunesTagsFromBuffer,
  rebuildMp4WithItunesTags
} from './mp4Rewrite';

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
  'ARTISTS',
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

export interface ExtraNativeTagWriteEntry {
  tagKey: string;
  value: string;
  source: 'native' | 'common' | 'musicbrainz';
}

/** 去掉文件头 ID3v2 标签，返回 MP3 音频主体（replaceExisting 写入前使用） */
function isValidId3v2SyncsafeSizeByte(byte: number): boolean {
  return (byte & 0x80) === 0;
}

function stripId3v2FromMp3Buffer(buffer: Buffer): Buffer {
  if (buffer.length < 10) return buffer;
  if (buffer.toString('ascii', 0, 3) !== 'ID3') return buffer;

  if (
    !isValidId3v2SyncsafeSizeByte(buffer[6]!) ||
    !isValidId3v2SyncsafeSizeByte(buffer[7]!) ||
    !isValidId3v2SyncsafeSizeByte(buffer[8]!) ||
    !isValidId3v2SyncsafeSizeByte(buffer[9]!)
  ) {
    return buffer;
  }

  const size =
    ((buffer[6]! & 0x7f) << 21) |
    ((buffer[7]! & 0x7f) << 14) |
    ((buffer[8]! & 0x7f) << 7) |
    (buffer[9]! & 0x7f);
  const end = 10 + size;
  if (end <= 10 || end >= buffer.length) return buffer;
  return buffer.subarray(end);
}

const ID3V1_TAG_SIZE = 128;
const ID3V1_EXTENDED_TAG_SIZE = 227;

/** 去掉文件尾 ID3v1 / ID3v1.1（TAG / TAG+）块 */
export function stripId3v1FromMp3Buffer(buffer: Buffer): Buffer {
  if (buffer.length < ID3V1_TAG_SIZE) return buffer;

  let end = buffer.length;
  if (
    buffer.length >= ID3V1_EXTENDED_TAG_SIZE &&
    buffer.subarray(end - ID3V1_EXTENDED_TAG_SIZE, end - ID3V1_EXTENDED_TAG_SIZE + 4).toString('ascii') === 'TAG+'
  ) {
    end -= ID3V1_EXTENDED_TAG_SIZE;
  } else if (
    buffer.subarray(end - ID3V1_TAG_SIZE, end - ID3V1_TAG_SIZE + 3).toString('ascii') === 'TAG'
  ) {
    end -= ID3V1_TAG_SIZE;
  }

  return end < buffer.length ? buffer.subarray(0, end) : buffer;
}

function mp3BodyForTagWriter(audioData: Buffer, replaceExisting: boolean): Buffer {
  const withoutV1 = stripId3v1FromMp3Buffer(audioData);
  return replaceExisting ? stripId3v2FromMp3Buffer(withoutV1) : withoutV1;
}

function applyExtraNativeTagEntriesToMp3Writer(
  writer: ID3Writer,
  entries: ExtraNativeTagWriteEntry[]
): void {
  for (const entry of entries) {
    const frameId = entry.tagKey.trim().toUpperCase();
    const value = entry.value.trim();
    if (!frameId || !value) continue;

    try {
      if (entry.source === 'native') {
        writer.setFrame(frameId, value);
      } else {
        writer.setFrame('TXXX', {
          description: frameId,
          value
        });
      }
    } catch {
      /* 不支持的帧类型时跳过 */
    }
  }
}

export function WriteMetaToMp3(
  audioData: Buffer,
  info: IMusicMeta,
  original: IAudioMetadata,
  replaceExisting = false,
  extraTags: ExtraNativeTagWriteEntry[] = []
): Buffer {
  const meta = buildMusicMetaFromSources(info, original, replaceExisting);
  const mp3Body = mp3BodyForTagWriter(audioData, replaceExisting);
  const writer = new ID3Writer(nodeBufferToArrayBuffer(mp3Body));

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
  applyExtraNativeTagEntriesToMp3Writer(writer, extraTags);
  return Buffer.from(writer.addTag());
}

function pushFlacComments(
  out: string[],
  key: string,
  values: string[] | undefined
): void {
  if (!values?.length) return;
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.push(flacVorbisField(key, trimmed));
  }
}

function pushFlacComment(out: string[], key: string, value?: string): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  out.push(flacVorbisField(key, trimmed));
}

function collectFlacVorbisComments(
  meta: IMusicMeta,
  extraTags: ExtraNativeTagWriteEntry[]
): string[] {
  const out: string[] = [];

  pushFlacComment(out, 'TITLE', meta.title);
  pushFlacComments(out, 'ARTIST', meta.artists);
  pushFlacComment(out, 'ALBUM', meta.album);
  pushFlacComment(out, 'ALBUMARTIST', meta.albumartist);
  pushFlacComments(out, 'GENRE', meta.genre);
  if (meta.date) pushFlacComment(out, 'DATE', meta.date);
  else if (meta.year) pushFlacComment(out, 'DATE', String(meta.year));

  const track = formatTrackNumber(meta.trackNo, meta.trackOf);
  if (track) {
    const [no, of] = track.includes('/') ? track.split('/') : [track, ''];
    pushFlacComment(out, 'TRACKNUMBER', no);
    if (of) pushFlacComment(out, 'TRACKTOTAL', of);
  }

  const disc = formatTrackNumber(meta.diskNo, meta.diskOf);
  if (disc) {
    const [no, of] = disc.includes('/') ? disc.split('/') : [disc, ''];
    pushFlacComment(out, 'DISCNUMBER', no);
    if (of) pushFlacComment(out, 'DISCTOTAL', of);
  }

  pushFlacComments(out, 'COMMENT', meta.comment);
  if (meta.lyrics?.length) {
    pushFlacComment(out, 'LYRICS', meta.lyrics.join('\n\n'));
  }
  pushFlacComments(out, 'COMPOSER', meta.composer);
  pushFlacComments(out, 'LYRICIST', meta.lyricist);
  pushFlacComments(out, 'CONDUCTOR', meta.conductor);
  pushFlacComments(out, 'REMIXER', meta.remixer);
  pushFlacComments(out, 'PRODUCER', meta.producer);
  pushFlacComments(out, 'LABEL', meta.label);
  pushFlacComment(out, 'GROUPING', meta.grouping);
  pushFlacComments(out, 'SUBTITLE', meta.subtitle);
  pushFlacComments(out, 'CATALOGNUMBER', meta.catalognumber);
  if (meta.bpm) pushFlacComment(out, 'BPM', String(meta.bpm));

  const grouped = new Map<string, string[]>();
  for (const entry of extraTags) {
    const key = entry.tagKey.trim().toUpperCase();
    const value = entry.value.trim();
    if (!key || !value) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(value);
  }
  for (const [key, values] of grouped) {
    pushFlacComments(out, key, values);
  }

  return out;
}

export type { FlacCoverWriteMode };

const DEFAULT_FLAC_PADDING_BYTES = 4096;

type MetaFlacInternal = MetaFlac & {
  padding: Buffer | null
  pictures: Buffer[]
  picturesSpecs: unknown[]
  picturesDatas: Buffer[]
};

function ensureMetaFlacPadding(writer: MetaFlac): void {
  const w = writer as MetaFlacInternal;
  if (w.padding == null || w.padding.length < DEFAULT_FLAC_PADDING_BYTES) {
    w.padding = Buffer.alloc(
      w.padding?.length
        ? Math.max(w.padding.length, DEFAULT_FLAC_PADDING_BYTES)
        : DEFAULT_FLAC_PADDING_BYTES
    );
  }
}

function clearFlacPictures(writer: MetaFlac): void {
  const w = writer as MetaFlacInternal;
  w.pictures = [];
  w.picturesSpecs = [];
  w.picturesDatas = [];
}

export function WriteMetaToFlac(
  audioData: Buffer,
  info: IMusicMeta,
  original: IAudioMetadata,
  replaceExisting = false,
  extraTags: ExtraNativeTagWriteEntry[] = [],
  coverMode: FlacCoverWriteMode = 'preserve'
): Buffer {
  const meta = buildMusicMetaFromSources(info, original, replaceExisting);

  if (replaceExisting) {
    const comments = collectFlacVorbisComments(meta, extraTags);
    const picture =
      coverMode === 'replace' && meta.picture?.byteLength
        ? Buffer.from(meta.picture)
        : undefined;
    return rebuildFlacWithVorbisTags(audioData, comments, {
      coverMode,
      picture
    });
  }

  const writer = new MetaFlac(audioData);
  ensureMetaFlacPadding(writer);
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

  if (extraTags.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const entry of extraTags) {
      const key = entry.tagKey.trim().toUpperCase();
      const value = entry.value.trim();
      if (!key || !value) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(value);
    }
    for (const [key, values] of grouped) {
      setFlacTags(writer, key, values);
    }
  }

  if (meta.picture?.byteLength) {
    try {
      clearFlacPictures(writer);
      writer.importPictureFromBuffer(Buffer.from(meta.picture));
    } catch {
      /* 封面写入失败时仍保留其它标签 */
    }
  }

  return writer.save();
}

export function WriteMetaToOgg(
  audioData: Buffer,
  info: IMusicMeta,
  original: IAudioMetadata,
  replaceExisting = false,
  extraTags: ExtraNativeTagWriteEntry[] = []
): Buffer {
  const meta = buildMusicMetaFromSources(info, original, replaceExisting);
  const comments = collectFlacVorbisComments(meta, extraTags);

  return rebuildOggWithVorbisComments(audioData, comments, {
    preserveUnmanaged: replaceExisting
      ? undefined
      : readUnmanagedVorbisCommentsFromBuffer(audioData)
  });
}

export function WriteMetaToM4a(
  audioData: Buffer,
  info: IMusicMeta,
  original: IAudioMetadata,
  replaceExisting = false,
  extraTags: ExtraNativeTagWriteEntry[] = []
): Buffer {
  const meta = buildMusicMetaFromSources(info, original, replaceExisting);
  const fields = collectItunesIlstFields(meta, extraTags);

  return rebuildMp4WithItunesTags(audioData, fields, {
    preserveUnmanaged: replaceExisting
      ? undefined
      : readUnmanagedItunesTagsFromBuffer(audioData)
  });
}

/** 在已写入常规标签的 FLAC 上追加 / 覆盖非托管或额外标签 */
export function applyExtraTagsToFlacBuffer(
  audioData: Buffer,
  entries: ExtraNativeTagWriteEntry[]
): Buffer {
  if (!entries.length) return audioData;

  const writer = new MetaFlac(audioData);
  ensureMetaFlacPadding(writer);
  const grouped = new Map<string, string[]>();

  for (const entry of entries) {
    const key = entry.tagKey.trim().toUpperCase();
    const value = entry.value.trim();
    if (!key || !value) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(value);
  }

  for (const [key, values] of grouped) {
    setFlacTags(writer, key, values);
  }

  return writer.save();
}

/** 在已写入常规标签的 MP3 上追加 / 覆盖非托管或额外标签（需先剥离已有 ID3） */
export function applyExtraTagsToMp3Buffer(
  audioData: Buffer,
  entries: ExtraNativeTagWriteEntry[]
): Buffer {
  if (!entries.length) return audioData;

  const mp3Body = mp3BodyForTagWriter(audioData, true);
  const writer = new ID3Writer(nodeBufferToArrayBuffer(mp3Body));

  applyExtraNativeTagEntriesToMp3Writer(writer, entries);

  return Buffer.from(writer.addTag());
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
