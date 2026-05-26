export interface QMC2DecryptionResult {
  success: boolean
  data: Uint8Array
  songId: string | number
  error: string
}

/** 未打包 QMC2 WASM 时由 JS 解密器接管 */
export async function DecryptQMCWasm(
  _mggBlob: ArrayBuffer
): Promise<QMC2DecryptionResult> {
  return {
    success: false,
    data: new Uint8Array(),
    songId: 0,
    error: 'wasm unavailable'
  }
}
