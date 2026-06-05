const CONTAINER_BOX_TYPES = new Set([
    'moov',
    'udta',
    'meta',
    'ilst',
    'trak',
    'mdia',
    'minf',
    'stbl',
    'edts',
    'dinf',
    'sinf',
    'schi',
    'wave'
])

const FULL_BOX_TYPES = new Set(['meta', 'mdhd', 'mvhd', 'tkhd', 'hdlr'])

export interface Mp4BoxNode {
    offset: number
    size: number
    type: string
    headerSize: number
    contentStart: number
    contentEnd: number
    children: Mp4BoxNode[]
}

export interface Mp4IlstField {
    fourcc: string
    values: string[]
    binary?: boolean
    dataType?: number
}

export const MANAGED_ITUNES_ATOMS = new Set([
    '\xa9nam',
    '\xa9ART',
    'aART',
    '\xa9alb',
    '\xa9gen',
    '\xa9day',
    'trkn',
    'disk',
    '\xa9cmt',
    '\xa9lyr',
    '\xa9wrt',
    '\xa9grp',
    '\xa9st3',
    'tmpo',
    'catn',
    '\xa9lyc',
    '\xa9con',
    '\xa9rem',
    '\xa9prd',
    '\xa9pub'
])

const VORBIS_KEY_TO_ITUNES_ATOM: Record<string, string> = {
    TITLE: '\xa9nam',
    ARTIST: '\xa9ART',
    ARTISTS: '\xa9ART',
    ALBUM: '\xa9alb',
    ALBUMARTIST: 'aART',
    GENRE: '\xa9gen',
    DATE: '\xa9day',
    COMMENT: '\xa9cmt',
    LYRICS: '\xa9lyr',
    COMPOSER: '\xa9wrt',
    GROUPING: '\xa9grp',
    SUBTITLE: '\xa9st3',
    BPM: 'tmpo',
    CATALOGNUMBER: 'catn',
    CONDUCTOR: '\xa9con',
    REMIXER: '\xa9rem',
    PRODUCER: '\xa9prd',
    LABEL: '\xa9pub'
}

function readBoxHeader(
    buffer: Buffer,
    offset: number,
    limit: number
): { size: number; type: string; headerSize: number } {
    if (offset + 8 > limit) {
        throw new Error('MP4 box 头不完整')
    }

    let size = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    let headerSize = 8

    if (size === 1) {
        if (offset + 16 > limit) {
            throw new Error('MP4 extended size 不完整')
        }
        size = Number(buffer.readBigUInt64BE(offset + 8))
        headerSize = 16
    } else if (size === 0) {
        size = limit - offset
    }

    if (size < headerSize) {
        throw new Error(`MP4 box ${type} 尺寸无效`)
    }

    return { size, type, headerSize }
}

function parseBoxTree(
    buffer: Buffer,
    start: number,
    end: number
): Mp4BoxNode[] {
    const nodes: Mp4BoxNode[] = []
    let offset = start

    while (offset + 8 <= end) {
        const { size, type, headerSize } = readBoxHeader(buffer, offset, end)
        const boxEnd = offset + size
        if (boxEnd > end || boxEnd <= offset) {
            offset = end
            break
        }

        let contentStart = offset + headerSize
        if (FULL_BOX_TYPES.has(type)) {
            contentStart += 4
        }

        const children =
            CONTAINER_BOX_TYPES.has(type) || type === 'moov'
                ? parseBoxTree(buffer, contentStart, boxEnd)
                : []

        nodes.push({
            offset,
            size,
            type,
            headerSize,
            contentStart,
            contentEnd: boxEnd,
            children
        })

        offset = boxEnd
    }

    return nodes
}

function findFirstBox(
    nodes: Mp4BoxNode[],
    type: string
): Mp4BoxNode | undefined {
    for (const node of nodes) {
        if (node.type === type) return node
        const nested = findFirstBox(node.children, type)
        if (nested) return nested
    }
    return undefined
}

