import test from 'node:test';
import assert from 'node:assert/strict';
import {createSource,decodeSrgb,encodeSrgb} from '../packages/core/dist/index.js';
import {prepareCpuSource,disposeCpuSource,renderCpu,sampleGeometry} from '../packages/cpu/dist/index.js';
import {createCpuRenderer} from '../packages/dom/dist/cpu.js';
import {oracleRender} from './cpu-oracle.mjs';
const src=(alpha=false)=>createSource({contractVersion:1,width:64,height:48,revision:1,data:Uint8Array.from({length:64*48*4},(_,i)=>i%4===3?(alpha?(i*17)%256:255):(Math.floor(i/4)*31+i*11)%256),ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'});
test('the opt-in profile leaves the versioned v1 material on its scalar contract',()=>{
 for(const alpha of [false,true]){const source=src(alpha),prepared=prepareCpuSource(source);try{for(const fx of [undefined,{model:'rounded-material-v1',blurRadius:2,dispersion:.12,tint:[.2,.7,.3,.15],rim:.1,specular:.2}]){for(const radius of [0,2,8]){const surface={id:'legacy',width:24,height:16,radius,bevel:12,strength:12};const a=renderCpu(prepared,surface,fx),b=oracleRender(source,surface,fx);assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<=1,'legacy scalar deviation at '+i));}}}finally{disposeCpuSource(prepared);}}
});
test('v2 air-to-glass tracing agrees with an independent angle-law calculation',()=>{
 const data=Uint8Array.from({length:64*48*4},(_,i)=>i%4===3?255:Math.floor(i/4)%64*4);
 const source=createSource({contractVersion:1,width:64,height:48,revision:1,data,ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'}),p=prepareCpuSource(source);
 const shape={id:'lens',width:32,height:24,radius:12,bevel:8,strength:8,sourceRect:{x:8,y:8,width:40,height:30}};
 try{const out=renderCpu(p,shape,{model:'refractive-lens-v2'});
 for(const[x,y]of [[30,12],[25,4],[6,19],[16,12]]){
  const g=sampleGeometry(32,24,12,8,x,y),u=Math.sqrt(g.weight),angle=Math.asin(u),inside=Math.asin(Math.sin(angle)/1.5),shift=-Math.tan(angle-inside)*shape.strength;
  const at=Math.max(0,Math.min(63,8+(x+.5)*40/32-.5+g.normalX*shift*40/32)),lo=Math.floor(at),t=at-lo;
  const linear=decodeSrgb(lo*4/255)*(1-t)+decodeSrgb(Math.min(63,lo+1)*4/255)*t,expected=Math.round(encodeSrgb(linear)*255);
  assert.ok(Math.abs(out[(y*32+x)*4]-expected)<=1,'angle-law mismatch at '+[x,y]);assert.equal(out[(y*32+x)*4+3],Math.round(g.coverage*255));
 }
 // At a right-facing bevel, inward tracing must sample a darker gradient value.
 const old=renderCpu(p,shape,{model:'rounded-material-v1'});assert.ok(out[(12*32+30)*4]<old[(12*32+30)*4]);
 }finally{disposeCpuSource(p);}
});
test('60 Hz is explicit and does not relax the default balanced CPU policy',()=>{
 assert.throws(()=>createCpuRenderer({quality:{maxUpdatesPerSecond:31}}));
 assert.throws(()=>createCpuRenderer({quality:{cadence:'balanced',maxUpdatesPerSecond:60}}));
 assert.throws(()=>createCpuRenderer({quality:{cadence:'interactive',maxUpdatesPerSecond:61}}));
 assert.throws(()=>createCpuRenderer({quality:{cadence:'unknown'}}));
 const normal=createCpuRenderer(),interactive=createCpuRenderer({quality:{cadence:'interactive',maxUpdatesPerSecond:60}});
 assert.equal(normal.diagnostics.quality.maxUpdatesPerSecond,30);assert.equal(interactive.diagnostics.quality.maxUpdatesPerSecond,60);normal.dispose();interactive.dispose();
});
test('small-radius v2 leaves the flat interior continuous across the nearest-edge diagonal',()=>{
 const source=src(),p=prepareCpuSource(source);
 try{for(const radius of [0,1,2,4,8]){
  const shape={id:'square',width:64,height:48,radius,bevel:20,strength:72};
  const out=renderCpu(p,shape,{model:'refractive-lens-v2'}),inset=Math.max(1,Math.ceil(radius));
  // Every pixel beyond the corner's curved border is a flat, identity-sampled
  // interior. This includes both sides of the former diagonal wedge seams.
  for(let y=inset;y<48-inset;y++)for(let x=inset;x<64-inset;x++){
   const i=(y*64+x)*4;for(let c=0;c<4;c++)assert.equal(out[i+c],source.data[i+c],`radius ${radius}, interior ${x},${y}, channel ${c}`);
  }
  if(radius>=2)assert.notDeepEqual(out.slice((24*64)*4,(24*64+1)*4),source.data.slice((24*64)*4,(24*64+1)*4),'curved border must still refract');
 }}finally{disposeCpuSource(p);}
});
