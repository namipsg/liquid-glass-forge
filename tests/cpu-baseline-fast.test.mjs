import test from 'node:test';import assert from 'node:assert/strict';
import{createSource}from'../packages/core/dist/index.js';import{prepareCpuSource,renderCpu,disposeCpuSource,preparedStorageBytes,CPU_GEOMETRY_MAX_BYTES}from'../packages/cpu/dist/index.js';import{oracleRender}from'./cpu-oracle.mjs';
test('large baseline exact geometry cache obeys oracle, replacement and disposal bounds',()=>{
 for(const alpha of [128,255]){
 const data=new Uint8Array(Array.from({length:64},(_,i)=>[i*17%256,i*41%256,i*73%256,alpha]).flat()),src=createSource({contractVersion:1,width:8,height:8,revision:0,data,ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'}),p=prepareCpuSource(src),base=preparedStorageBytes(p);
 for(const radius of [0,.7,12.3,32])for(const strength of [0,4,1e6]){const s={id:'cache',width:80,height:64,radius,bevel:11.7,strength,sourceRect:{x:.1,y:.2,width:7.7,height:7.6}},a=renderCpu(p,s),b=oracleRender(src,s);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<=1,`${radius}/${strength}/${i}`);assert.deepEqual(renderCpu(p,s,{model:'rounded-material-v1'}),a);assert.ok(preparedStorageBytes(p)<=base+CPU_GEOMETRY_MAX_BYTES);}
 renderCpu(p,{id:'tiny',width:1,height:1,radius:0,strength:0});assert.equal(preparedStorageBytes(p),base);disposeCpuSource(p);assert.equal(preparedStorageBytes(p),0);assert.equal(data.byteLength,256);
 }
});

test('opaque baseline is byte-exact with scalar baseline sampling over the same opaque crop', () => {
  // A nonopaque texel outside every sampled coordinate selects the generic
  // scalar loop without changing any sampled channel or interpolation weight.
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([(i * 17) % 256, (i * 29) % 256, (i * 53) % 256, 255], i);
  const genericData = data.slice(); genericData[genericData.length - 1] = 254;
  const source = bytes => createSource({ contractVersion: 1, width: 16, height: 16, revision: 0, data: bytes,
    ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
  const opaque = prepareCpuSource(source(data)), scalar = prepareCpuSource(source(genericData));
  try {
    for (const [width, height, radius] of [[64,64,0], [65,65,17.3], [83,71,35.5], [320,180,24], [320,180,86], [320,180,88]]) {
      for (const strength of [0, 4]) {
        const shape = { id: 'unrolled', width, height, radius, bevel: 11.7, strength,
          sourceRect: { x: .7, y: .9, width: 2.3, height: 2.1 } };
        const actual = renderCpu(opaque, shape), expected = renderCpu(scalar, shape);
        assert.deepEqual(actual, expected, `${width}/${height}/${radius}/${strength}`);
        const changed = { ...shape, sourceRect: { x: 1.1, y: .3, width: 1.7, height: 3.1 }, strength: strength + .3 };
        assert.deepEqual(renderCpu(opaque, changed), renderCpu(scalar, changed), 'changed crop/strength preserves exact sampling');
        assert.deepEqual(renderCpu(opaque, shape), actual, 'return to earlier crop/strength preserves exact coordinates');
        assert.ok(preparedStorageBytes(opaque) <= data.length * 4 + CPU_GEOMETRY_MAX_BYTES);
        assert.deepEqual(renderCpu(opaque, shape, { model: 'rounded-material-v1', tint: [1, .5, .2, 0], rim: 0, specular: 0 }), actual);
        for (let i = 0; i < actual.length; i += 4) if (!actual[i + 3]) assert.deepEqual([...actual.subarray(i, i + 3)], [0, 0, 0]);
      }
    }
  } finally { disposeCpuSource(opaque); disposeCpuSource(scalar); }
});

test('opaque cache threshold and oversized rounded geometry retain the independent equations', () => {
  const data = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 1, 10, 128, 255, 254, 37, 210, 255]);
  const source = createSource({ contractVersion: 1, width: 2, height: 2, revision: 0, data,
    ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
  const prepared = prepareCpuSource(source), base = preparedStorageBytes(prepared);
  try {
    for (const [width, height, radius, cached] of [[63,65,0,false], [64,64,.7,true], [200,200,100,false]]) {
      const shape = { id: 'boundary', width, height, radius, bevel: .37, strength: 1e6,
        sourceRect: { x: .15, y: .2, width: 1.7, height: 1.6 } };
      const actual = renderCpu(prepared, shape), expected = oracleRender(source, shape);
      for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= 1, `${width}/${height}/${i}`);
      assert.equal(preparedStorageBytes(prepared) > base, cached);
      assert.ok(preparedStorageBytes(prepared) <= base + CPU_GEOMETRY_MAX_BYTES);
    }
  } finally { disposeCpuSource(prepared); }
});

test('classified addressing preserves clamp endpoints and fractional sampling for thin long sources', () => {
  for (const [width, height] of [[4096, 1], [1, 4096]]) {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) data.set([i % 256, i * 37 % 256, 255 - i % 256, 255], i * 4);
    const source = createSource({ contractVersion:1, width, height, revision:0, data, ownership:'borrowed', colorSpace:'srgb', alphaMode:'straight' });
    const prepared = prepareCpuSource(source);
    try {
      for (const strength of [0, 1e6]) {
        const shape = { id:'bounded-address', width:64, height:64, radius:16.3, bevel:7.1, strength,
          sourceRect:{x:width>1?.125:0,y:height>1?.125:0,width:width>1?width-.25:1,height:height>1?height-.25:1} };
        const actual = renderCpu(prepared, shape), expected = oracleRender(source, shape);
        for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i]-expected[i])<=1, `${width}/${height}/${strength}/${i}`);
      }
    } finally { disposeCpuSource(prepared); }
  }
});

