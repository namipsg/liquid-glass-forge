import { createFrame, validateSource, MAX_PIXELS } from '@liquid-glass-forge/core';
import type { PixelSource, SurfaceInput, SurfaceDescriptor } from '@liquid-glass-forge/core';
import { effects, type WebGLEffects } from './effects.js';
import { VERTEX, OPTICS, BLUR, encodingTextureData } from './shaders.js';

export class WebGLError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = 'WebGLError'; }
}
export const WEBGL_ATTRIBUTES = Object.freeze({ alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, antialias: false, depth: false, stencil: false });
export interface WebGLAtlasOptions { readonly maxBytes?: number; readonly maxRestores?: number; readonly canvasFactory?: () => HTMLCanvasElement }
export interface WebGLTile { readonly surface: SurfaceInput; readonly target: HTMLCanvasElement }
export interface WebGLUpdate {
  readonly generation?: number; readonly revision?: number; readonly dirtyIds?: readonly string[]; readonly effects?: WebGLEffects;
  readonly signal?: AbortSignal;
}
type Entry = { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; busy: boolean };
// Bounded lazy pool, not an animation service. Sequential scenes reuse a context
// after deleting their handles. No browser access occurs at import/construction.
const pool: Entry[] = [];
export function webglContextPoolDiagnostics() { return Object.freeze({ contexts: pool.length, leased: pool.filter(e => e.busy).length, idle: pool.filter(e => !e.busy).length, cap: 4 }); }
export function releaseIdleWebGLContexts(): void {
  for (let i = pool.length - 1; i >= 0; i--) if (!pool[i]!.busy) {
    const e = pool.splice(i, 1)[0]!; e.gl.getExtension('WEBGL_lose_context')?.loseContext(); e.canvas.width = e.canvas.height = 1;
  }
}
function acquire(factory?: () => HTMLCanvasElement): Entry {
  if (!factory) { const available = pool.find(e => !e.busy && !e.gl.isContextLost()); if (available) { available.busy = true; return available; } }
  if (!factory && pool.length >= 4) throw new WebGLError('CONTEXT_LIMIT', 'Four context slots are already retained; release idle/lost slots or share a scene');
  const canvas = factory ? factory() : document.createElement('canvas');
  canvas.width = canvas.height = 1;
  let gl: WebGL2RenderingContext | null;
  try { gl = canvas.getContext('webgl2', WEBGL_ATTRIBUTES) as WebGL2RenderingContext | null; }
  catch (cause) { throw new WebGLError('WEBGL_UNAVAILABLE', 'WebGL2 creation failed', { cause }); }
  if (!gl) throw new WebGLError('WEBGL_UNAVAILABLE', 'WebGL2 unavailable');
  const e = { canvas, gl, busy: true }; if (!factory) pool.push(e); return e;
}
function storageProfile(doc: Document): boolean {
  const canvas = doc.createElement('canvas'); canvas.width = 6; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new WebGLError('TARGET_UNAVAILABLE', 'Canvas2D unavailable');
  const bytes = new Uint8ClampedArray([93,24,240,57,220,78,25,62,1,255,150,1,13,120,250,13,140,35,97,128,255,10,2,255]);
  const image = ctx.createImageData(6,1); image.data.set(bytes); ctx.putImageData(image,0,0);
  const actual = ctx.getImageData(0,0,6,1).data;
  for (const up of [false,true]) if (bytes.every((v,i) => {
    if (i % 4 === 3) return actual[i] === v;
    const a = bytes[i - i % 4 + 3]!, p = Math.floor((v*a+(up?254:127))/255);
    return actual[i] === Math.min(255,up ? Math.floor(p*255/a) : Math.round(p*255/a));
  })) { canvas.width = canvas.height = 0; return up; }
  canvas.width = canvas.height = 0; throw new WebGLError('ALPHA_STORAGE_UNSUPPORTED', 'Unknown Canvas2D byte storage profile');
}
type Tile = { surface: SurfaceDescriptor; target: HTMLCanvasElement; ctx: CanvasRenderingContext2D; x: number; y: number };
type Program = { handle: WebGLProgram; locations: Record<string, WebGLUniformLocation | null> };
/** Persistent atlas. update() finishes GPU→default framebuffer→Canvas2D copies
 * synchronously, before returning. Callers own target canvases and source bytes. */
