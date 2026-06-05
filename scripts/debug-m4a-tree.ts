import fs from 'fs'
import os from 'os'
import path from 'path'
import {
    parseMp4BoxTree,
    readIlstFieldsFromBuffer
} from '../src/unlock-music/decrypt/mp4Rewrite'

function walk(nodes: ReturnType<typeof parseMp4BoxTree>, depth = 0): void {
    for (const node of nodes) {
        console.log(`${'  '.repeat(depth)}${node.type} ${node.size}`)
        walk(node.children, depth + 1)
    }
}

function findIlstNodeExport(nodes: ReturnType<typeof parseMp4BoxTree>) {
    for (const node of nodes) {
        if (node.type === 'moov') {
            return findIlstNodeInternal(node)
        }
    }
    return undefined
}

function findIlstNodeInternal(node: {
    type: string
    children: Array<{ type: string; children: unknown[] }>
}): unknown {
    const udta = node.children.find((child) => child.type === 'udta')
    if (udta) {
        const meta = udta.children.find((child) => child.type === 'meta')
        const ilst = meta?.children.find((child) => child.type === 'ilst')
        if (ilst) return ilst
    }
    const meta = node.children.find((child) => child.type === 'meta')
    return meta?.children.find((child) => child.type === 'ilst')
}

const tmp = fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith('songvault-m4a-test-'))
    .sort()
    .pop()!
const buf = fs.readFileSync(path.join(os.tmpdir(), tmp))
console.log('file length', buf.length)

const top = parseMp4BoxTree(buf)
walk(top)

const moov = top.find((node) => node.type === 'moov')
if (moov) {
    const moovSlice = buf.subarray(moov.offset, moov.contentEnd)
    console.log('moov slice length', moovSlice.length)
    const moovTree = parseMp4BoxTree(moovSlice)
    walk(moovTree)
    console.log('ilst node', findIlstNodeInternal(moovTree[0]!))
}

console.log('fields', readIlstFieldsFromBuffer(buf))
