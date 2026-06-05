import { buildVorbisCommentPayload } from './flacRewrite'

const OGG_CAPTURE = 'OggS'

/** libogg CRC-32 查表 */
const OGG_CRC_LOOKUP = ((): Uint32Array => {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
        let r = i << 24
        for (let j = 0; j < 8; j++) {
            r = (r << 1) ^ (r & 0x80000000 ? 0x04c11db7 : 0)
        }
        table[i] = r >>> 0
    }
    return table
})()

export type OggStreamCodec = 'vorbis' | 'opus'

export interface ParsedOggPage {
    headerType: number
    granule: bigint
    serial: number
    sequence: number
    segmentTable: number[]
    body: Buffer
}

interface OggPacket {
    data: Buffer
    granule: bigint
}

const MANAGED_VORBIS_TAG_KEYS = new Set([
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
])

function computeOggPageChecksum(page: Buffer): number {
    let crc = 0
    for (let i = 0; i < page.length; i++) {
        if (i >= 22 && i <= 25) continue
        crc =
            ((crc << 8) ^
                OGG_CRC_LOOKUP[((crc >>> 24) & 0xff) ^ page[i]!]) >>>
            0
    }
    return crc >>> 0
}

function buildOggPage(params: {
    headerType: number
    granule: bigint
    serial: number
    sequence: number
    segmentTable: number[]
    body: Buffer
}): Buffer {
    const header = Buffer.alloc(27 + params.segmentTable.length)
    header.write(OGG_CAPTURE, 0, 4, 'ascii')
    header.writeUInt8(0, 4)
    header.writeUInt8(params.headerType, 5)
    header.writeBigUInt64LE(params.granule, 6)
    header.writeUInt32LE(params.serial, 14)
    header.writeUInt32LE(params.sequence, 18)
    header.writeUInt32LE(0, 22)
    header.writeUInt8(params.segmentTable.length, 26)
    for (let i = 0; i < params.segmentTable.length; i++) {
        header.writeUInt8(params.segmentTable[i]!, 27 + i)
    }

    const page = Buffer.concat([header, params.body])
    const checksum = computeOggPageChecksum(page)
    page.writeUInt32LE(checksum, 22)
    return page
}

/** 解析文件内全部 Ogg 页（按文件顺序） */
export function parseOggPages(buffer: Buffer): ParsedOggPage[] {
    const pages: ParsedOggPage[] = []
    let offset = 0

    while (offset + 27 <= buffer.length) {
        if (buffer.toString('ascii', offset, offset + 4) !== OGG_CAPTURE) {
            break
        }

        const version = buffer[offset + 4]!
        if (version !== 0) {
            throw new Error('不支持的 Ogg 版本')
        }

        const headerType = buffer[offset + 5]!
        const granule = buffer.readBigUInt64LE(offset + 6)
        const serial = buffer.readUInt32LE(offset + 14)
        const sequence = buffer.readUInt32LE(offset + 18)
        const pageSegments = buffer[offset + 26]!

        if (offset + 27 + pageSegments > buffer.length) {
            throw new Error('Ogg 页不完整')
        }

        const segmentTable = Array.from(
            buffer.subarray(offset + 27, offset + 27 + pageSegments)
        )
        const bodyLength = segmentTable.reduce((sum, size) => sum + size, 0)
        const bodyStart = offset + 27 + pageSegments

        if (bodyStart + bodyLength > buffer.length) {
            throw new Error('Ogg 页体不完整')
        }

        pages.push({
            headerType,
            granule,
            serial,
            sequence,
            segmentTable,
            body: buffer.subarray(bodyStart, bodyStart + bodyLength)
        })

        offset = bodyStart + bodyLength
    }

    if (pages.length === 0) {
        throw new Error('不是有效的 Ogg 文件')
    }

    return pages
}

function detectStreamCodec(firstPacket: Buffer): OggStreamCodec | null {
    if (
        firstPacket.length >= 7 &&
        firstPacket[0] === 0x01 &&
        firstPacket.toString('ascii', 1, 7) === 'vorbis'
    ) {
        return 'vorbis'
    }

    if (
        firstPacket.length >= 8 &&
        firstPacket.toString('ascii', 0, 8) === 'OpusHead'
    ) {
        return 'opus'
    }

    return null
}

function isCommentPacket(packet: Buffer, codec: OggStreamCodec): boolean {
    if (codec === 'vorbis') {
        return (
            packet.length >= 7 &&
            packet[0] === 0x03 &&
            packet.toString('ascii', 1, 7) === 'vorbis'
        )
    }

    return (
        packet.length >= 8 && packet.toString('ascii', 0, 8) === 'OpusTags'
    )
}