function findIlstNode(moov: Mp4BoxNode): Mp4BoxNode | undefined {
    const udta = moov.children.find((node) => node.type === 'udta')
    if (udta) {
        const meta = udta.children.find((node) => node.type === 'meta')
        const ilst = meta?.children.find((node) => node.type === 'ilst')
        if (ilst) return ilst
    }

    const meta = moov.children.find((node) => node.type === 'meta')
    return meta?.children.find((node) => node.type === 'ilst')
}

function writeBoxSize(buffer: Buffer, node: Mp4BoxNode, size: number): void {
    if (node.headerSize === 16) {
        buffer.writeBigUInt64BE(BigInt(size), node.offset + 8)
    } else {
        buffer.writeUInt32BE(size, node.offset)
    }
}

function patchAncestorSizes(
    buffer: Buffer,
    moovRoot: Mp4BoxNode,
    changedNode: Mp4BoxNode,
    delta: number
): void {
    function walk(
        node: Mp4BoxNode,
        ancestors: Mp4BoxNode[]
    ): boolean {
        if (node.offset === changedNode.offset && node.type === changedNode.type) {
            for (let i = ancestors.length - 1; i >= 0; i--) {
                const ancestor = ancestors[i]!
                writeBoxSize(buffer, ancestor, ancestor.size + delta)
            }
            writeBoxSize(buffer, moovRoot, moovRoot.size + delta)
            return true
        }

        for (const child of node.children) {
            if (walk(child, [...ancestors, node])) return true
        }
        return false
    }

    walk(moovRoot, [])
}

function buildDataTextAtom(text: string): Buffer {
    const value = Buffer.from(text, 'utf8')
    const atom = Buffer.alloc(16 + value.length)
    atom.writeUInt32BE(atom.length, 0)
    atom.write('data', 4)
    atom.writeUInt32BE(1, 8)
    atom.writeUInt32BE(0, 12)
    value.copy(atom, 16)
    return atom
}

function buildDataBinaryAtom(value: Buffer, dataType = 0): Buffer {
    const atom = Buffer.alloc(16 + value.length)
    atom.writeUInt32BE(atom.length, 0)
    atom.write('data', 4)
    atom.writeUInt32BE(dataType, 8)
    atom.writeUInt32BE(0, 12)
    value.copy(atom, 16)
    return atom
}

function buildTrackDiscBinary(no: number, total?: number): Buffer {
    const value = Buffer.alloc(8)
    value.writeUInt16BE(0, 0)
    value.writeUInt16BE(no, 2)
    value.writeUInt16BE(0, 4)
    value.writeUInt16BE(total ?? 0, 6)
    return value
}

function buildIlstItem(fourcc: string, dataAtoms: Buffer[]): Buffer {
    const payload = Buffer.concat(dataAtoms)
    const item = Buffer.alloc(8 + payload.length)
    item.writeUInt32BE(item.length, 0)
    item.write(fourcc, 4, fourcc.length, 'latin1')
    payload.copy(item, 8)
    return item
}

function buildIlstAtom(items: Buffer[]): Buffer {
    const payload = Buffer.concat(items)
    const ilst = Buffer.alloc(8 + payload.length)
    ilst.writeUInt32BE(ilst.length, 0)
    ilst.write('ilst', 4)
    payload.copy(ilst, 8)
    return ilst
}

function buildHdlrBox(): Buffer {
    const name = Buffer.from('SongVault\0', 'utf8')
    const content = Buffer.alloc(4 + 4 + 12 + name.length)
    content.writeUInt32BE(0, 0)
    content.write('mdir', 4, 4, 'ascii')
    name.copy(content, 20)

    const hdlr = Buffer.alloc(12 + content.length)
    hdlr.writeUInt32BE(hdlr.length, 0)
    hdlr.write('hdlr', 4)
    hdlr.writeUInt32BE(0, 8)
    content.copy(hdlr, 12)
    return hdlr
}

