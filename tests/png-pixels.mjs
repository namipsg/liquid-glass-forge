// Decode only noninterlaced RGB/RGBA8 screenshots; reject everything else explicitly.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
export function screenshotPixels(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  let width, height, channels; const chunks = [];
  for (let at = 8; at < bytes.length;) {
    const size = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + size);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8); assert.ok([2, 6].includes(data[9])); assert.equal(data[12], 0);
      channels = data[9] === 6 ? 4 : 3;
    }
    if (type === 'IDAT') chunks.push(data);
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels, decoded = Buffer.alloc(height * stride);
  const paeth = (a,b,c) => { const p=a+b-c, x=Math.abs(p-a), y=Math.abs(p-b), z=Math.abs(p-c); return x<=y && x<=z ? a : y<=z ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? decoded[y*stride+x-channels] : 0, b = y ? decoded[(y-1)*stride+x] : 0,
        c = y && x >= channels ? decoded[(y-1)*stride+x-channels] : 0;
      const predictor = [0, a, b, Math.floor((a+b)/2), paeth(a,b,c)][filter];
      decoded[y*stride+x] = (raw[y*(stride+1)+1+x] + predictor) & 255;
    }
  }
  return { width, height, pixel(x,y) { assert.ok(x>=0 && y>=0 && x<width && y<height); const at=y*stride+x*channels; return [...decoded.subarray(at, at+3), channels===4 ? decoded[at+3] : 255]; } };
}