test('exact half-texel means match the original scalar path for dense opaque bytes and changing optics', () => {
  const width=130,height=130,data=new Uint8Array(width*height*4);
  let state=0x12345678;
  for(let i=0;i<data.length;i+=4){state=(Math.imul(state,1664525)+1013904223)>>>0;data.set([state&255,state>>>8&255,state>>>16&255,255],i);}
  const other=data.slice();other[other.length-1]=254; // Outside the sampled 128x128 crop.
  const make=bytes=>createSource({contractVersion:1,width,height,revision:0,data:bytes,ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'});
  const opaque=prepareCpuSource(make(data)),scalar=prepareCpuSource(make(other));
  try {
    const shape={id:'half-texels',width:64,height:64,radius:0,bevel:.001,strength:0,sourceRect:{x:1,y:1,width:128,height:128}};
    for(const strength of [0,12,15.8,1e6]) assert.deepEqual(renderCpu(opaque,{...shape,strength}),renderCpu(scalar,{...shape,strength}));
    // Fractional origin/non2x scaling must keep the generic scalar expression.
    for(const crop of [{x:.9,y:1,width:128,height:128},{x:1,y:.9,width:127.9,height:128}]) {
      assert.deepEqual(renderCpu(opaque,{...shape,sourceRect:crop}),renderCpu(scalar,{...shape,sourceRect:crop}));
    }
    for(const strength of [0,12,15.8]) {
      const curved={...shape,radius:16,bevel:10,strength};
      const actual=renderCpu(opaque,curved),expected=oracleRender(make(data),curved);
      for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=1,`dynamic half sampling ${strength}/${i}`);
    }
  } finally {disposeCpuSource(opaque);disposeCpuSource(scalar);}
});

test('prepared source resampling is exact across changing optics/crops and stays inside the shared geometry allowance', () => {
  const width=256,height=256,data=new Uint8Array(width*height*4);
  let state=0x716423;
  for(let i=0;i<data.length;i+=4){state=(Math.imul(state,1664525)+1013904223)>>>0;data.set([state&255,state>>>8&255,state>>>16&255,255],i);}
  const other=data.slice();other[other.length-1]=254;
  const make=bytes=>createSource({contractVersion:1,width,height,revision:0,data:bytes,ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'});
  const opaque=prepareCpuSource(make(data)),scalar=prepareCpuSource(make(other)),base=preparedStorageBytes(opaque);
  try {
    let previous;
    for(const radius of [0,16,31.5]) for(const strength of [12,12.2,15.8,0]) {
      const shape={id:'source-resampling',width:64,height:64,radius,bevel:10,strength,sourceRect:{x:64,y:64,width:128,height:128}};
      const actual=renderCpu(opaque,shape),expected=renderCpu(scalar,shape);
      assert.deepEqual(actual,expected,`exact source RGB ${radius}/${strength}`);
      if(radius===16&&strength===12.2)assert.ok(actual.some((v,i)=>v!==previous[i]),'changing strength still changes refracted output');
      previous=actual.slice();
      assert.ok(preparedStorageBytes(opaque)>base);assert.ok(preparedStorageBytes(opaque)<=base+CPU_GEOMETRY_MAX_BYTES);
      const shifted={...shape,sourceRect:{x:65,y:63,width:128,height:128}};
      assert.deepEqual(renderCpu(opaque,shifted),renderCpu(scalar,shifted),'crop replaces source resampling');
      assert.deepEqual(renderCpu(opaque,shape),actual,'return to previous crop regenerates exact RGB');
    }
    renderCpu(opaque,{id:'tiny-reset',width:1,height:1,radius:0,bevel:1,strength:0});
    assert.equal(preparedStorageBytes(opaque),base,'tiny shape drops all geometry and RGB cache');
  } finally {disposeCpuSource(opaque);disposeCpuSource(scalar);}
  assert.equal(preparedStorageBytes(opaque),0);assert.equal(data.byteLength,width*height*4);
});