function buildMetaAtom(ilst: Buffer): Buffer {
    const body = Buffer.concat([buildHdlrBox(), ilst])
    const meta = Buffer.alloc(12 + body.length)
    meta.writeUInt32BE(meta.length, 0)
    meta.write('meta', 4)
    meta.writeUInt32BE(0, 8)
    body.copy(meta, 12)
    return meta
}

function buildUdtaAtom(meta: Buffer): Buffer {
    const udta = Buffer.alloc(8 + meta.length)
    udta.writeUInt32BE(udta.length, 0)
    udta.write('udta', 4)
    meta.copy(udta, 8)
    return udta
}

function parseDataAtomValue(dataAtom: Buffer): {
    dataType: number
    value: Buffer
} {
    if (dataAtom.length < 16) {
        throw new Error('data atom 过短')
    }
    const dataType = dataAtom.readUInt32BE(8)
    const value = dataAtom.subarray(16)
    return { dataType, value }
}

function parseIlstItem(itemBuffer: Buffer): Mp4IlstField | null {
    if (itemBuffer.length < 8) return null
    const fourcc = itemBuffer.toString('latin1', 4, 8)
    const values: string[] = []
    let binary = false
    let dataType = 1
    let offset = 8

    while (offset + 8 <= itemBuffer.length) {
        const childSize = itemBuffer.readUInt32BE(offset)
        if (childSize < 8 || offset + childSize > itemBuffer.length) {
            break
        }

        const childType = itemBuffer.toString('ascii', offset + 4, offset + 8)
        if (childType !== 'data') break

        const child = itemBuffer.subarray(offset, offset + childSize)
        const parsed = parseDataAtomValue(child)
        dataType = parsed.dataType

        if (parsed.dataType === 1) {
            values.push(parsed.value.toString('utf8'))
        } else if (fourcc === 'trkn' || fourcc === 'disk') {
            if (parsed.value.length >= 4) {
                const no = parsed.value.readUInt16BE(2)
                const total =
                    parsed.value.length >= 8
                        ? parsed.value.readUInt16BE(6)
                        : 0
                values.push(total > 0 ? `${no}/${total}` : String(no))
            }
            binary = true
        } else if (parsed.dataType === 21 && parsed.value.length >= 2) {
            values.push(String(parsed.value.readUInt16BE(0)))
            binary = true
        } else {
            values.push(parsed.value.toString('utf8'))
            binary = true
        }

        offset += childSize
    }

    if (!values.length) return null
    return { fourcc, values, binary, dataType }
}

export function parseIlstFields(ilstBuffer: Buffer): Mp4IlstField[] {
    const fields: Mp4IlstField[] = []
    let offset = 8

    while (offset + 8 <= ilstBuffer.length) {
        const itemSize = ilstBuffer.readUInt32BE(offset)
        if (itemSize < 8 || offset + itemSize > ilstBuffer.length) {
            break
        }
        const item = ilstBuffer.subarray(offset, offset + itemSize)
        const parsed = parseIlstItem(item)
        if (parsed) fields.push(parsed)
        offset += itemSize
    }

    return fields
}

function vorbisKeyToItunesAtom(key: string): string | undefined {
    const upper = key.trim().toUpperCase()
    if (VORBIS_KEY_TO_ITUNES_ATOM[upper]) {
        return VORBIS_KEY_TO_ITUNES_ATOM[upper]
    }
    if (key.length === 4) return key
    return undefined
}

