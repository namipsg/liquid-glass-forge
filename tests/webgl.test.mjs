import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLAtlas } from '../packages/webgl/dist/index.js';
import { createOpticalRenderer } from '../packages/webgl/dist/dom.js';
test('WebGL construction validates data without allocating browser resources',()=>{
  for(const value of [null,[],{maxBytes:null},{maxRestores:-1},{extra:1},{canvasFactory:1}])assert.throws(()=>new WebGLAtlas(value));
  for(const value of [null,[],{backend:null},{fallback:null},{backend:'auto'},{backend:'webgl',fallback:'cpu'},{quality:null},{quality:{maxPixels:null}},{quality:{extra:1}},{surface:null},{surface:Promise.resolve({})},{surface:{strength:-1}},{sourceRect:null},{cpu:{executor:{worker:'gpu'}}}])assert.throws(()=>createOpticalRenderer(value));
  new WebGLAtlas().dispose();createOpticalRenderer({backend:'auto',fallback:'cpu'}).dispose();
});