function commentPayloadFromPacket(
    packet: Buffer,
    codec: OggStreamCodec
): Buffer {
    if (codec === 'vorbis') {
        return packet.subarray(7)
    }
    return packet.subarray(8)
}

export function parseVorbisCommentPayload(payload: Buffer): {
    vendor: string
    comments: Map<string, string[]>
} {
    if (payload.length < 8) {
        return { vendor: '', comments: new Map() }
    }

    let offset = 0
    const vendorLength = payload.readUInt32LE(offset)
    offset += 4

    if (offset + vendorLength + 4 > payload.length) {
        throw new Error('Vorbis Comment 结构无效')
    }

    const vendor = payload.toString('utf8', offset, offset + vendorLength)
    offset += vendorLength

    const count = payload.readUInt32LE(offset)
    offset += 4

    const comments = new Map<string, string[]>()

    for (let i = 0; i < count; i++) {
        if (offset + 4 > payload.length) {
            throw new Error('Vorbis Comment 字段长度无效')
        }

        const fieldLength = payload.readUInt32LE(offset)
        offset += 4

        if (offset + fieldLength > payload.length) {
            throw new Error('Vorbis Comment 字段内容无效')
        }

        const field = payload.toString('utf8', offset, offset + fieldLength)
        offset += fieldLength

        const eq = field.indexOf('=')
        const key = (eq >= 0 ? field.slice(0, eq) : field)
            .trim()
            .toUpperCase()
        const value = eq >= 0 ? field.slice(eq + 1) : ''

        if (!comments.has(key)) comments.set(key, [])
        comments.get(key)!.push(value)
    }

    return { vendor, comments }
}

function commentFieldsFromMap(comments: Map<string, string[]>): string[] {
    const out: string[] = []
    for (const [key, values] of comments) {
        for (const value of values) {
            out.push(`${key}=${value}`)
        }
    }
    return out
}

function commentMapFromFields(fields: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const field of fields) {
        const eq = field.indexOf('=')
        if (eq < 0) continue
        const key = field.slice(0, eq).trim().toUpperCase()
        const value = field.slice(eq + 1)
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(value)
    }
    return map
}

function mergePreservedUnmanagedComments(
    managedFields: string[],
    preserved: Map<string, string[]>
): string[] {
    const managedKeys = new Set(
        managedFields.map((field) => field.slice(0, field.indexOf('=')).toUpperCase())
    )
    const out = [...managedFields]

    for (const [key, values] of preserved) {
        if (MANAGED_VORBIS_TAG_KEYS.has(key) || managedKeys.has(key)) continue
        for (const value of values) {
            out.push(`${key}=${value}`)
        }
    }

    return out
}

function buildCommentPacket(
    codec: OggStreamCodec,
    vendor: string,
    commentFields: string[]
): Buffer {
    const payload = buildVorbisCommentPayload(vendor, commentFields)

    if (codec === 'vorbis') {
        return Buffer.concat([
            Buffer.from([0x03]),
            Buffer.from('vorbis'),
            payload
        ])
    }

    return Buffer.concat([Buffer.from('OpusTags'), payload])
}

function extractStreamPackets(pages: ParsedOggPage[]): OggPacket[] {
    const packets: OggPacket[] = []
    let current: Buffer[] = []

    for (const page of pages) {
        let segmentOffset = 0

        for (const segmentSize of page.segmentTable) {
            current.push(
                page.body.subarray(
                    segmentOffset,
                    segmentOffset + segmentSize
                )
            )
            segmentOffset += segmentSize

            if (segmentSize < 255) {
                packets.push({
                    data: Buffer.concat(current),
                    granule: page.granule
                })
                current = []
            }
        }
    }

    if (current.length > 0) {
        throw new Error('Ogg 流末尾存在未完成的包')
    }

    return packets
}

function paginatePacket(
    packet: Buffer,
    serial: number,
    sequenceStart: number,
    granule: bigint,
    options: { isBos: boolean; isEos: boolean }
): { pages: Buffer[]; nextSequence: number } {
    const pages: Buffer[] = []
    let sequence = sequenceStart
    let offset = 0
    let continued = false

    while (offset < packet.length) {
        const segmentTable: number[] = []
        const bodyParts: Buffer[] = []
        let pageBodySize = 0

        while (offset < packet.length) {
            const remaining = packet.length - offset
            const chunkSize = Math.min(255, remaining)
            segmentTable.push(chunkSize)
            bodyParts.push(packet.subarray(offset, offset + chunkSize))
            offset += chunkSize
            pageBodySize += chunkSize

            if (chunkSize < 255) break
            if (pageBodySize >= 4096) break
        }

        const packetComplete = offset >= packet.length
        let headerType = 0
        if (continued) headerType |= 0x01
        if (options.isBos && sequence === sequenceStart && !continued) {
            headerType |= 0x02
        }
        if (packetComplete && options.isEos) headerType |= 0x04

        pages.push(
            buildOggPage({
                headerType,
                granule: packetComplete ? granule : 0n,
                serial,
                sequence,
                segmentTable,
                body: Buffer.concat(bodyParts)
            })
        )

        sequence++
        continued = !packetComplete
    }

    return { pages, nextSequence: sequence }
}

