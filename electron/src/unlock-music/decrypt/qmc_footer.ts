/** QQ 音乐 QMC 文件末端标记（与 qmc2-crypto QMCDetection 一致） */
export type QmcFooterKind = 'QTag' | 'STag' | 'v1-key' | 'plain-audio' | 'unknown'

export interface QmcFooterInfo {
  kind: QmcFooterKind
  /** 文件最后 4 字节（ASCII 可读部分） */
  tailTag: string
  /** wasm 检测失败时的 magic 字符串，如 00786563-6973756d */
  wasmMagic?: string
}

function tailAscii(data: Uint8Array, n: number): string {
  const slice = data.slice(-n)
  return new TextDecoder('ascii', { fatal: false }).decode(slice).replace(/\0/g, '\\0')
}

function hexTail(data: Uint8Array, n: number): string {
  return [...data.slice(-n)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
}

/** 解析 QMC 文件末端结构，用于错误提示与路由 */
export function inspectQmcFooter(data: Uint8Array): QmcFooterInfo {
  if (data.length < 4) {
    return { kind: 'unknown', tailTag: '' }
  }

  const tail4 = data.slice(-4)
  const tailTag = tailAscii(data, 4)

  if (tailTag === 'QTag') {
    return { kind: 'QTag', tailTag }
  }
  if (tailTag === 'STag') {
    return { kind: 'STag', tailTag }
  }

  const keyLen = new DataView(tail4.buffer, tail4.byteOffset).getUint32(0, true)
  if (keyLen > 0 && keyLen < 0x300) {
    return { kind: 'v1-key', tailTag }
  }

  return { kind: 'unknown', tailTag }
}

/** 新版 PC QQ 音乐 .mflac（尾标 cex\\0，magic 常为 00786563-6973756d） */
export function isNewPcQqMusicMflac(info: QmcFooterInfo, wasmError?: string): boolean {
  if (info.tailTag === 'cex\\0') return true
  return wasmError?.includes('00786563-6973756d') === true
}

export function formatUnsupportedQmcMessage(
  info: QmcFooterInfo,
  ext: string,
  wasmError?: string
): string {
  const lines: string[] = []
  const newPc = isNewPcQqMusicMflac(info, wasmError)

  if (newPc) {
    lines.push('这是 QQ 音乐新版 PC 客户端下载的 .mflac，密钥在客户端进程内，本工具无法离线解密。')
    lines.push('可选方案：')
    lines.push('1) 安装 QQ 音乐并保持登录，用 Frida 方案解密（如 ericjuice/music-decryptor、decrypt-mflac-frida）；')
    lines.push('2) 降级到 QQ 音乐 PC v19.43 或更低版本后重新下载（部分曲目可能已是明文 flac）；')
    lines.push('3) 解密完成后，将得到的 .flac 放入本工具做后续处理。')
  } else if (wasmError?.includes('unknown magic')) {
    lines.push(
      `文件尾不是 unlock-music 支持的 QMC2 格式（magic: ${wasmError.replace(/^unknown magic:\s*/i, '')}）。`
    )
  } else if (wasmError) {
    lines.push(`QMC2 解密失败: ${wasmError}`)
  }

  if (info.kind === 'STag') {
    lines.push(
      '检测到 STag 尾标。部分文件未内嵌密钥，需从 QQ 音乐数据库导入 ekey，或使用旧版客户端重新下载。'
    )
  } else if (info.kind === 'unknown' && !newPc) {
    lines.push(`文件尾标记: "${info.tailTag || '(不可打印)'}"`)
    lines.push(
      '常见原因：新版 QQ 音乐加密、文件损坏、或扩展名与真实格式不符。可尝试旧版客户端重新下载。'
    )
  }

  lines.push(`扩展名: .${ext}`)

  return lines.join('\n')
}

export function logQmcFooterDebug(data: Uint8Array, label: string): void {
  if (data.length < 8) return
  console.debug(
    '[qmc] %s footer tail8 ascii=%j hex=%s',
    label,
    tailAscii(data, 8),
    hexTail(data, 8)
  )
}
