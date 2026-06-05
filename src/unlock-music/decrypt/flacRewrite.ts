import MetaFlac from 'metaflac-js'

const FLAC_MAGIC = 'fLaC'

const BLOCK = {
    STREAMINFO: 0,
    PADDING: 1,
    APPLICATION: 2,
    SEEKTABLE: 3,
    VORBIS_COMMENT: 4,
    CUESHEET: 5,
    PICTURE: 6
} as const

const DEFAULT_PADDING_BYTES = 4096

export type FlacCoverWriteMode = 'preserve' | 'replace' | 'remove'

export interface FlacLocatedBuffer {
    /** 相对原始 buffer 的 fLaC 起始偏移 */
    start: number
    /** 从 fLaC 魔数开始的 FLAC 主体 */
    flac: Buffer
}

type MetaFlacReadState = MetaFlac & {
    streamInfo: Buffer | null
    framesOffset: number
    blocks: Array<[number, Buffer]>
    pictures: Buffer[]
    padding: Buffer | null
    vendorString: string
    tags: string[]
}

function readId3v2SizeBytes(buffer: Buffer, offset: number): number | null {
    if (offset + 10 > buffer.length) return null
    if (buffer.toString('ascii', offset, offset + 3) !== 'ID3') return null
    for (let i = 6; i <= 9; i++) {
        if ((buffer[offset + i]! & 0x80) !== 0) return null
    }
    return (
        ((buffer[offset + 6]! & 0x7f) << 21) |
        ((buffer[offset + 7]! & 0x7f) << 14) |
        ((buffer[offset + 8]! & 0x7f) << 7) |
        (buffer[offset + 9]! & 0x7f)
    )
}

/** 定位文件内 FLAC 数据（跳过前置 ID3 等垃圾字节） */
export function locateFlacInBuffer(buffer: Buffer): FlacLocatedBuffer | null {
    if (buffer.length < 42) return null

    if (buffer.toString('ascii', 0, 4) === FLAC_MAGIC) {
        return { start: 0, flac: buffer }
    }

    const id3Size = readId3v2SizeBytes(buffer, 0)
    if (id3Size != null) {
        const afterId3 = 10 + id3Size
        if (
            afterId3 + 4 <= buffer.length &&
            buffer.toString('ascii', afterId3, afterId3 + 4) === FLAC_MAGIC
        ) {
            return { start: afterId3, flac: buffer.subarray(afterId3) }
        }
    }

    for (let i = 1; i <= buffer.length - 4; i++) {
        if (buffer.toString('ascii', i, i + 4) !== FLAC_MAGIC) continue
        return { start: i, flac: buffer.subarray(i) }
    }

    return null
}

function formatVorbisComment(vendorString: string, commentList: string[]): Buffer {
    const parts: Buffer[] = []
    const vendorStringBuffer = Buffer.from(vendorString, 'utf8')
    const vendorLengthBuffer = Buffer.alloc(4)
    vendorLengthBuffer.writeUInt32LE(vendorStringBuffer.length)

    const userCommentListLengthBuffer = Buffer.alloc(4)
    userCommentListLengthBuffer.writeUInt32LE(commentList.length)

    parts.push(vendorLengthBuffer, vendorStringBuffer, userCommentListLengthBuffer)

    for (const comment of commentList) {
        const commentBuffer = Buffer.from(comment, 'utf8')
        const lengthBuffer = Buffer.alloc(4)
        lengthBuffer.writeUInt32LE(commentBuffer.length)
        parts.push(lengthBuffer, commentBuffer)
    }

    return Buffer.concat(parts)
}

function buildMetadataBlock(type: number, data: Buffer, isLast: boolean): Buffer {
    const header = Buffer.alloc(4)
    header.writeUInt8(isLast ? type + 128 : type, 0)
    header.writeUIntBE(data.length, 1, 3)
    return Buffer.concat([header, data])
}

function readFlacWithMetaflac(flacBuffer: Buffer): MetaFlacReadState {
    try {
        const state = new MetaFlac(flacBuffer) as MetaFlacReadState
        if (!state.streamInfo?.length || state.framesOffset <= 4) {
            throw new Error('FLAC 结构无效')
        }
        return state
    } catch {
        throw new Error('无法解析 FLAC 结构')
    }
}

function ensurePadding(state: MetaFlacReadState): void {
    if (!state.padding || state.padding.length < DEFAULT_PADDING_BYTES) {
        state.padding = Buffer.alloc(DEFAULT_PADDING_BYTES)
    }
}

function detectPictureMime(picture: Buffer): 'image/jpeg' | 'image/png' | null {
    if (
        picture.length >= 3 &&
        picture[0] === 0xff &&
        picture[1] === 0xd8 &&
        picture[2] === 0xff
    ) {
        return 'image/jpeg'
    }

    if (
        picture.length >= 8 &&
        picture[0] === 0x89 &&
        picture[1] === 0x50 &&
        picture[2] === 0x4e &&
        picture[3] === 0x47
    ) {
        return 'image/png'
    }

    return null
}

function picturePayloadFromFlacPictureBlock(
    block: Buffer
): { mime: string; data: Buffer } | null {
    if (block.length < 32) return null

    let offset = 4
    const mimeLength = block.readUInt32BE(offset)
    offset += 4
    if (offset + mimeLength + 4 > block.length) return null

    const mime =
        block.toString('ascii', offset, offset + mimeLength).trim() ||
        'image/jpeg'
    offset += mimeLength

    const descriptionLength = block.readUInt32BE(offset)
    offset += 4
    if (offset + descriptionLength + 16 + 4 > block.length) return null
    offset += descriptionLength + 16

    const dataLength = block.readUInt32BE(offset)
    offset += 4
    if (dataLength <= 0 || offset + dataLength > block.length) return null

    const data = block.subarray(offset, offset + dataLength)
    const resolvedMime = mime || detectPictureMime(data) || 'image/jpeg'
    return { mime: resolvedMime, data }
}

