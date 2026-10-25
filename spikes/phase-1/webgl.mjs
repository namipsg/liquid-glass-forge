// Original Phase 1 spike: one shared context, one persistent output attachment.
// Importing this module does not access the DOM or allocate browser resources.
const MAX_PIXELS = 4_000_000;
const MAX_EFFECT = 1_000_000;
const ENCODING_BYTES = 64 * 64 * 4 * Float32Array.BYTES_PER_ELEMENT;

function encodingTextureData() {
  const data = new Float32Array(64 * 64 * 4);
  const decode = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  for (let i = 0; i < 4096; i++) {
    const value = (i + .5) / 4096;
    const byte = Math.round((value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055) * 255);
    data.set([byte, byte ? decode((byte - .5) / 255) : -1,
      byte < 255 ? decode((byte + .5) / 255) : 2, 0], i * 4);
  }
  return data;
}

export class WebGLRendererError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WebGLRendererError';
    this.code = code;
  }
}

function dimensions(width, height, label) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new RangeError(`${label} dimensions must be positive integers totaling at most ${MAX_PIXELS} pixels`);
  }
}

function finiteRange(value, low, high, label) {
  if (!Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`${label} must be finite and between ${low} and ${high}`);
  }
}

// Match the local Canvas2D byte-storage convention, not a browser name. The
// optical calculation stays in linear light; this only calibrates presentation.
function canvasStorageProfile() {
  const probe = document.createElement('canvas');
  probe.width = 6; probe.height = 1;
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) throw new WebGLRendererError('TARGET_UNAVAILABLE', 'Canvas2D unavailable');
  const bytes = new Uint8ClampedArray([93, 24, 240, 57, 220, 78, 25, 62,
    1, 255, 150, 1, 13, 120, 250, 13, 140, 35, 97, 128, 255, 10, 2, 255]);
  context.putImageData(new ImageData(bytes, 6, 1), 0, 0);
  const actual = context.getImageData(0, 0, 6, 1).data;
  for (const [name, up] of [['nearest', false], ['upward', true]]) {
    const matches = bytes.every((value, index) => {
      if (index % 4 === 3) return actual[index] === value;
      const alpha = bytes[index - index % 4 + 3];
      const premultiplied = Math.floor((value * alpha + (up ? 254 : 127)) / 255);
      const straight = up ? Math.floor(premultiplied * 255 / alpha) : Math.round(premultiplied * 255 / alpha);
      return actual[index] === Math.min(255, straight);
    });
    if (matches) return { name, quantizeUp: up };
  }
  throw new WebGLRendererError('ALPHA_STORAGE_UNSUPPORTED', 'Canvas2D alpha storage did not match a tested presentation profile');
}

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uSource;
uniform highp sampler2D uEncoding;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform vec4 uRect;
uniform float uRadius;
uniform float uBevel;
uniform float uStrength;
uniform bool uQuantizeUp;
out vec4 result;