function findPacketPageRanges(streamPages: ParsedOggPage[]): Array<{
    startPage: number
    endPage: number
}> {
    const ranges: Array<{ startPage: number; endPage: number }> = []
    let packetStartPage = 0

    for (let pageIndex = 0; pageIndex < streamPages.length; pageIndex++) {
        const page = streamPages[pageIndex]!
        let segmentOffset = 0

        for (const segmentSize of page.segmentTable) {
            segmentOffset += segmentSize
            if (segmentSize < 255) {
                ranges.push({ startPage: packetStartPage, endPage: pageIndex })
                packetStartPage = pageIndex + 1
            }
        }
    }

    return ranges
}

function headerPacketCount(codec: OggStreamCodec): number {
    return codec === 'vorbis' ? 3 : 2
}

function repaginateHeaderPackets(
    serial: number,
    headerPackets: OggPacket[]
): Buffer[] {
    const pages: Buffer[] = []
    let sequence = 0

    for (let i = 0; i < headerPackets.length; i++) {
        const result = paginatePacket(
            headerPackets[i]!.data,
            serial,
            sequence,
            0n,
            { isBos: i === 0, isEos: false }
        )
        pages.push(...result.pages)
        sequence = result.nextSequence
    }

    return pages
}

function rebuildStreamPagesPreserveAudio(
    streamPages: ParsedOggPage[],
    serial: number,
    packets: OggPacket[],
    newCommentPacket: Buffer,
    codec: OggStreamCodec,
    lastPageHadEos: boolean
): Buffer[] {
    const ranges = findPacketPageRanges(streamPages)
    const headers = headerPacketCount(codec)

    if (packets.length < headers || ranges.length < headers) {
        throw new Error('Ogg 流包头不完整')
    }

    const headerPackets: OggPacket[] = []
    for (let i = 0; i < headers; i++) {
        if (i === 1) {
            headerPackets.push({ data: newCommentPacket, granule: 0n })
        } else {
            headerPackets.push(packets[i]!)
        }
    }

    const outputPages = repaginateHeaderPackets(serial, headerPackets)
    let sequence = outputPages.length

    const audioStartPage = ranges[headers - 1]!.endPage + 1
    const audioPages = streamPages.slice(audioStartPage)

    for (let i = 0; i < audioPages.length; i++) {
        const page = audioPages[i]!
        let headerType = page.headerType & ~0x02
        if (i === audioPages.length - 1 && lastPageHadEos) {
            headerType |= 0x04
        } else {
            headerType &= ~0x04
        }

        outputPages.push(
            buildOggPage({
                headerType,
                granule: page.granule,
                serial,
                sequence,
                segmentTable: page.segmentTable,
                body: page.body
            })
        )
        sequence++
    }

    return outputPages
}

function pagesForSerial(
    pages: ParsedOggPage[],
    serial: number
): ParsedOggPage[] {
    return pages.filter((page) => page.serial === serial)
}

function findPrimaryTagStream(pages: ParsedOggPage[]): {
    serial: number
    codec: OggStreamCodec
} {
    const serials = [...new Set(pages.map((page) => page.serial))]

    for (const serial of serials) {
        const streamPages = pagesForSerial(pages, serial)
        const packets = extractStreamPackets(streamPages)
        const codec = detectStreamCodec(packets[0]?.data ?? Buffer.alloc(0))
        if (codec) {
            return { serial, codec }
        }
    }

    throw new Error('未找到可写入标签的 Ogg 音频流（Vorbis / Opus）')
}

function readPreservedCommentsFromPackets(
    packets: OggPacket[],
    codec: OggStreamCodec
): Map<string, string[]> {
    for (const packet of packets) {
        if (!isCommentPacket(packet.data, codec)) continue
        return parseVorbisCommentPayload(
            commentPayloadFromPacket(packet.data, codec)
        ).comments
    }
    return new Map()
}

function readVendorFromPackets(
    packets: OggPacket[],
    codec: OggStreamCodec
): string {
    for (const packet of packets) {
        if (!isCommentPacket(packet.data, codec)) continue
        return parseVorbisCommentPayload(
            commentPayloadFromPacket(packet.data, codec)
        ).vendor
    }
    return 'SongVault'
}

function assertValidVorbisField(field: string): void {
    if (!field.includes('=')) {
        throw new Error(`Vorbis 标签格式无效: ${field}`)
    }
}

