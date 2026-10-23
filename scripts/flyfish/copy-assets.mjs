import { execFileSync } from 'node:child_process'
import catalog from '../../src/flyfish/catalog.generated.json' with { type: 'json' }

if (!/^\d+\.\d+\.\d+$/.test(catalog.version)) throw new Error('Use an explicit stable asset version')
const target = `./public/file-viewer/${catalog.version}`
for (const [command, destination] of [
  ['file-viewer-copy-assets', target],
  ['file-viewer-ifc-assets', `${target}/vendor/ifc`],
  ['file-viewer-geo3d-assets', `${target}/vendor/geo3d`],
]) execFileSync(command, [destination], { stdio: 'inherit' })