function buildIlstItemsFromFields(fields: Mp4IlstField[]): Buffer[] {
    const items: Buffer[] = []

    for (const field of fields) {
        const dataAtoms: Buffer[] = []

        if (field.fourcc === 'trkn' || field.fourcc === 'disk') {
            for (const raw of field.values) {
                const [noRaw, totalRaw] = raw.split('/')
                const no = Number.parseInt(noRaw ?? '', 10)
                if (!Number.isFinite(no) || no <= 0) continue
                const total = Number.parseInt(totalRaw ?? '', 10)
                dataAtoms.push(
                    buildDataBinaryAtom(
                        buildTrackDiscBinary(
                            no,
                            Number.isFinite(total) && total > 0 ? total : undefined
                        ),
                        0
                    )
                )
            }
        } else if (field.fourcc === 'tmpo') {
            for (const raw of field.values) {
                const n = Number.parseInt(raw, 10)
                if (!Number.isFinite(n) || n <= 0) continue
                const buf = Buffer.alloc(2)
                buf.writeUInt16BE(n, 0)
                dataAtoms.push(buildDataBinaryAtom(buf, 21))
            }
        } else {
            for (const value of field.values) {
                const trimmed = value.trim()
                if (!trimmed) continue
                dataAtoms.push(buildDataTextAtom(trimmed))
            }
        }

        if (dataAtoms.length > 0) {
            items.push(buildIlstItem(field.fourcc, dataAtoms))
        }
    }

    return items
}

export function collectItunesIlstFields(
    meta: {
        title?: string
        artists?: string[]
        album?: string
        albumartist?: string
        genre?: string[]
        year?: number
        date?: string
        trackNo?: number
        trackOf?: number
        diskNo?: number
        diskOf?: number
        comment?: string[]
        lyrics?: string[]
        composer?: string[]
        lyricist?: string[]
        conductor?: string[]
        remixer?: string[]
        producer?: string[]
        label?: string[]
        grouping?: string
        subtitle?: string[]
        bpm?: number
        catalognumber?: string[]
    },
    extraTags: Array<{ tagKey: string; value: string }> = []
): Mp4IlstField[] {
    const fields: Mp4IlstField[] = []

    const pushText = (fourcc: string, values: string[] | undefined): void => {
        const trimmed = values?.map((v) => v.trim()).filter(Boolean) ?? []
        if (!trimmed.length) return
        fields.push({ fourcc, values: trimmed })
    }

    if (meta.title?.trim()) {
        pushText('\xa9nam', [meta.title.trim()])
    }
    pushText('\xa9ART', meta.artists)
    pushText('\xa9alb', meta.album ? [meta.album] : undefined)
    pushText('aART', meta.albumartist ? [meta.albumartist] : undefined)
    pushText('\xa9gen', meta.genre)
    if (meta.date?.trim()) pushText('\xa9day', [meta.date.trim()])
    else if (meta.year) pushText('\xa9day', [String(meta.year)])

    if (meta.trackNo) {
        const value =
            meta.trackOf && meta.trackOf > 0
                ? `${meta.trackNo}/${meta.trackOf}`
                : String(meta.trackNo)
        fields.push({ fourcc: 'trkn', values: [value], binary: true, dataType: 0 })
    }

    if (meta.diskNo) {
        const value =
            meta.diskOf && meta.diskOf > 0
                ? `${meta.diskNo}/${meta.diskOf}`
                : String(meta.diskNo)
        fields.push({ fourcc: 'disk', values: [value], binary: true, dataType: 0 })
    }

    pushText('\xa9cmt', meta.comment)
    if (meta.lyrics?.length) {
        pushText('\xa9lyr', [meta.lyrics.join('\n\n')])
    }
    pushText('\xa9wrt', meta.composer)
    pushText('\xa9con', meta.conductor)
    pushText('\xa9rem', meta.remixer)
    pushText('\xa9prd', meta.producer)
    pushText('\xa9pub', meta.label)
    if (meta.grouping?.trim()) pushText('\xa9grp', [meta.grouping.trim()])
    pushText('\xa9st3', meta.subtitle)
    pushText('catn', meta.catalognumber)
    if (meta.bpm) {
        fields.push({
            fourcc: 'tmpo',
            values: [String(meta.bpm)],
            binary: true,
            dataType: 21
        })
    }

    const groupedExtras = new Map<string, string[]>()
    for (const entry of extraTags) {
        const atom =
            vorbisKeyToItunesAtom(entry.tagKey) ??
            (entry.tagKey.length === 4 ? entry.tagKey : undefined)
        const value = entry.value.trim()
        if (!atom || !value) continue
        if (MANAGED_ITUNES_ATOMS.has(atom)) continue
        if (!groupedExtras.has(atom)) groupedExtras.set(atom, [])
        groupedExtras.get(atom)!.push(value)
    }

    for (const [fourcc, values] of groupedExtras) {
        fields.push({ fourcc, values })
    }

    return fields
}

