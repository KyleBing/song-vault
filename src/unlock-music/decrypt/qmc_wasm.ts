import QMCCryptoModule from '@jixun/qmc2-crypto/QMC2-wasm-bundle'
import type { QmcCrypto } from '@xhacker/qmcwasm/QmcWasmBundle'
import QmcCryptoModule from '@xhacker/qmcwasm/QmcWasmBundle'
import { MergeUint8Array } from '@unlock/utils/MergeUint8Array'
import type { QMCCrypto } from '@jixun/qmc2-crypto/QMCCrypto'

// 检测文件末端使用的缓冲区大小
const DETECTION_SIZE = 40

// 每次处理 2M 的数据
const DECRYPTION_BUF_SIZE = 2 * 1024 * 1024

export interface QMCDecryptionResult {
  success: boolean
  data: Uint8Array
  songId: string | number
  error: string
}

/** unlock-music 同款：@xhacker/qmcwasm，需传入扩展名 */
export async function DecryptQmcWasm(
  qmcBlob: ArrayBuffer,
  ext: string
): Promise<QMCDecryptionResult> {
  const result: QMCDecryptionResult = { success: false, data: new Uint8Array(), songId: 0, error: '' }

  let QmcCryptoObj: QmcCrypto

  try {
    QmcCryptoObj = await QmcCryptoModule()
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : 'wasm 加载失败'
    return result
  }

  const qmcBuf = new Uint8Array(qmcBlob)
  const pQmcBuf = QmcCryptoObj._malloc(DECRYPTION_BUF_SIZE)
  const preDecDataSize = Math.min(DECRYPTION_BUF_SIZE, qmcBlob.byteLength)
  QmcCryptoObj.writeArrayToMemory(qmcBuf.slice(-preDecDataSize), pQmcBuf)

  const extDot = '.' + ext
  const tailSize = QmcCryptoObj.preDec(pQmcBuf, preDecDataSize, extDot)
  if (tailSize === -1) {
    result.error = QmcCryptoObj.getErr()
    QmcCryptoObj._free(pQmcBuf)
    return result
  }

  const songId = QmcCryptoObj.getSongId()
  result.songId = songId === '0' ? 0 : songId

  const decryptedParts: Uint8Array[] = []
  let offset = 0
  let bytesToDecrypt = qmcBuf.length - tailSize
  while (bytesToDecrypt > 0) {
    const blockSize = Math.min(bytesToDecrypt, DECRYPTION_BUF_SIZE)

    const blockData = new Uint8Array(qmcBuf.slice(offset, offset + blockSize))
    QmcCryptoObj.writeArrayToMemory(blockData, pQmcBuf)
    decryptedParts.push(
      QmcCryptoObj.HEAPU8.slice(pQmcBuf, pQmcBuf + QmcCryptoObj.decBlob(pQmcBuf, blockSize, offset))
    )

    offset += blockSize
    bytesToDecrypt -= blockSize
  }
  QmcCryptoObj._free(pQmcBuf)

  result.data = MergeUint8Array(decryptedParts)
  result.success = true

  return result
}

/**
 * QMC2 解密（@jixun/qmc2-crypto），作为 xhacker 失败后的回退。
 */
export async function DecryptQmc2Wasm(mggBlob: ArrayBuffer): Promise<QMCDecryptionResult> {
  const result: QMCDecryptionResult = { success: false, data: new Uint8Array(), songId: 0, error: '' }

  let QMCCrypto: QMCCrypto

  try {
    QMCCrypto = await QMCCryptoModule()
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : 'wasm 加载失败'
    return result
  }

  const detectionBuf = new Uint8Array(mggBlob.slice(-DETECTION_SIZE))
  const pDetectionBuf = QMCCrypto._malloc(detectionBuf.length)
  QMCCrypto.writeArrayToMemory(detectionBuf, pDetectionBuf)

  const pDetectionResult = QMCCrypto._malloc(QMCCrypto.sizeof_qmc_detection())

  const detectOK = QMCCrypto.detectKeyEndPosition(pDetectionResult, pDetectionBuf, detectionBuf.length)

  const position = QMCCrypto.getValue(pDetectionResult, 'i32')
  const len = QMCCrypto.getValue(pDetectionResult + 4, 'i32')

  result.success = detectOK
  result.error = QMCCrypto.UTF8ToString(
    pDetectionResult + QMCCrypto.offsetof_error_msg(),
    QMCCrypto.sizeof_error_msg()
  )
  const songId = QMCCrypto.UTF8ToString(pDetectionResult + QMCCrypto.offsetof_song_id(), QMCCrypto.sizeof_song_id())
  if (!songId) {
    console.debug('qmc2-wasm: songId not found')
  } else if (/^\d+$/.test(songId)) {
    result.songId = songId
  } else {
    console.warn('qmc2-wasm: Invalid songId: %s', songId)
  }

  QMCCrypto._free(pDetectionBuf)
  QMCCrypto._free(pDetectionResult)

  if (!detectOK) {
    return result
  }

  const decryptedSize = mggBlob.byteLength - DETECTION_SIZE + position

  const ekey = new Uint8Array(mggBlob.slice(decryptedSize, decryptedSize + len))

  const decoder = new TextDecoder()
  const ekey_b64 = decoder.decode(ekey)

  const hCrypto = QMCCrypto.createInstWidthEKey(ekey_b64)
  const buf = QMCCrypto._malloc(DECRYPTION_BUF_SIZE)

  const decryptedParts: Uint8Array[] = []
  let offset = 0
  let bytesToDecrypt = decryptedSize
  while (bytesToDecrypt > 0) {
    const blockSize = Math.min(bytesToDecrypt, DECRYPTION_BUF_SIZE)

    const blockData = new Uint8Array(mggBlob.slice(offset, offset + blockSize))
    QMCCrypto.writeArrayToMemory(blockData, buf)
    QMCCrypto.decryptStream(hCrypto, buf, offset, blockSize)
    decryptedParts.push(QMCCrypto.HEAPU8.slice(buf, buf + blockSize))

    offset += blockSize
    bytesToDecrypt -= blockSize
  }
  QMCCrypto._free(buf)
  hCrypto.delete()

  result.data = MergeUint8Array(decryptedParts)

  return result
}
