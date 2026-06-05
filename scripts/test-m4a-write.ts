import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseFile } from 'music-metadata'
import { WriteMetaToM4a } from '../src/unlock-music/decrypt/utils'
import { readIlstFieldsFromBuffer } from '../src/unlock-music/decrypt/mp4Rewrite'

async function main(): Promise<void> {
    const sourceArg = process.argv[2]
    const defaultDir = 'D:\\music-lossless\\录音'
    let source = sourceArg

    if (!source) {
        try {
            const entry = fs
                .readdirSync(defaultDir)
                .find((name) => /\.m4a$/i.test(name))
            if (entry) {
                source = path.join(defaultDir, entry)
            }
        } catch {
            /* ignore */
        }
    }

    if (!source || !fs.existsSync(source)) {
        console.error(
            'Usage: npx tsx scripts/test-m4a-write.ts [file.m4a]\n' +
                'Default: first .m4a in D:\\music-lossless\\录音'
        )
        process.exit(1)
    }

    const original = fs.readFileSync(source)
    const parsedBefore = await parseFile(source, {
        skipCovers: true,
        duration: false
    })

    console.log('Before:', {
        title: parsedBefore.common.title,
        artist: parsedBefore.common.artist,
        ilst: readIlstFieldsFromBuffer(original).map((field) => field.fourcc)
    })

    const tagged = WriteMetaToM4a(
        original,
        {
            title: 'M4A Write Test Title',
            artists: ['Test Artist A', 'Test Artist B']
        },
        parsedBefore,
        true
    )

    const tmp = path.join(
        os.tmpdir(),
        `songvault-m4a-test-${Date.now()}.m4a`
    )
    fs.writeFileSync(tmp, tagged)

    const parsedAfter = await parseFile(tmp, {
        skipCovers: true,
        duration: false
    })

    console.log('After:', {
        title: parsedAfter.common.title,
        artist: parsedAfter.common.artist,
        artists: parsedAfter.common.artists,
        taggedLength: tagged.length,
        ilst: readIlstFieldsFromBuffer(tagged).map((field) => field.fourcc)
    })

    console.log('Temp file:', tmp)

    if (parsedAfter.common.title !== 'M4A Write Test Title') {
        throw new Error('Title mismatch after write')
    }

    console.log('OK')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
