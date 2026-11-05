import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';

const input = process.argv[2];
if (!input) throw Error('Pass the supplied 720p.mp4 as the first argument.');
const digest = createHash('sha256');
for await (const chunk of createReadStream(input)) digest.update(chunk);
const sha256 = digest.digest('hex');
if (sha256 !== '2bd1b2116f70a2ed61e6d2331370f7fb6774594ea8f847e56739542c4baca9c3') {
  throw Error('This installer expects the supplied Sprite Fright file.');
}
await access('showcase/dist/examples.html');
const output = 'showcase/dist/media/local-film';
await mkdir(output, { recursive: true });
await copyFile(input, `${output}/sprite-fright.mp4`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '16', '-i', input, '-frames:v', '1', '-update', '1', `${output}/poster.jpg`], { stdio: 'inherit' });
await writeFile(`${output}/index.json`, JSON.stringify({
  schemaVersion: 1, localOnly: true, title: 'Sprite Fright', sha256,
  file: 'sprite-fright.mp4', poster: 'poster.jpg', posterSeconds: 16,
  credit: 'Blender Foundation / Blender Studio',
  source: 'https://studio.blender.org/films/sprite-fright/',
  license: 'https://studio.blender.org/projects/sprite-fright/pages/about/',
}, null, 2) + '\n');
console.log(JSON.stringify({ output, sha256, localOnly: true }));
