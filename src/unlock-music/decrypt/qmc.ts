import { QmcMapCipher, QmcRC4Cipher, QmcStaticCipher, QmcStreamCipher } from './qmc_cipher';
import {
  AudioMimeType,
  BytesHasPrefix,
  FLAC_HEADER,
  GetArrayBuffer,
  MP3_HEADER,
  OGG_HEADER,
  SniffAudioExt,
} from '@unlock/decrypt/utils';

import { DecryptResult } from '@unlock/decrypt/entity';
import { QmcDeriveKey } from '@unlock/decrypt/qmc_key';
import {
  formatUnsupportedQmcMessage,
  inspectQmcFooter,
  logQmcFooterDebug,
} from '@unlock/decrypt/qmc_footer';
import { DecryptQmc2Wasm, DecryptQmcWasm } from '@unlock/decrypt/qmc_wasm';
import { extractQQMusicMeta } from '@unlock/utils/qm_meta';

interface Handler {
  ext: string;
  version: number;
}

export const HandlerMap: { [key: string]: Handler } = {
  mgg: { ext: 'ogg', version: 2 },
  mgg0: { ext: 'ogg', version: 2 },
  mggl: { ext: 'ogg', version: 2 },
  mgg1: { ext: 'ogg', version: 2 },
  mflac: { ext: 'flac', version: 2 },
  mflac0: { ext: 'flac', version: 2 },
  mmp4: { ext: 'mp4', version: 2 },

  // qmcflac / qmcogg:
  // 有可能是 v2 加密但混用同一个后缀名。
  qmcflac: { ext: 'flac', version: 2 },
  qmcogg: { ext: 'ogg', version: 2 },

  qmc0: { ext: 'mp3', version: 2 },
  qmc2: { ext: 'ogg', version: 2 },
  qmc3: { ext: 'mp3', version: 2 },
  qmc4: { ext: 'ogg', version: 2 },
  qmc6: { ext: 'ogg', version: 2 },
  qmc8: { ext: 'ogg', version: 2 },
  bkcmp3: { ext: 'mp3', version: 1 },
  bkcm4a: { ext: 'm4a', version: 1 },
  bkcflac: { ext: 'flac', version: 1 },
  bkcwav: { ext: 'wav', version: 1 },
  bkcape: { ext: 'ape', version: 1 },
  bkcogg: { ext: 'ogg', version: 1 },
  bkcwma: { ext: 'wma', version: 1 },
  tkm: { ext: 'm4a', version: 1 },
  '666c6163': { ext: 'flac', version: 1 },
  '6d7033': { ext: 'mp3', version: 1 },
  '6f6767': { ext: 'ogg', version: 1 },
  '6d3461': { ext: 'm4a', version: 1 },
  '776176': { ext: 'wav', version: 1 },
};

export async function Decrypt(file: Blob, raw_filename: string, raw_ext: string): Promise<DecryptResult> {
  if (!(raw_ext in HandlerMap)) throw `Qmc cannot handle type: ${raw_ext}`;
  const handler = HandlerMap[raw_ext];
  let { version } = handler;

  const fileBuffer = await GetArrayBuffer(file);
  const fileBytes = new Uint8Array(fileBuffer);
  let musicDecoded: Uint8Array | undefined;
  let musicID: number | string | undefined;

  // 已是明文音频（误标扩展名或重复解密）
  const sniffed = SniffAudioExt(fileBytes, '');
  if (
    sniffed &&
    (BytesHasPrefix(fileBytes, FLAC_HEADER) ||
      BytesHasPrefix(fileBytes, MP3_HEADER) ||
      BytesHasPrefix(fileBytes, OGG_HEADER))
  ) {
    console.log('qmc: input already plain %s, skip decrypt', sniffed);
    musicDecoded = fileBytes;
  }

  let wasmError: string | undefined;
  const footer = inspectQmcFooter(fileBytes);

  if (!musicDecoded && version === 2 && globalThis.WebAssembly) {
    console.log('qmc: using xhacker wasm decoder');
    const xhackerDecrypted = await DecryptQmcWasm(fileBuffer, raw_ext);
    if (xhackerDecrypted.success) {
      musicDecoded = xhackerDecrypted.data;
      musicID = xhackerDecrypted.songId;
    } else {
      wasmError = xhackerDecrypted.error || '(no error)';
      console.warn('qmc wasm failed with error %s, trying qmc2-crypto', wasmError);

      const qmc2Decrypted = await DecryptQmc2Wasm(fileBuffer);
      if (qmc2Decrypted.success) {
        musicDecoded = qmc2Decrypted.data;
        musicID = qmc2Decrypted.songId;
        wasmError = undefined;
      } else {
        wasmError = qmc2Decrypted.error || wasmError;
        console.warn('qmc2-wasm failed with error %s', wasmError);
        logQmcFooterDebug(fileBytes, raw_filename);
      }
    }
  }

  if (!musicDecoded) {
    // 新客户端加密：尾标非 QTag/v1，JS 静态解密只会产生杂音
    if (footer.kind === 'unknown' && version === 2) {
      throw formatUnsupportedQmcMessage(footer, raw_ext, wasmError);
    }

    console.log('qmc: using js decoder');
    try {
      const d = new QmcDecoder(fileBytes);
      musicDecoded = d.decrypt();
      musicID = d.songID;
    } catch (jsErr) {
      const jsMsg = jsErr instanceof Error ? jsErr.message : String(jsErr);
      if (footer.kind === 'STag') {
        throw formatUnsupportedQmcMessage(footer, raw_ext, jsMsg);
      }
      throw jsMsg;
    }
  }

  const ext = SniffAudioExt(musicDecoded, handler.ext);
  const mime = AudioMimeType[ext];

  const { album, artist, imgUrl, blob, title } = await extractQQMusicMeta(
    new Blob([musicDecoded], { type: mime }),
    raw_filename,
    ext,
    musicID,
  );

  return {
    title: title,
    artist: artist,
    ext: ext,
    album: album,
    picture: imgUrl,
    file: URL.createObjectURL(blob),
    blob: blob,
    mime: mime,
  };
}