export class WebGLAtlas {
  readonly #options: Required<Pick<WebGLAtlasOptions,'maxBytes'|'maxRestores'>> & Pick<WebGLAtlasOptions,'canvasFactory'>;
  #entry: Entry | undefined; #state: 'new'|'ready'|'lost'|'unavailable'|'disposed' = 'new';
  #textures = new Set<WebGLTexture>(); #fbos = new Set<WebGLFramebuffer>(); #programs = new Set<WebGLProgram>(); #shaders = new Set<WebGLShader>();
  #optics: Program | undefined; #blur: Program | undefined; #source: WebGLTexture | undefined; #encoding: WebGLTexture | undefined;
  #output: WebGLTexture | undefined; #fbo: WebGLFramebuffer | undefined; #blurTextures: WebGLTexture[] = []; #blurFbos: WebGLFramebuffer[] = [];
  #snapshot: HTMLCanvasElement | undefined; #snapshotCtx: CanvasRenderingContext2D | undefined;
  #width = 0; #height = 0; #sourceWidth = 0; #sourceHeight = 0; #blurPixels = 0;
  #sourceLinear=false; #decodeProbeError:number|undefined;
  #maxSize = 0; #maxViewport: Int32Array = new Int32Array(2); #quantizeUp = false;
  #layoutKey = ''; #sourceKey = ''; #effectKey = ''; #blurKey = ''; #surfaceKeys = new Map<string,string>(); #targets = new Map<string,HTMLCanvasElement>();
  #lastGeneration = -1; #lastRevision = -1; #lastSourceRevision = -1;
  #restores = 0; #handleGeneration = 0; #draws = 0; #batches = 0; #uploads = 0; #targetBytes = 0;
  #lastBatch = { dirty: 0, gpuSnapshots: 0, uploadMs: 0, drawMs: 0, snapshotMs: 0, copyMs: 0, batchMs: 0, completedAt: [] as number[] };
  #failure: string | undefined;
  constructor(options: WebGLAtlasOptions = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options) || Reflect.ownKeys(options).some(k => typeof k !== 'string' || !['maxBytes','maxRestores','canvasFactory'].includes(k))) throw new WebGLError('INVALID_OPTIONS','Invalid atlas options');
    const maxBytes = options.maxBytes === undefined ? 64*1024**2 : options.maxBytes, maxRestores = options.maxRestores === undefined ? 2 : options.maxRestores;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 65544 || maxBytes > 256*1024**2 || !Number.isInteger(maxRestores) || maxRestores < 0 || maxRestores > 4 || (options.canvasFactory !== undefined && typeof options.canvasFactory !== 'function')) throw new WebGLError('INVALID_OPTIONS','Invalid WebGL resource limits');
    this.#options = { ...options, maxBytes, maxRestores };
  }
  get context(): WebGL2RenderingContext | undefined { return this.#entry?.gl; }
  get diagnostics() {
    return Object.freeze({ backend: 'webgl' as const, contextType: 'webgl2', state: this.#state, failure: this.#failure, restores: this.#restores,
      handleGeneration: this.#handleGeneration, width: this.#width, height: this.#height, sourceWidth: this.#sourceWidth, sourceHeight: this.#sourceHeight,
      renderCount: this.#draws, batchCount: this.#batches, uploadCount: this.#uploads, targetBytes: this.#targetBytes,
      requestedAttributes: WEBGL_ATTRIBUTES, attributes: this.#entry?.gl.getContextAttributes(), pool: webglContextPoolDiagnostics(),
      resources: Object.freeze({ contexts: this.#entry ? 1 : 0, textures: this.#textures.size, framebuffers: this.#fbos.size, programs: this.#programs.size, shaders: this.#shaders.size, buffers: 0, vertexArrays: 0 }),
      ownedImageBytes: this.#sourceWidth*this.#sourceHeight*4 + (this.#entry ? this.#entry.canvas.width*this.#entry.canvas.height*4 : 0) + this.#width*this.#height*4 + (this.#snapshot ? this.#snapshot.width*this.#snapshot.height*4 : 0) + (this.#encoding ? 65536 : 0) + this.#blurPixels*32,
      lastBatch: Object.freeze({ ...this.#lastBatch, completedAt: Object.freeze([...this.#lastBatch.completedAt]) }),
      sourceDecoding:this.#sourceLinear?'calibrated-srgb-texture':'explicit-shader',decodeProbeMaxByteError:this.#decodeProbeError,
      colorConvention: 'straight sRGB upload; manual linear-premultiplied sampling/blur; calibrated premultiplied sRGB byte presentation', storageProfile: this.#quantizeUp ? 'upward' : 'nearest' });
  }
  #lost = (event: Event) => {
    event.preventDefault(); if (this.#state === 'disposed') return;
    this.#state = 'lost'; this.#dropHandles(false);
    if (this.#restores >= this.#options.maxRestores) { this.#state = 'unavailable'; this.#failure = 'RESTORE_LIMIT'; }
  };
  #restored = () => {
    if (this.#state !== 'lost') return;
    this.#restores++;
    try { this.#build(); this.#state = 'ready'; }
    catch (cause) { this.#dropHandles(true); this.#state = 'unavailable'; this.#failure = cause instanceof WebGLError ? cause.code : 'RESTORE_FAILED'; }
  };
  initialize(): void {
    if (this.#state !== 'new') throw new WebGLError('INVALID_STATE','Atlas initialization is explicit and occurs once');
    try {
      this.#entry = acquire(this.#options.canvasFactory);
      this.#entry.canvas.addEventListener('webglcontextlost',this.#lost);
      this.#entry.canvas.addEventListener('webglcontextrestored',this.#restored);
      this.#quantizeUp = storageProfile(this.#entry.canvas.ownerDocument);
      this.#snapshot = this.#entry.canvas.ownerDocument.createElement('canvas'); this.#snapshot.width = this.#snapshot.height = 1;
      this.#snapshotCtx = this.#snapshot.getContext('2d',{ alpha: true, willReadFrequently: true }) ?? undefined;
      if (!this.#snapshotCtx) throw new WebGLError('TARGET_UNAVAILABLE','Snapshot Canvas2D unavailable');
      this.#build(); this.#state = 'ready';
    } catch (cause) { this.#failure = cause instanceof WebGLError ? cause.code : 'INITIALIZATION_FAILED'; this.#state = 'unavailable'; this.#release(); throw cause; }
  }
  #assert(): WebGL2RenderingContext {
    if (this.#state !== 'ready' || !this.#entry) throw new WebGLError(this.#state === 'lost' ? 'CONTEXT_LOST' : this.#state === 'disposed' ? 'DISPOSED' : 'WEBGL_UNAVAILABLE', 'WebGL atlas is '+this.#state);
    if (this.#entry.gl.isContextLost()) throw new WebGLError('CONTEXT_LOST','WebGL context lost');
    return this.#entry.gl;
  }
  #check(label: string): void { const gl = this.#entry!.gl; if (gl.isContextLost()) throw new WebGLError('CONTEXT_LOST',label); const e = gl.getError(); if (e !== gl.NO_ERROR) throw new WebGLError('WEBGL_ERROR',label+' error '+e); }
  #texture(): WebGLTexture { const gl = this.#entry!.gl, t = gl.createTexture(); if (!t) throw new WebGLError('ALLOCATION_FAILED','Texture allocation failed'); this.#textures.add(t); gl.bindTexture(gl.TEXTURE_2D,t); for (const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST); for (const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE); return t; }
  #framebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.#entry!.gl, f = gl.createFramebuffer(); if (!f) throw new WebGLError('ALLOCATION_FAILED','Framebuffer allocation failed'); this.#fbos.add(f);
    try { gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      this.#check('Framebuffer allocation'); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new WebGLError('FRAMEBUFFER_INCOMPLETE','Framebuffer incomplete'); return f;
    } catch (cause) { gl.deleteFramebuffer(f);this.#fbos.delete(f);throw cause; }
  }
  #deleteTexture(t: WebGLTexture | undefined): void { if (t) { this.#entry!.gl.deleteTexture(t); this.#textures.delete(t); } }
  #deleteFbo(f: WebGLFramebuffer | undefined): void { if (f) { this.#entry!.gl.deleteFramebuffer(f); this.#fbos.delete(f); } }
  #program(fragment: string, names: readonly string[]): Program {
    const gl = this.#entry!.gl, shaders: WebGLShader[] = [];
    for (const [type,text] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,fragment]] as const) {
      const shader = gl.createShader(type); if (!shader) throw new WebGLError('ALLOCATION_FAILED','Shader allocation failed'); this.#shaders.add(shader); shaders.push(shader);
      gl.shaderSource(shader,text); gl.compileShader(shader); if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new WebGLError('SHADER_COMPILE_FAILED',gl.getShaderInfoLog(shader) || 'Shader compilation failed');
    }
    const handle = gl.createProgram(); if (!handle) throw new WebGLError('ALLOCATION_FAILED','Program allocation failed'); this.#programs.add(handle);
    for (const s of shaders) gl.attachShader(handle,s); gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle,gl.LINK_STATUS)) throw new WebGLError('PROGRAM_LINK_FAILED',gl.getProgramInfoLog(handle) || 'Program link failed');
    for (const s of shaders) { gl.detachShader(handle,s); gl.deleteShader(s); this.#shaders.delete(s); }
    return { handle, locations: Object.fromEntries(names.map(n => [n,gl.getUniformLocation(handle,'u'+n)])) };
  }
  #build(): void {
    const gl = this.#entry!.gl, a = gl.getContextAttributes();
    if (!a || Object.entries(WEBGL_ATTRIBUTES).some(([k,v]) => a[k as keyof WebGLContextAttributes] !== v)) throw new WebGLError('ATTRIBUTES_UNSUPPORTED','Required context attributes not granted');
    this.#maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE); this.#maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    this.#optics = this.#program(OPTICS,['Source','Encoding','Size','Origin','Rect','Radius','Bevel','Strength','Prepared','QuantizeUp','SourceLinear','Calibration','Dispersion','Tint','Light','Rim','Specular']);
    this.#blur = this.#program(BLUR,['Source','Encoding','Axis','Radius','Prepared','SourceLinear']);
    this.#source = this.#texture(); this.#encoding = this.#texture();
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,64,64,0,gl.RGBA,gl.FLOAT,encodingTextureData());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    for (const c of [gl.BLEND,gl.DITHER,gl.DEPTH_TEST,gl.STENCIL_TEST,gl.SCISSOR_TEST]) gl.disable(c);
    this.#calibrateDecode();this.#check('Initialization'); this.#handleGeneration++; this.#invalidate();
  }
  // Probe the native sRGB sampler once per handle generation. Packed 16-bit
  // linear values reach Canvas2D synchronously; production never calls readPixels.
  // Select the fast sampler only when all 256 byte values satisfy a fixed bound.
  #calibrateDecode():void {
    this.#sourceLinear=false;this.#decodeProbeError=undefined;
    if(this.#options.maxBytes<72000)return;
    const gl=this.#entry!.gl,c=this.#entry!.canvas,p=this.#optics!,u=p.locations;
    c.width=256;c.height=1;const data=new Uint8Array(1024);for(let i=0;i<256;i++)data.set([i,i,i,255],i*4);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.#source!);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(p.handle);gl.viewport(0,0,256,1);gl.uniform1i(u.Source!,0);gl.uniform1i(u.Calibration!,1);gl.drawArrays(gl.TRIANGLES,0,3);
    const probe=c.ownerDocument.createElement('canvas');probe.width=256;probe.height=1;const ctx=probe.getContext('2d',{willReadFrequently:true});if(!ctx)throw new WebGLError('TARGET_UNAVAILABLE','Decode calibration unavailable');ctx.drawImage(c,0,0);const bytes=ctx.getImageData(0,0,256,1).data;
    let error=0;for(let i=0;i<256;i++){const linear=(bytes[i*4]!*256+bytes[i*4+1]!)/65535;const encoded=(linear<=.0031308?linear*12.92:1.055*linear**(1/2.4)-.055)*255;error=Math.max(error,Math.abs(encoded-i));}
    this.#decodeProbeError=error;this.#sourceLinear=error<=.075;probe.width=probe.height=0;gl.uniform1i(u.Calibration!,0);gl.texImage2D(gl.TEXTURE_2D,0,this.#sourceLinear?gl.SRGB8_ALPHA8:gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.#sourceWidth=this.#sourceHeight=1;c.width=c.height=1;
  }
  #invalidate(): void { this.#layoutKey = this.#sourceKey = this.#effectKey = this.#blurKey = ''; this.#surfaceKeys.clear(); this.#targets.clear(); }
  #dropHandles(remove: boolean): void {
    if (this.#entry && remove) { const gl = this.#entry.gl; for (const s of this.#shaders) gl.deleteShader(s); for (const p of this.#programs) gl.deleteProgram(p); for (const t of this.#textures) gl.deleteTexture(t); for (const f of this.#fbos) gl.deleteFramebuffer(f); }
    this.#textures.clear(); this.#fbos.clear(); this.#programs.clear(); this.#shaders.clear(); this.#source = this.#encoding = this.#output = this.#fbo = undefined; this.#optics = this.#blur = undefined;
    this.#blurTextures = []; this.#blurFbos = []; this.#width = this.#height = this.#sourceWidth = this.#sourceHeight = this.#blurPixels = 0; this.#invalidate();
  }
  #release(): void {
    this.#dropHandles(true); this.#snapshotCtx = undefined; if (this.#snapshot) this.#snapshot.width = this.#snapshot.height = 0; this.#snapshot = undefined;
    if (this.#entry) { const { canvas,gl } = this.#entry; canvas.removeEventListener('webglcontextlost',this.#lost); canvas.removeEventListener('webglcontextrestored',this.#restored); canvas.width = canvas.height = 1; this.#entry.busy = false; if (this.#options.canvasFactory) gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    this.#entry = undefined; this.#targetBytes = 0;
  }
  dispose(): void { if (this.#state === 'disposed') return; this.#state = 'disposed'; this.#release(); }
  #allocateOutput(width: number, height: number): void {
    if (width === this.#width && height === this.#height) return;
    const gl = this.#entry!.gl; let t: WebGLTexture | undefined, f: WebGLFramebuffer | undefined;
    try { t = this.#texture(); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null); f = this.#framebuffer(t); }
    catch (e) { this.#deleteTexture(t); this.#deleteFbo(f); throw e; }
    this.#deleteTexture(this.#output); this.#deleteFbo(this.#fbo); this.#output = t; this.#fbo = f;
    this.#entry!.canvas.width = width; this.#entry!.canvas.height = height;
    if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) throw new WebGLError('SIZE_UNSUPPORTED','Drawing buffer allocation refused');
    this.#width = width; this.#height = height;
  }
  #prepareBlur(radius: number, key: string): WebGLTexture {
    const gl = this.#entry!.gl;
    if (!radius) { for (const t of this.#blurTextures) this.#deleteTexture(t); for (const f of this.#blurFbos) this.#deleteFbo(f); this.#blurTextures = []; this.#blurFbos = []; this.#blurPixels = 0; this.#blurKey = ''; return this.#source!; }
    if (!gl.getExtension('EXT_color_buffer_float')) throw new WebGLError('BLUR_UNAVAILABLE','GPU blur requires renderable float color buffers');
    if (key === this.#blurKey) return this.#blurTextures[1]!;
    if (this.#blurPixels !== this.#sourceWidth*this.#sourceHeight || this.#blurTextures.length !== 2) {
      const ts: WebGLTexture[] = [], fs: WebGLFramebuffer[] = [];
      try { for (let i=0;i<2;i++) { const t = this.#texture(); ts.push(t); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,this.#sourceWidth,this.#sourceHeight,0,gl.RGBA,gl.FLOAT,null); fs.push(this.#framebuffer(t)); } }
      catch (e) { for (const t of ts) this.#deleteTexture(t); for (const f of fs) this.#deleteFbo(f); throw e; }
      for (const t of this.#blurTextures) this.#deleteTexture(t); for (const f of this.#blurFbos) this.#deleteFbo(f);
      this.#blurTextures = ts; this.#blurFbos = fs; this.#blurPixels = this.#sourceWidth*this.#sourceHeight;
    }
    const p = this.#blur!, u = p.locations; gl.disable(gl.SCISSOR_TEST); gl.useProgram(p.handle); gl.viewport(0,0,this.#sourceWidth,this.#sourceHeight);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.Source!,0); gl.uniform1i(u.Radius!,radius);gl.uniform1i(u.SourceLinear!,this.#sourceLinear?1:0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.#encoding!);gl.uniform1i(u.Encoding!,1);gl.activeTexture(gl.TEXTURE0);
    for (let i=0;i<2;i++) { gl.bindFramebuffer(gl.FRAMEBUFFER,this.#blurFbos[i]!); gl.bindTexture(gl.TEXTURE_2D,i ? this.#blurTextures[0]! : this.#source!); gl.uniform2i(u.Axis!,i ? 0:1,i ? 1:0); gl.uniform1i(u.Prepared!,i); gl.drawArrays(gl.TRIANGLES,0,3); }
    this.#check('GPU blur'); this.#blurKey = key; return this.#blurTextures[1]!;
  }
  update(source: PixelSource, entries: readonly WebGLTile[], options: WebGLUpdate = {}) {
    const gl = this.#assert(), begin = performance.now(); validateSource(source);
    if (!options || typeof options !== 'object' || Reflect.ownKeys(options).some(k => typeof k !== 'string' || !['generation','revision','dirtyIds','effects','signal'].includes(k))) throw new WebGLError('INVALID_OPTIONS','Invalid update options');
    if(options.signal!==undefined&&(!options.signal||typeof options.signal.aborted!=='boolean'||typeof options.signal.addEventListener!=='function'))throw new WebGLError('INVALID_OPTIONS','Invalid abort signal');
    if(options.signal?.aborted)throw new WebGLError('ABORTED','GPU update aborted');
    const generation = options.generation === undefined ? 0 : options.generation;
    const revision = options.revision === undefined ? (generation > this.#lastGeneration ? 0 : this.#lastRevision + 1) : options.revision;
    if (![generation,revision].every(n => Number.isSafeInteger(n) && n >= 0) || generation < this.#lastGeneration || (generation === this.#lastGeneration && (revision < this.#lastRevision || source.revision < this.#lastSourceRevision))) throw new WebGLError('STALE','Invalid/stale frame identity');
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 50) throw new WebGLError('BATCH_LIMIT','Atlas accepts1..50 surfaces');
    const e = effects(options.effects), tiles: Tile[] = entries.map(entry => {
      const surface = createFrame({contractVersion:1,generation,revision,sourceRevision:source.revision,surfaces:[entry.surface]},source).surfaces[0]!;
      const target = entry.target, view = target?.ownerDocument?.defaultView;
      if (!view || !(target instanceof view.HTMLCanvasElement)) throw new WebGLError('INVALID_TARGET','Target must be a Canvas2D canvas');
      const ctx = target.getContext('2d',{alpha:true,willReadFrequently:true}); if (!ctx || ctx.getContextAttributes?.().alpha === false) throw new WebGLError('TARGET_UNAVAILABLE','Alpha Canvas2D target required');
      return { surface,target,ctx,x:0,y:0 };
    });
    if (new Set(tiles.map(t=>t.surface.id)).size !== tiles.length || new Set(tiles.map(t=>t.target)).size !== tiles.length) throw new WebGLError('INVALID_BATCH','Surface IDs and targets must be unique');
    const ids = new Set(tiles.map(t=>t.surface.id));
    if (options.dirtyIds !== undefined && (!Array.isArray(options.dirtyIds) || options.dirtyIds.some(id=>!ids.has(id)))) throw new WebGLError('INVALID_BATCH','Unknown dirty ID');
    const cellW = Math.max(...tiles.map(t=>t.surface.width)), cellH = Math.max(...tiles.map(t=>t.surface.height));
    let layout: { width:number;height:number;columns:number } | undefined;
    const maxW = Math.min(this.#maxSize,this.#maxViewport[0]!), maxH = Math.min(this.#maxSize,this.#maxViewport[1]!);
    for (let columns=1;columns<=tiles.length;columns++) { const width=columns*cellW,height=Math.ceil(tiles.length/columns)*cellH; if (width>maxW || height>maxH || width*height>MAX_PIXELS) continue; if (!layout || width*height<layout.width*layout.height || (width*height===layout.width*layout.height && Math.max(width,height)<Math.max(layout.width,layout.height))) layout={width,height,columns}; }
    if (!layout || source.width>this.#maxSize || source.height>this.#maxSize) throw new WebGLError('SIZE_UNSUPPORTED','Source/atlas exceeds device or core pixel limits');
    const bytes = source.width*source.height*(4+(e.blur?32:0)) + layout.width*layout.height*12 + 65536;
    const oldAtlas=this.#width*this.#height,newAtlas=layout.width*layout.height,oldSnapshot=(this.#snapshot?.width??0)*(this.#snapshot?.height??0);
    const oldBlur=this.#blurPixels*32,newBlur=e.blur?source.width*source.height*32:0,sourceBytes=Math.max(source.width*source.height,this.#sourceWidth*this.#sourceHeight)*4;
    const peak = Math.max(bytes,
      sourceBytes+oldBlur+oldAtlas*8+oldSnapshot*4+(newAtlas!==oldAtlas?newAtlas*4:0)+65536,
      source.width*source.height*4+newAtlas*8+oldSnapshot*4+newBlur+(e.blur&&this.#blurPixels===source.width*source.height?0:oldBlur)+65536);
    if (peak>this.#options.maxBytes) throw new WebGLError('BUDGET','GPU image storage including resize overlap exceeds maxBytes');
    const layoutKey = JSON.stringify([layout,tiles.map(t=>[t.surface.id,t.surface.width,t.surface.height])]);
    const sourceKey = `${generation}/${source.revision}/${source.width}/${source.height}`, effectKey = JSON.stringify(e);
    const full = layoutKey!==this.#layoutKey || sourceKey!==this.#sourceKey || effectKey!==this.#effectKey;
    const dirty = new Set(options.dirtyIds ?? ids);
    const keys = new Map<string,string>();
    tiles.forEach((t,i) => { t.x=i%layout!.columns*cellW;t.y=Math.floor(i/layout!.columns)*cellH;const key=JSON.stringify(t.surface);keys.set(t.surface.id,key);if (full || key!==this.#surfaceKeys.get(t.surface.id) || t.target!==this.#targets.get(t.surface.id) || t.target.width!==t.surface.width || t.target.height!==t.surface.height) dirty.add(t.surface.id); });
    if (!dirty.size) { this.#lastGeneration=generation;this.#lastRevision=revision;this.#lastSourceRevision=source.revision;this.#lastBatch={dirty:0,gpuSnapshots:0,uploadMs:0,drawMs:0,snapshotMs:0,copyMs:0,batchMs:0,completedAt:[]}; return this.diagnostics.lastBatch; }
    try {
      this.#allocateOutput(layout.width,layout.height);
      if (sourceKey!==this.#sourceKey) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.#source!);
        const data = new Uint8Array(source.data.buffer,source.data.byteOffset,source.data.byteLength);
        if (source.width===this.#sourceWidth && source.height===this.#sourceHeight) gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,source.width,source.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
        else { gl.texImage2D(gl.TEXTURE_2D,0,this.#sourceLinear?gl.SRGB8_ALPHA8:gl.RGBA8,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,data); this.#blurKey=''; }
        this.#sourceWidth=source.width;this.#sourceHeight=source.height;this.#uploads++;this.#check('Source upload');
      }
      const uploadedAt=performance.now(), texture=this.#prepareBlur(e.blur,sourceKey+'/'+e.blur), program=this.#optics!, u=program.locations;
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.#fbo!); gl.enable(gl.SCISSOR_TEST); gl.useProgram(program.handle);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(u.Source!,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.#encoding!);gl.uniform1i(u.Encoding!,1);
      gl.uniform1i(u.SourceLinear!,this.#sourceLinear?1:0);gl.uniform1i(u.Prepared!,e.blur?1:0);gl.uniform1i(u.QuantizeUp!,this.#quantizeUp?1:0);gl.uniform1f(u.Dispersion!,e.dispersion);gl.uniform4f(u.Tint!,...e.tint);gl.uniform2f(u.Light!,...e.light);gl.uniform1f(u.Rim!,e.rim);gl.uniform1f(u.Specular!,e.specular);
      for (const t of tiles) if (dirty.has(t.surface.id)) {
        const s=t.surface,bottom=layout.height-t.y-s.height;gl.viewport(t.x,bottom,s.width,s.height);gl.scissor(t.x,bottom,s.width,s.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(u.Size!,s.width,s.height);gl.uniform2f(u.Origin!,t.x,bottom);gl.uniform4f(u.Rect!,s.sourceRect.x,s.sourceRect.y,s.sourceRect.width,s.sourceRect.height);gl.uniform1f(u.Radius!,s.radius);gl.uniform1f(u.Bevel!,Math.max(s.bevel,1.17549435e-38));gl.uniform1f(u.Strength!,s.strength);gl.drawArrays(gl.TRIANGLES,0,3);this.#draws++;
      }
      gl.disable(gl.SCISSOR_TEST);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.#fbo!);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);gl.blitFramebuffer(0,0,layout.width,layout.height,0,0,layout.width,layout.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);this.#check('Atlas draw/blit');
      const drawnAt=performance.now(), snapshot=this.#snapshot!, ctx=this.#snapshotCtx!;
      if(snapshot.width!==layout.width)snapshot.width=layout.width;if(snapshot.height!==layout.height)snapshot.height=layout.height;
      ctx.globalCompositeOperation='copy';ctx.imageSmoothingEnabled=false;ctx.drawImage(this.#entry!.canvas,0,0);
      const snapshotAt=performance.now(),completedAt:number[]=[];
      for(const t of tiles)if(dirty.has(t.surface.id)){
        if(options.signal?.aborted)throw new WebGLError('ABORTED','GPU presentation aborted');
        if(t.target.width!==t.surface.width)t.target.width=t.surface.width;if(t.target.height!==t.surface.height)t.target.height=t.surface.height;
        if(typeof t.ctx.reset==='function')t.ctx.reset();else t.target.width=t.surface.width;
        t.ctx.globalCompositeOperation='copy';t.ctx.imageSmoothingEnabled=false;t.ctx.drawImage(snapshot,t.x,t.y,t.surface.width,t.surface.height,0,0,t.surface.width,t.surface.height);completedAt.push(performance.now());
      }
      this.#check('Synchronous tile copies');this.#layoutKey=layoutKey;this.#sourceKey=sourceKey;this.#effectKey=effectKey;this.#surfaceKeys=keys;this.#targets=new Map(tiles.map(t=>[t.surface.id,t.target]));
      this.#lastGeneration=generation;this.#lastRevision=revision;this.#lastSourceRevision=source.revision;this.#batches++;this.#targetBytes=tiles.reduce((sum,t)=>sum+t.surface.width*t.surface.height*4,0);
      this.#lastBatch={dirty:dirty.size,gpuSnapshots:1,uploadMs:uploadedAt-begin,drawMs:drawnAt-uploadedAt,snapshotMs:snapshotAt-drawnAt,copyMs:performance.now()-snapshotAt,batchMs:performance.now()-begin,completedAt};return this.diagnostics.lastBatch;
    }catch(cause){this.#invalidate();throw cause;}
  }
}