function rebuildFileWithStreamPages(
    pages: ParsedOggPage[],
    targetSerial: number,
    newStreamPages: Buffer[]
): Buffer {
    const chunks: Buffer[] = []
    const rebuiltSerials = new Set<number>()
    let streamPageIndex = 0

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i]!

        if (page.serial !== targetSerial) {
            const header = Buffer.alloc(27 + page.segmentTable.length)
            header.write(OGG_CAPTURE, 0, 4, 'ascii')
            header.writeUInt8(0, 4)
            header.writeUInt8(page.headerType, 5)
            header.writeBigUInt64LE(page.granule, 6)
            header.writeUInt32LE(page.serial, 14)
            header.writeUInt32LE(page.sequence, 18)
            header.writeUInt32LE(0, 22)
            header.writeUInt8(page.segmentTable.length, 26)
            for (let s = 0; s < page.segmentTable.length; s++) {
                header.writeUInt8(page.segmentTable[s]!, 27 + s)
            }
            const rebuilt = Buffer.concat([header, page.body])
            const checksum = computeOggPageChecksum(rebuilt)
            rebuilt.writeUInt32LE(checksum, 22)
            chunks.push(rebuilt)
            continue
        }

        if (rebuiltSerials.has(targetSerial)) {
            continue
        }

        while (streamPageIndex < newStreamPages.length) {
            chunks.push(newStreamPages[streamPageIndex]!)
            streamPageIndex++
        }
        rebuiltSerials.add(targetSerial)
    }

    if (!rebuiltSerials.has(targetSerial)) {
        chunks.push(...newStreamPages)
    }

    return Buffer.concat(chunks)
}

/** 校验 Ogg 文件是否可解析 */
export function validateOggBufferStructure(buffer: Buffer): void {
    const pages = parseOggPages(buffer)
    findPrimaryTagStream(pages)
}

/**
 * 重写 Ogg Vorbis / Opus 流的 comment 包（Vorbis Comment），保留音频包与 granulepos。
 */
export function rebuildOggWithVorbisComments(
    buffer: Buffer,
    vorbisComments: string[],
    options: {
        preserveUnmanaged?: Map<string, string[]>
        vendor?: string
    } = {}
): Buffer {
    for (const comment of vorbisComments) {
        assertValidVorbisField(comment)
    }

    const pages = parseOggPages(buffer)
    const { serial, codec } = findPrimaryTagStream(pages)
    const streamPages = pagesForSerial(pages, serial)
    const packets = extractStreamPackets(streamPages)
    const lastPageHadEos = (streamPages.at(-1)?.headerType ?? 0) & 0x04 ? true : false

    let commentFields = [...vorbisComments]
    if (options.preserveUnmanaged?.size) {
        commentFields = mergePreservedUnmanagedComments(
            commentFields,
            options.preserveUnmanaged
        )
    }

    const vendor =
        options.vendor?.trim() ||
        readVendorFromPackets(packets, codec) ||
        'SongVault'
    const newCommentPacket = buildCommentPacket(codec, vendor, commentFields)

    if (!packets.some((packet) => isCommentPacket(packet.data, codec))) {
        throw new Error('Ogg 流缺少 comment 包头')
    }

    const newStreamPages = rebuildStreamPagesPreserveAudio(
        streamPages,
        serial,
        packets,
        newCommentPacket,
        codec,
        lastPageHadEos
    )
    return rebuildFileWithStreamPages(pages, serial, newStreamPages)
}

/** 从 Ogg 文件读取非托管 Vorbis 字段，供 merge 写入时保留 */
export function readUnmanagedVorbisCommentsFromBuffer(
    buffer: Buffer
): Map<string, string[]> {
    const pages = parseOggPages(buffer)
    const { serial, codec } = findPrimaryTagStream(pages)
    const packets = extractStreamPackets(pagesForSerial(pages, serial))
    const all = readPreservedCommentsFromPackets(packets, codec)
    const unmanaged = new Map<string, string[]>()

    for (const [key, values] of all) {
        if (MANAGED_VORBIS_TAG_KEYS.has(key)) continue
        unmanaged.set(key, values)
    }

    return unmanaged
}

export function readVorbisCommentFieldsFromBuffer(buffer: Buffer): string[] {
    const pages = parseOggPages(buffer)
    const { serial, codec } = findPrimaryTagStream(pages)
    const packets = extractStreamPackets(pagesForSerial(pages, serial))

    for (const packet of packets) {
        if (!isCommentPacket(packet.data, codec)) continue
        const parsed = parseVorbisCommentPayload(
            commentPayloadFromPacket(packet.data, codec)
        )
        return commentFieldsFromMap(parsed.comments)
    }

    return []
}

export { commentMapFromFields, MANAGED_VORBIS_TAG_KEYS }