export class QmcDecoder {
  private static readonly BYTE_COMMA = ','.charCodeAt(0);
  private readonly file: Uint8Array;
  private readonly size: number;
  private decoded: boolean = false;
  private audioSize?: number;
  private cipher?: QmcStreamCipher;

  public constructor(file: Uint8Array) {
    this.file = file;
    this.size = file.length;
    this.searchKey();
  }

  private _songID?: number;

  public get songID() {
    return this._songID;
  }

  public decrypt(): Uint8Array {
    if (!this.cipher) {
      throw new Error('no cipher found');
    }
    if (!this.audioSize || this.audioSize <= 0) {
      throw new Error('invalid audio size');
    }
    const audioBuf = this.file.subarray(0, this.audioSize);

    if (!this.decoded) {
      this.cipher.decrypt(audioBuf, 0);
      this.decoded = true;
    }

    return audioBuf;
  }

  private searchKey() {
    const last4Byte = this.file.slice(-4);
    const textEnc = new TextDecoder();
    const tailTag = textEnc.decode(last4Byte);
    if (tailTag === 'QTag' || tailTag === 'STag') {
      const sizeBuf = this.file.slice(-8, -4);
      const sizeView = new DataView(sizeBuf.buffer, sizeBuf.byteOffset);
      const keySize = sizeView.getUint32(0, false);
      this.audioSize = this.size - keySize - 8;

      const rawKey = this.file.subarray(this.audioSize, this.size - 8);
      const keyEnd = rawKey.findIndex((v) => v == QmcDecoder.BYTE_COMMA);
      if (keyEnd < 0) {
        throw new Error('invalid key: search raw key failed');
      }
      this.setCipher(rawKey.subarray(0, keyEnd));

      const idBuf = rawKey.subarray(keyEnd + 1);
      const idEnd = idBuf.findIndex((v) => v == QmcDecoder.BYTE_COMMA);
      if (keyEnd < 0) {
        throw new Error('invalid key: search song id failed');
      }
      this._songID = parseInt(textEnc.decode(idBuf.subarray(0, idEnd)), 10);
    } else {
      const sizeView = new DataView(last4Byte.buffer, last4Byte.byteOffset);
      const keySize = sizeView.getUint32(0, true);
      if (keySize < 0x300) {
        this.audioSize = this.size - keySize - 4;
        const rawKey = this.file.subarray(this.audioSize, this.size - 4);
        this.setCipher(rawKey);
      } else {
        this.audioSize = this.size;
        this.cipher = new QmcStaticCipher();
      }
    }
  }

  private setCipher(keyRaw: Uint8Array) {
    const keyDec = QmcDeriveKey(keyRaw);
    if (keyDec.length > 300) {
      this.cipher = new QmcRC4Cipher(keyDec);
    } else {
      this.cipher = new QmcMapCipher(keyDec);
    }
  }
}