function mergePreservedUnmanagedIlst(
    managed: Mp4IlstField[],
    preserved: Mp4IlstField[]
): Mp4IlstField[] {
    const managedKeys = new Set(managed.map((field) => field.fourcc))
    const out = [...managed]

    for (const field of preserved) {
        if (MANAGED_ITUNES_ATOMS.has(field.fourcc)) continue
        if (managedKeys.has(field.fourcc)) continue
        out.push(field)
    }

    return out
}

function replaceOrInsertIlstInMoov(
    moovBuffer: Buffer,
    newIlst: Buffer
): Buffer {
    const tree = parseBoxTree(moovBuffer, 0, moovBuffer.length)
    const moovNode = tree[0]
    if (!moovNode || moovNode.type !== 'moov') {
        throw new Error('不是有效的 moov box')
    }

    const ilstNode = findIlstNode(moovNode)
    if (ilstNode) {
        const delta = newIlst.length - ilstNode.size
        const out = Buffer.from(moovBuffer)
        newIlst.copy(out, ilstNode.offset)
        if (delta !== 0) {
            patchAncestorSizes(out, moovNode, ilstNode, delta)
        }
        return out
    }

    const udtaNode = moovNode.children.find((node) => node.type === 'udta')
    const metaNode =
        udtaNode?.children.find((node) => node.type === 'meta') ??
        moovNode.children.find((node) => node.type === 'meta')

    if (metaNode) {
        const insertAt = metaNode.contentEnd
        const merged = Buffer.concat([
            moovBuffer.subarray(0, insertAt),
            newIlst,
            moovBuffer.subarray(insertAt)
        ])
        const reparsed = parseBoxTree(merged, 0, merged.length)
        const newMoovNode = reparsed[0]
        const newIlstNode = newMoovNode ? findIlstNode(newMoovNode) : undefined
        if (!newMoovNode || !newIlstNode) {
            throw new Error('插入 ilst 失败')
        }
        const patched = Buffer.from(merged)
        patchAncestorSizes(patched, newMoovNode, newIlstNode, newIlst.length)
        return patched
    }

    const udta = buildUdtaAtom(buildMetaAtom(newIlst))
    const merged = Buffer.concat([
        moovBuffer.subarray(0, moovNode.contentEnd),
        udta
    ])
    const patched = Buffer.from(merged)
    writeBoxSize(patched, moovNode, moovNode.size + udta.length)
    return patched
}

function patchChunkOffsetsInMoov(moovBuffer: Buffer, delta: number): void {
    const tree = parseBoxTree(moovBuffer, 0, moovBuffer.length)

    function walk(node: Mp4BoxNode): void {
        if (node.type === 'stco') {
            const count = moovBuffer.readUInt32BE(node.contentStart + 4)
            let offset = node.contentStart + 8
            for (let i = 0; i < count; i++) {
                const current = moovBuffer.readUInt32BE(offset)
                moovBuffer.writeUInt32BE(current + delta, offset)
                offset += 4
            }
        } else if (node.type === 'co64') {
            const count = moovBuffer.readUInt32BE(node.contentStart + 4)
            let offset = node.contentStart + 8
            for (let i = 0; i < count; i++) {
                const current = moovBuffer.readBigUInt64BE(offset)
                moovBuffer.writeBigUInt64BE(current + BigInt(delta), offset)
                offset += 8
            }
        }

        for (const child of node.children) walk(child)
    }

    for (const child of tree) walk(child)
}