/** 从 FLAC 缓冲读取首张内嵌封面（不依赖 music-metadata 的 skipCovers） */
export function readFirstFlacCoverDataUrl(buffer: Buffer): string | undefined {
    const located = locateFlacInBuffer(buffer)
    if (!located) return undefined

    try {
        const state = readFlacWithMetaflac(located.flac)
        const first = state.pictures?.[0]
        if (!first?.length) return undefined

        const payload = picturePayloadFromFlacPictureBlock(first)
        if (!payload) return undefined

        const base64 = payload.data.toString('base64')
        return `data:${payload.mime};base64,${base64}`
    } catch {
        return undefined
    }
}

function buildPictureBlock(picture: Buffer, mime: string): Buffer {
    const pictureType = Buffer.alloc(4)
    pictureType.writeUInt32BE(3)

    const mimeBuf = Buffer.from(mime, 'ascii')
    const mimeLength = Buffer.alloc(4)
    mimeLength.writeUInt32BE(mimeBuf.length)

    const descriptionLength = Buffer.alloc(4)
    descriptionLength.writeUInt32BE(0)

    const width = Buffer.alloc(4)
    width.writeUInt32BE(0)
    const height = Buffer.alloc(4)
    height.writeUInt32BE(0)
    const depth = Buffer.alloc(4)
    depth.writeUInt32BE(24)
    const colors = Buffer.alloc(4)
    colors.writeUInt32BE(0)

    const pictureLength = Buffer.alloc(4)
    pictureLength.writeUInt32BE(picture.length)

    return Buffer.concat([
        pictureType,
        mimeLength,
        mimeBuf,
        descriptionLength,
        Buffer.alloc(0),
        width,
        height,
        depth,
        colors,
        pictureLength,
        picture
    ])
}

function assertValidVorbisField(field: string): void {
    if (!field.includes('=')) {
        throw new Error(`Vorbis 标签格式无效: ${field}`)
    }
}

function assembleFlacFromState(sourceFlac: Buffer, state: MetaFlacReadState): Buffer {
    if (!state.streamInfo) {
        throw new Error('FLAC 缺少 STREAMINFO 块')
    }

    const blocks: Buffer[] = []
    blocks.push(buildMetadataBlock(BLOCK.STREAMINFO, state.streamInfo, false))

    for (const [type, data] of state.blocks) {
        blocks.push(buildMetadataBlock(type, data, false))
    }

    const vendor = state.vendorString?.trim() || 'SongVault'
    const vorbisData = formatVorbisComment(vendor, state.tags)
    blocks.push(buildMetadataBlock(BLOCK.VORBIS_COMMENT, vorbisData, false))

    for (const picture of state.pictures) {
        blocks.push(buildMetadataBlock(BLOCK.PICTURE, picture, false))
    }

    ensurePadding(state)
    blocks.push(buildMetadataBlock(BLOCK.PADDING, state.padding!, true))

    const metadata = Buffer.concat(blocks)
    const audio = sourceFlac.subarray(state.framesOffset)
    if (audio.length < 64) {
        throw new Error('FLAC 音频数据过短')
    }

    return Buffer.concat([sourceFlac.subarray(0, 4), metadata, audio])
}

/** 校验 FLAC 元数据块结构是否可读（不解析音频帧） */
export function validateFlacBufferStructure(buffer: Buffer): void {
    const located = locateFlacInBuffer(buffer)
    if (!located) {
        throw new Error('不是有效的 FLAC 文件')
    }
    readFlacWithMetaflac(located.flac)
}

/**
 * 安全重写 FLAC 的 Vorbis Comment（及可选封面）。
 * 用 metaflac-js 读取结构，手动拼装输出，不调用 metaflac.save()。
 */
export function rebuildFlacWithVorbisTags(
    buffer: Buffer,
    vorbisComments: string[],
    options: {
        coverMode?: FlacCoverWriteMode
        picture?: Buffer
    } = {}
): Buffer {
    const located = locateFlacInBuffer(buffer)
    if (!located) {
        throw new Error('不是有效的 FLAC 文件')
    }

    const state = readFlacWithMetaflac(located.flac)
    const sourceAudioLength = located.flac.length - state.framesOffset

    for (const comment of vorbisComments) {
        assertValidVorbisField(comment)
    }

    state.tags = [...vorbisComments]

    const coverMode = options.coverMode ?? 'preserve'
    if (coverMode === 'remove') {
        state.pictures = []
    } else if (coverMode === 'replace' && options.picture?.length) {
        const mime = detectPictureMime(options.picture)
        state.pictures = mime ? [buildPictureBlock(options.picture, mime)] : []
    }

    const rebuilt = assembleFlacFromState(located.flac, state)
    const rebuiltState = readFlacWithMetaflac(rebuilt)
    const rebuiltAudioLength = rebuilt.length - rebuiltState.framesOffset

    if (sourceAudioLength !== rebuiltAudioLength) {
        throw new Error('写入后 FLAC 音频段长度发生变化')
    }

    return rebuilt
}

export function flacVorbisField(key: string, value: string): string {
    return `${key.trim()}=${value}`
}
