import { Decrypt as NcmDecrypt } from '@unlock/decrypt/ncm';
import { Decrypt as NcmCacheDecrypt } from '@unlock/decrypt/ncmcache';
import { Decrypt as XmDecrypt } from '@unlock/decrypt/xm';
import { Decrypt as QmcDecrypt } from '@unlock/decrypt/qmc';
import { Decrypt as QmcCacheDecrypt } from '@unlock/decrypt/qmccache';
import { Decrypt as KgmDecrypt } from '@unlock/decrypt/kgm';
import { Decrypt as KwmDecrypt } from '@unlock/decrypt/kwm';
import { Decrypt as RawDecrypt } from '@unlock/decrypt/raw';
import { Decrypt as TmDecrypt } from '@unlock/decrypt/tm';
import { Decrypt as JooxDecrypt } from '@unlock/decrypt/joox';
import { DecryptResult, FileInfo } from '@unlock/decrypt/entity';
import { SplitFilename } from '@unlock/decrypt/utils';
import { storage } from '@unlock/utils/storage';
import InMemoryStorage from '@unlock/utils/storage/InMemoryStorage';

export async function Decrypt(file: FileInfo, config: Record<string, any>): Promise<DecryptResult> {
  // Worker thread will fallback to in-memory storage.
  if (storage instanceof InMemoryStorage) {
    await storage.setAll(config);
  }

  const raw = SplitFilename(file.name);
  let rt_data: DecryptResult;
  switch (raw.ext) {
    case 'ncm': // Netease Mp3/Flac
      rt_data = await NcmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'uc': // Netease Cache
      rt_data = await NcmCacheDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'kwm': // Kuwo Mp3/Flac
      rt_data = await KwmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'xm': // Xiami Wav/M4a/Mp3/Flac
    case 'wav': // Xiami/Raw Wav
    case 'mp3': // Xiami/Raw Mp3
    case 'flac': // Xiami/Raw Flac
    case 'm4a': // Xiami/Raw M4a
      rt_data = await XmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'ogg': // Raw Ogg
      rt_data = await RawDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'tm0': // QQ Music IOS Mp3
    case 'tm3': // QQ Music IOS Mp3
      rt_data = await RawDecrypt(file.raw, raw.name, 'mp3');
      break;
    case 'qmc3': //QQ Music Android Mp3
    case 'qmc2': //QQ Music Android Ogg
    case 'qmc0': //QQ Music Android Mp3
    case 'qmcflac': //QQ Music Android Flac
    case 'qmcogg': //QQ Music Android Ogg
    case 'tkm': //QQ Music Accompaniment M4a
    // Moo Music
    case 'bkcmp3':
    case 'bkcm4a':
    case 'bkcflac':
    case 'bkcwav':
    case 'bkcape':
    case 'bkcogg':
    case 'bkcwma':
    // QQ Music v2
    case 'mggl': //QQ Music Mac
    case 'mflac': //QQ Music New Flac
    case 'mflac0': //QQ Music New Flac
    case 'mgg': //QQ Music New Ogg
    case 'mgg1': //QQ Music New Ogg
    case 'mgg0':
    case '666c6163': //QQ Music Weiyun Flac
    case '6d7033': //QQ Music Weiyun Mp3
    case '6f6767': //QQ Music Weiyun Ogg
    case '6d3461': //QQ Music Weiyun M4a
    case '776176': //QQ Music Weiyun Wav
      rt_data = await QmcDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'tm2': // QQ Music IOS M4a
    case 'tm6': // QQ Music IOS M4a
      rt_data = await TmDecrypt(file.raw, raw.name);
      break;
    case 'cache': //QQ Music Cache
      rt_data = await QmcCacheDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'vpr':
    case 'kgm':
    case 'kgma':
      rt_data = await KgmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'ofl_en':
      rt_data = await JooxDecrypt(file.raw, raw.name, raw.ext);
      break;
    default:
      throw '不支持此文件格式';
  }

  if (!rt_data.rawExt) rt_data.rawExt = raw.ext;
  if (!rt_data.rawFilename) rt_data.rawFilename = raw.name;
  return rt_data;
}
