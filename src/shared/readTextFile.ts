import fs from 'fs'
import path from 'path'
import iconv from 'iconv-lite'

export interface ReadTextFileResult {
    ok: boolean
    text?: string
    message?: string
}

/** 读取本地文本文件（UTF-8 / GBK 自动识别） */
export function readTextFile(filePath: string): ReadTextFileResult {
    const resolved = path.resolve((filePath ?? '').trim())
    if (!resolved) {
        return { ok: false, message: '无效路径' }
    }

    let stat: fs.Stats
    try {
        stat = fs.statSync(resolved)
    } catch {
        return { ok: false, message: '文件不存在' }
    }
    if (!stat.isFile()) {
        return { ok: false, message: '不是文件' }
    }

    try {
        const buf = fs.readFileSync(resolved)
        if (buf.length === 0) {
            return { ok: true, text: '' }
        }

        let body = buf
        if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
            body = buf.subarray(3)
        }

        const utf8 = body.toString('utf8')
        if (utf8.includes('\uFFFD')) {
            return { ok: true, text: iconv.decode(body, 'gbk') }
        }
        return { ok: true, text: utf8 }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, message: msg || '无法读取文件' }
    }
}
