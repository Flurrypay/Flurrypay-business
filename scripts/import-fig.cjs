// Local design import only. Never included in the browser bundle.
// Usage: node scripts/import-fig.cjs '/absolute/path/to/Flurrypay Business.fig'
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { decodeBinarySchema, compileSchema } = require('kiwi-schema');
const input = process.argv[2];
if (!input) throw new Error('Pass the path to the source .fig file.');
const root = path.resolve(__dirname, '..');
const cache = path.join(root, 'design', '.cache');
fs.mkdirSync(cache, { recursive: true });
const canvas = execFileSync('python3', ['-c', `
import zipfile,sys,json
from pathlib import Path
root=Path(sys.argv[2]);manifest=[]
with zipfile.ZipFile(sys.argv[1]) as z:
 for name in z.namelist():
  if not name.startswith('images/') or name.endswith('/'):continue
  data=z.read(name);ext='.png' if data.startswith(b'\\x89PNG') else '.jpg' if data.startswith(b'\\xff\\xd8') else '.webp' if data[8:12]==b'WEBP' else '.bin'
  filename=Path(name).name+ext;target=root/'public/design-assets'/filename;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  manifest.append({'figmaHash':Path(name).name,'path':'/design-assets/'+filename})
 (root/'design/asset-manifest.json').write_text(json.dumps(manifest,indent=2))
 (root/'design/thumbnail.png').write_bytes(z.read('thumbnail.png'))
 sys.stdout.buffer.write(z.read('canvas.fig'))
`, path.resolve(input), root], { maxBuffer: 128 * 1024 * 1024 });
if (canvas.toString('ascii', 0, 8) !== 'fig-kiwi') throw new Error('Unsupported Figma canvas format.');
const chunks = [];
for (let offset = 12; offset < canvas.length;) {
  const length = canvas.readUInt32LE(offset); offset += 4;
  const chunk = canvas.subarray(offset, offset + length); offset += length;
  chunks.push(chunk.readUInt32LE(0) === 0xfd2fb528 ? zlib.zstdDecompressSync(chunk) : zlib.inflateRawSync(chunk));
}
const message = compileSchema(decodeBinarySchema(chunks[0])).decodeMessage(chunks[1]);
const decoded = path.join(cache, 'decoded.json');
fs.writeFileSync(decoded, JSON.stringify(message));
execFileSync('python3', [path.join(__dirname, 'extract-design.py'), decoded], { stdio: 'inherit' });