float encodeByte(float v) {
  int index = min(int(v * 4096.0), 4095);
  vec3 entry = texelFetch(uEncoding, ivec2(index & 63, index >> 6), 0).rgb;
  return entry.r + (v >= entry.b ? 1.0 : (v < entry.g ? -1.0 : 0.0));
}
vec4 linearPremultiplied(ivec2 xy) {
  vec4 c = texelFetch(uSource, xy, 0);
  return vec4(c.rgb * c.a, c.a);
}
void main() {
  // FBO top rows correspond to source row zero and Canvas2D's top edge.
  vec2 local = gl_FragCoord.xy - uOrigin;
  vec2 center = vec2(local.x, uSize.y - local.y);
  vec2 p = center - uSize * 0.5;
  vec2 q = abs(p) - (uSize * 0.5 - uRadius);
  vec2 positive = max(q, 0.0);
  float len = length(positive);
  float sdf = len + min(max(q.x, q.y), 0.0) - uRadius;
  float mask = clamp(0.5 - sdf, 0.0, 1.0);
  if (mask == 0.0) { result = vec4(0.0); return; }
  vec2 normal = len > 0.0 ? positive / len * sign(p)
    : (q.x > q.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y)));
  float weight = clamp(1.0 + sdf / uBevel, 0.0, 1.0);
  weight *= weight;
  ivec2 sourceSize = textureSize(uSource, 0);
  vec2 scale = uRect.zw / uSize;
  vec2 sampleAt = clamp(center * scale + uRect.xy - 0.5
    + normal * uStrength * weight * scale, vec2(0.0), vec2(sourceSize - 1));
  ivec2 lo = ivec2(floor(sampleAt));
  ivec2 hi = min(lo + 1, sourceSize - 1);
  vec2 t = fract(sampleAt);
  // Interpolation is manual, after sRGB decoding and alpha premultiplication.
  vec4 a = linearPremultiplied(lo);
  vec4 b = linearPremultiplied(ivec2(hi.x, lo.y));
  vec4 c = linearPremultiplied(ivec2(lo.x, hi.y));
  vec4 d = linearPremultiplied(hi);
  vec4 sampled = (a * (1.0 - t.x) + b * t.x) * (1.0 - t.y)
    + (c * (1.0 - t.x) + d * t.x) * t.y;
  float alphaByte = floor(sampled.a * mask * 255.0 + 0.5);
  if (alphaByte == 0.0) { result = vec4(0.0); return; }
  vec3 straight = clamp(sampled.rgb / sampled.a, 0.0, 1.0);
  ivec3 rgbByte = ivec3(encodeByte(straight.r), encodeByte(straight.g), encodeByte(straight.b));
  ivec3 premultipliedByte = (rgbByte * int(alphaByte) + (uQuantizeUp ? 254 : 127)) / 255;
  result = vec4(vec3(premultipliedByte) / 255.0, alphaByte / 255.0);
}`;

/** Source is borrowed straight-alpha sRGB RGBA8, with row zero at the top. */
export function createWebGLRenderer(sourceRGBA8) {
  if (!sourceRGBA8 || typeof sourceRGBA8 !== 'object') throw new TypeError('source is required');
  const { width: sourceWidth, height: sourceHeight, data } = sourceRGBA8;
  dimensions(sourceWidth, sourceHeight, 'source');
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)
    || data.length !== sourceWidth * sourceHeight * 4) {
    throw new TypeError('source data must be an RGBA8 byte array of exactly width * height * 4 elements');
  }
  if (typeof document === 'undefined') {
    throw new WebGLRendererError('DOM_UNAVAILABLE', 'WebGL renderer creation requires a document');
  }
  const storageProfile = canvasStorageProfile();
  const snapshot = document.createElement('canvas');
  snapshot.width = snapshot.height = 1;
  const snapshotContext = snapshot.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!snapshotContext) throw new WebGLRendererError('TARGET_UNAVAILABLE', 'Canvas2D snapshot unavailable');
  const canvas = document.createElement('canvas'); // Never appended to the DOM.
  canvas.width = canvas.height = 1;
  const requestedAttributes = {
    alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false,
    antialias: false, depth: false, stencil: false,
  };
  let gl;
  try { gl = canvas.getContext('webgl2', requestedAttributes); }
  catch (error) { throw new WebGLRendererError('WEBGL_UNAVAILABLE', `WebGL2 creation failed: ${error.message}`); }
  if (!gl) throw new WebGLRendererError('WEBGL_UNAVAILABLE', 'WebGL2 is unavailable');

  const textures = new Set();
  const framebuffers = new Set();
  const programs = new Set();
  const shaders = new Set();
  let destroyed = false;
  let lost = false;
  let width = 0;
  let height = 0;
  let renderCount = 0;
  let sourceTexture = null;
  let outputTexture = null;
  let encodingTexture = null;
  let framebuffer = null;
  let program = null;
  let uniforms;
  let attributes;
  let maxTextureSize;
  let maxViewport;
  let lastTargetAttributes = null;
  let batchCount = 0;
  let lastBatch = null;
  const onLost = () => { lost = true; }; // Phase 1 deliberately does not recover.
  canvas.addEventListener('webglcontextlost', onLost);

  function assertLive() {
    if (destroyed) throw new WebGLRendererError('DESTROYED', 'Renderer has been destroyed');
    if (lost || gl.isContextLost()) {
      lost = true;
      throw new WebGLRendererError('CONTEXT_LOST', 'WebGL context was lost; create a new renderer');
    }
  }

  function checkGl(operation) {
    assertLive();
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new WebGLRendererError('WEBGL_ERROR', `${operation} failed with WebGL error 0x${error.toString(16)}`);
    }
  }

  function create(kind, set) {
    const resource = gl[`create${kind}`]();
    if (!resource) {
      assertLive();
      throw new WebGLRendererError('ALLOCATION_FAILED', `Could not allocate ${kind}`);
    }
    set.add(resource);
    return resource;
  }

  function removeTexture(texture) {
    if (texture) { gl.deleteTexture(texture); textures.delete(texture); }
  }
  function removeFramebuffer(target) {
    if (target) { gl.deleteFramebuffer(target); framebuffers.delete(target); }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    canvas.removeEventListener('webglcontextlost', onLost);
    for (const shader of shaders) gl.deleteShader(shader);
    for (const item of programs) gl.deleteProgram(item);
    for (const texture of textures) gl.deleteTexture(texture);
    for (const target of framebuffers) gl.deleteFramebuffer(target);
    shaders.clear(); programs.clear(); textures.clear(); framebuffers.clear();
    sourceTexture = outputTexture = encodingTexture = framebuffer = program = null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = canvas.height = 1;
    snapshot.width = snapshot.height = 0;
    width = height = 0;
  }

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new WebGLRendererError('ALLOCATION_FAILED', 'Could not allocate shader');
    shaders.add(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      assertLive();
      throw new WebGLRendererError('SHADER_COMPILE_FAILED', gl.getShaderInfoLog(shader) || 'Shader compilation failed');
    }
    return shader;
  }

  function configureTexture(texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function resize(nextWidth, nextHeight) {
    if (nextWidth === width && nextHeight === height) {
      if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) {
        throw new WebGLRendererError('SIZE_UNSUPPORTED', 'Browser could not allocate the requested drawing buffer');
      }
      return;
    }
    if (nextWidth > maxTextureSize || nextHeight > maxTextureSize
      || nextWidth > maxViewport[0] || nextHeight > maxViewport[1]) {
      throw new WebGLRendererError('SIZE_UNSUPPORTED', 'Output dimensions exceed this WebGL context limits');
    }
    let nextTexture = null;
    let nextFramebuffer = null;
    try {
      nextTexture = create('Texture', textures);
      configureTexture(nextTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nextWidth, nextHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      nextFramebuffer = create('Framebuffer', framebuffers);
      gl.bindFramebuffer(gl.FRAMEBUFFER, nextFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nextTexture, 0);
      checkGl('Output allocation');
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new WebGLRendererError('FRAMEBUFFER_INCOMPLETE', 'Persistent output framebuffer is incomplete');
      }
    } catch (error) {
      removeTexture(nextTexture);
      removeFramebuffer(nextFramebuffer);
      throw error;
    }
    removeTexture(outputTexture);
    removeFramebuffer(framebuffer);
    outputTexture = nextTexture;
    framebuffer = nextFramebuffer;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    assertLive();
    if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) {
      throw new WebGLRendererError('SIZE_UNSUPPORTED', 'Browser could not allocate the requested drawing buffer');
    }
  }

  try {
    assertLive();
    attributes = gl.getContextAttributes();
    if (!attributes || !attributes.alpha || !attributes.premultipliedAlpha
      || attributes.preserveDrawingBuffer || attributes.antialias) {
      throw new WebGLRendererError('ATTRIBUTES_UNSUPPORTED', 'Required WebGL alpha/drawing-buffer attributes were not granted');
    }
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    if (sourceWidth > maxTextureSize || sourceHeight > maxTextureSize) {
      throw new WebGLRendererError('SIZE_UNSUPPORTED', 'Source dimensions exceed this context texture limit');
    }
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    program = create('Program', programs);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      assertLive();
      throw new WebGLRendererError('PROGRAM_LINK_FAILED', gl.getProgramInfoLog(program) || 'Program linking failed');
    }
    for (const shader of shaders) { gl.detachShader(program, shader); gl.deleteShader(shader); }
    shaders.clear();
    uniforms = Object.fromEntries(['Source', 'Encoding', 'Size', 'Origin', 'Rect', 'Radius', 'Bevel', 'Strength', 'QuantizeUp']
      .map(name => [name, gl.getUniformLocation(program, `u${name}`)]));
    sourceTexture = create('Texture', textures);
    configureTexture(sourceTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    // Upload takes a snapshot without retaining or detaching the borrowed bytes.
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, sourceWidth, sourceHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    encodingTexture = create('Texture', textures);
    configureTexture(encodingTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 64, 64, 0, gl.RGBA, gl.FLOAT, encodingTextureData());
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    checkGl('Initialization');
  } catch (error) {
    destroy();
    throw error;
  }

  function prepareTarget(entry) {
    if (!entry || typeof entry !== 'object') throw new TypeError('Batch entry is required');
    const { options, target: targetCanvas } = entry;
    if (!options || typeof options !== 'object') throw new TypeError('render options are required');
    const { width: nextWidth, height: nextHeight } = options;
    dimensions(nextWidth, nextHeight, 'output');
    const radius = options.radius === undefined ? Math.min(nextWidth, nextHeight) / 4 : options.radius;
    const bevel = options.bevel === undefined ? Math.min(nextWidth, nextHeight) / 5 : options.bevel;
    const strength = options.strength === undefined ? 12 : options.strength;
    finiteRange(radius, 0, Math.min(nextWidth, nextHeight) / 2, 'radius');
    finiteRange(bevel, Number.MIN_VALUE, MAX_EFFECT, 'bevel');
    finiteRange(strength, 0, MAX_EFFECT, 'strength');
    const rect = options.sourceRect === undefined ? { x: 0, y: 0, width: sourceWidth, height: sourceHeight } : options.sourceRect;
    if (!rect || typeof rect !== 'object') throw new TypeError('sourceRect must be an object');
    finiteRange(rect.x, 0, sourceWidth, 'sourceRect.x');
    finiteRange(rect.y, 0, sourceHeight, 'sourceRect.y');
    finiteRange(rect.width, Number.MIN_VALUE, sourceWidth, 'sourceRect.width');
    finiteRange(rect.height, Number.MIN_VALUE, sourceHeight, 'sourceRect.height');
    if (rect.x + rect.width > sourceWidth || rect.y + rect.height > sourceHeight) {
      throw new RangeError('sourceRect must fit within the source');
    }
    if (!targetCanvas || typeof targetCanvas.getContext !== 'function') {
      throw new TypeError('targetCanvas must support a Canvas2D context');
    }
    const target = targetCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!target) throw new WebGLRendererError('TARGET_UNAVAILABLE', 'Target Canvas2D context is unavailable');
    lastTargetAttributes = target.getContextAttributes?.() ?? null;
    if (lastTargetAttributes?.alpha === false) {
      throw new WebGLRendererError('TARGET_ALPHA_UNSUPPORTED', 'Target Canvas2D context must support alpha');
    }
    return { targetCanvas, target, width: nextWidth, height: nextHeight, radius, bevel, strength, rect };
  }

  function renderBatch(entries) {
    assertLive();
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 16) throw new RangeError('Batch must contain 1..16 targets');
    const tiles = entries.map(prepareTarget);
    if (new Set(tiles.map(tile => tile.targetCanvas)).size !== tiles.length) throw new TypeError('Batch targets must be distinct');
    const cellWidth = Math.max(...tiles.map(tile => tile.width));
    const cellHeight = Math.max(...tiles.map(tile => tile.height));
    let layout = null;
    for (let columns = 1; columns <= tiles.length; columns++) {
      const w = columns * cellWidth, h = Math.ceil(tiles.length / columns) * cellHeight;
      if (w * h > MAX_PIXELS || w > maxTextureSize || h > maxTextureSize || w > maxViewport[0] || h > maxViewport[1]) continue;
      if (!layout || w * h < layout.width * layout.height
        || (w * h === layout.width * layout.height && Math.max(w, h) < Math.max(layout.width, layout.height))) layout = { columns, width: w, height: h };
    }
    if (!layout) throw new WebGLRendererError('BATCH_SIZE_UNSUPPORTED', 'Batch atlas exceeds this renderer limits');
    resize(layout.width, layout.height);
    const begin = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(uniforms.Source, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, encodingTexture);
    gl.uniform1i(uniforms.Encoding, 1);
    gl.uniform1i(uniforms.QuantizeUp, storageProfile.quantizeUp ? 1 : 0);
    tiles.forEach((tile, index) => {
      tile.x = index % layout.columns * cellWidth;
      tile.y = Math.floor(index / layout.columns) * cellHeight;
      const bottom = height - tile.y - tile.height;
      gl.viewport(tile.x, bottom, tile.width, tile.height);
      gl.uniform2f(uniforms.Size, tile.width, tile.height);
      gl.uniform2f(uniforms.Origin, tile.x, bottom);
      gl.uniform4f(uniforms.Rect, tile.rect.x, tile.rect.y, tile.rect.width, tile.rect.height);
      gl.uniform1f(uniforms.Radius, tile.radius);
      gl.uniform1f(uniforms.Bevel, Math.max(tile.bevel, 1.17549435e-38));
      gl.uniform1f(uniforms.Strength, tile.strength);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    checkGl('Batch draw and blit');
    const drawnAt = performance.now();
    if (snapshot.width !== width) snapshot.width = width;
    if (snapshot.height !== height) snapshot.height = height;
    snapshotContext.globalCompositeOperation = 'copy';
    snapshotContext.imageSmoothingEnabled = false;
    snapshotContext.drawImage(canvas, 0, 0); // Exactly one GPU snapshot per batch.
    const snapshotAt = performance.now();
    const completedAt = [];
    for (const tile of tiles) {
      if (tile.targetCanvas.width !== tile.width) tile.targetCanvas.width = tile.width;
      if (tile.targetCanvas.height !== tile.height) tile.targetCanvas.height = tile.height;
      // reset clears clipping/compositing state while reusing backing storage.
      if (typeof tile.target.reset === 'function') tile.target.reset();
      else tile.targetCanvas.width = tile.width;
      tile.target.globalCompositeOperation = 'copy';
      tile.target.imageSmoothingEnabled = false;
      tile.target.drawImage(snapshot, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
      completedAt.push(performance.now());
    }
    assertLive();
    renderCount += tiles.length;
    batchCount++;
    lastBatch = { targets: tiles.length, gpuSnapshots: 1, atlasWidth: width, atlasHeight: height,
      drawAndBlitMs: drawnAt - begin, snapshotMs: snapshotAt - drawnAt,
      targetCopyMs: completedAt.at(-1) - snapshotAt, completedAt };
    return { ...lastBatch, completedAt: [...completedAt] };
  }

  return {
    /** For controlled context-loss tests. Callers must not mutate other GL state. */
    get context() { return gl; },
    render(options, targetCanvas) {
      renderBatch([{ options, target: targetCanvas }]);
      return targetCanvas;
    },
    renderBatch,
    inspect() {
      const sourceBytes = sourceTexture ? sourceWidth * sourceHeight * 4 : 0;
      const outputBytes = outputTexture ? width * height * 4 : 0;
      const drawingBufferBytes = destroyed ? 0 : canvas.width * canvas.height * 4;
      const snapshotBytes = destroyed ? 0 : snapshot.width * snapshot.height * 4;
      const encodingBytes = encodingTexture ? ENCODING_BYTES : 0;
      return {
        backend: 'webgl', contextType: 'webgl2', destroyed, contextLost: lost || gl.isContextLost(),
        width, height, renderCount, batchCount, sourceWidth, sourceHeight,
        lastBatch: lastBatch ? { ...lastBatch, completedAt: [...lastBatch.completedAt] } : null,
        attributes: { ...attributes }, contextAttributes: { ...attributes },
        requestedAttributes: { ...requestedAttributes },
        requestedTargetAttributes: { alpha: true, willReadFrequently: true },
        lastTargetAttributes: lastTargetAttributes ? { ...lastTargetAttributes } : null,
        resources: {
          contexts: destroyed ? 0 : 1, textures: textures.size,
          sourceTextures: sourceTexture ? 1 : 0, outputTextures: outputTexture ? 1 : 0,
          encodingTextures: encodingTexture ? 1 : 0,
          framebuffers: framebuffers.size, programs: programs.size,
          shaders: shaders.size, buffers: 0, vertexArrays: 0,
        },
        estimatedOwnedBytes: sourceBytes + outputBytes + drawingBufferBytes + snapshotBytes + encodingBytes,
        storage: { sourceBytes, outputBytes, drawingBufferBytes, snapshotBytes, encodingBytes },
        presentationResources: { snapshotCanvases: destroyed ? 0 : 1 },
        // Estimates exclude driver overhead and target canvases owned by callers.
        storageProfile: storageProfile.name,
        colorConvention: 'straight sRGB source; bilinear in premultiplied linear light; calibrated premultiplied sRGB RGBA8 presentation',
      };
    },
    destroy,
  };
}