function rebuildFileWithMoov(fileBuffer: Buffer, newMoov: Buffer): Buffer {
    const top = parseBoxTree(fileBuffer, 0, fileBuffer.length)
    const moovNode = top.find((node) => node.type === 'moov')
    if (!moovNode) {
        throw new Error('MP4 文件缺少 moov box')
    }

    const delta = newMoov.length - moovNode.size
    const mdatNode = top.find((node) => node.type === 'mdat')

    if (
        delta !== 0 &&
        mdatNode &&
        moovNode.offset < mdatNode.offset
    ) {
        patchChunkOffsetsInMoov(newMoov, delta)
    }

    const allowedTop = new Set(['ftyp', 'mdat', 'moov', 'free', 'skip', 'wide'])
    const parts: Buffer[] = []
    for (const node of top) {
        if (!allowedTop.has(node.type)) continue
        if (node.type === 'moov') {
            parts.push(newMoov)
        } else {
            parts.push(fileBuffer.subarray(node.offset, node.contentEnd))
        }
    }
    return Buffer.concat(parts)
}

/** 解析 MP4 box 树（测试 / 调试） */
export function parseMp4BoxTree(
    buffer: Buffer,
    start = 0,
    end = buffer.length
): Mp4BoxNode[] {
    return parseBoxTree(buffer, start, end)
}

export function readIlstFieldsFromBuffer(buffer: Buffer): Mp4IlstField[] {
    const top = parseBoxTree(buffer, 0, buffer.length)
    const moov = top.find((node) => node.type === 'moov')
    if (!moov) return []

    const moovSlice = buffer.subarray(moov.offset, moov.contentEnd)
    const moovTree = parseBoxTree(moovSlice, 0, moovSlice.length)
    const moovNode = moovTree[0]
    if (!moovNode) return []

    const ilstNode = findIlstNode(moovNode)
    if (!ilstNode) return []

    return parseIlstFields(
        moovSlice.subarray(ilstNode.offset, ilstNode.contentEnd)
    )
}

export function readUnmanagedItunesTagsFromBuffer(
    buffer: Buffer
): Mp4IlstField[] {
    return readIlstFieldsFromBuffer(buffer).filter(
        (field) => !MANAGED_ITUNES_ATOMS.has(field.fourcc)
    )
}

/** 校验 MP4/M4A 是否含 moov */
export function validateMp4BufferStructure(buffer: Buffer): void {
    const top = parseBoxTree(buffer, 0, buffer.length)
    const moov = top.find((node) => node.type === 'moov')
    if (!moov) {
        throw new Error('不是有效的 MP4/M4A 文件（缺少 moov）')
    }
}

export function rebuildMp4WithItunesTags(
    buffer: Buffer,
    fields: Mp4IlstField[],
    options: {
        preserveUnmanaged?: Mp4IlstField[]
    } = {}
): Buffer {
    const top = parseBoxTree(buffer, 0, buffer.length)
    const moovNode = top.find((node) => node.type === 'moov')
    if (!moovNode) {
        throw new Error('MP4 文件缺少 moov box')
    }

    let mergedFields = fields
    if (options.preserveUnmanaged?.length) {
        mergedFields = mergePreservedUnmanagedIlst(fields, options.preserveUnmanaged)
    }

    const ilst = buildIlstAtom(buildIlstItemsFromFields(mergedFields))
    const moovSlice = buffer.subarray(moovNode.offset, moovNode.contentEnd)
    const newMoov = replaceOrInsertIlstInMoov(moovSlice, ilst)
    return rebuildFileWithMoov(buffer, newMoov)
}
