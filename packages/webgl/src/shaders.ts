export const VERTEX = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0,1);}`;

// The v1 path retains CONTRACTS.md and PHASE-5.md; the opt-in v2 path
// traces an air-to-glass ray through an elliptical bevel. The scalar oracle
// remains independent; production never obtains pixels from a GPU framebuffer.
// Explicit float constructors avoid ANGLE/D3D11 generating an ambiguous HLSL
// vec2_ctor_int overload for mixed integer and floating-point arguments.
export const OPTICS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uSource;
uniform highp sampler2D uEncoding;
uniform vec2 uSize,uOrigin,uLight;
uniform vec4 uRect,uTint;
uniform float uRadius,uBevel,uStrength,uDispersion,uRim,uSpecular;
uniform bool uPrepared,uQuantizeUp,uSourceLinear,uCalibration,uLensProfile;
out vec4 result;
float encodeByte(float v){int i=min(int(v*4096.0),4095);vec3 e=texelFetch(uEncoding,ivec2(i&63,i>>6),0).rgb;return e.r+(v>=e.b?1.0:(v<e.g?-1.0:0.0));}
float decodeByte(float v){return v<=.04045?v/12.92:pow((v+.055)/1.055,2.4);}
vec4 texel(ivec2 p){vec4 c=texelFetch(uSource,p,0);return uPrepared?c:(uSourceLinear?vec4(c.rgb*c.a,c.a):vec4(vec3(decodeByte(c.r),decodeByte(c.g),decodeByte(c.b))*c.a,c.a));}
vec4 sampleAt(vec2 p){ivec2 s=textureSize(uSource,0);p=clamp(p,vec2(0.0),vec2(float(s.x-1),float(s.y-1)));ivec2 lo=ivec2(floor(p)),hi=min(lo+1,s-1);vec2 t=fract(p);
if(t.x==0.0&&t.y==0.0)return texel(lo);
return (texel(lo)*(1.0-t.x)+texel(ivec2(hi.x,lo.y))*t.x)*(1.0-t.y)+(texel(ivec2(lo.x,hi.y))*(1.0-t.x)+texel(hi)*t.x)*t.y;}
void main(){
if(uCalibration){vec4 c=texelFetch(uSource,ivec2(int(gl_FragCoord.x),0),0);float n=floor(c.r*65535.0+.5);result=vec4(floor(n/256.0)/255.0,mod(n,256.0)/255.0,0,1);return;}
vec2 local=gl_FragCoord.xy-uOrigin,center=vec2(local.x,uSize.y-local.y),p=center-uSize*.5;
vec2 q=abs(p)-(uSize*.5-uRadius),a=max(q,0.0);float len=length(a),d=len+min(max(q.x,q.y),0.0)-uRadius;
float mask=clamp(.5-d,0.0,1.0);if(mask==0.0){result=vec4(0.0);return;}
// Keep v2's bevel outside the medial axis at small corner radii. V1 is unchanged.
float bevel=uLensProfile?min(uBevel,max(uRadius,.5)):uBevel;
float w=clamp(1.0+d/bevel,0.0,1.0);w*=w;
vec2 n=w>0.0?(len>0.0?a/len*sign(p):(q.x>q.y?vec2(sign(p.x),0.0):vec2(0.0,sign(p.y)))):vec2(0.0);
float displacement=w;
if(uLensProfile&&w>0.0){float u=sqrt(w),nz=sqrt(max(0.0,1.0-u*u)),eta=2.0/3.0;
float bend=sqrt(1.0-eta*eta*u*u)-eta*nz;displacement=-u*bend/(eta+bend*nz);}
vec2 scale=uRect.zw/uSize,base=uRect.xy+center*scale-.5,delta=n*uStrength*displacement*scale;
// An exact source texel with all optional passes disabled is byte identity.
// Avoid decode/interpolate/encode work only where bilinear weights are exactly zero.
if(!uPrepared&&!uSourceLinear&&uDispersion==0.0&&uTint.a==0.0&&uRim==0.0&&uSpecular==0.0){
  vec2 at=clamp(base+delta,vec2(0.0),vec2(float(textureSize(uSource,0).x-1),float(textureSize(uSource,0).y-1)));
  if(all(equal(fract(at),vec2(0.0)))){vec4 raw=texelFetch(uSource,ivec2(at),0);float alpha=floor(raw.a*mask*255.0+.5);ivec3 bytes=ivec3(floor(raw.rgb*255.0+.5));ivec3 premult=(bytes*int(alpha)+(uQuantizeUp?254:127))/255;result=alpha==0.0?vec4(0.0):vec4(vec3(premult)/255.0,alpha/255.0);return;}
}
vec4 c=sampleAt(base+delta);float alpha=floor(c.a*mask*255.0+.5);
if(alpha==0.0){result=vec4(0.0);return;}
vec3 rgb=c.a>0.0?c.rgb/c.a:vec3(0.0);
if(uDispersion>0.0){vec4 r=sampleAt(base+delta*(1.0+uDispersion)),b=sampleAt(base+delta*(1.0-uDispersion));rgb.r=r.a>0.0?r.r/r.a:0.0;rgb.b=b.a>0.0?b.b/b.a:0.0;}
if(uTint.a>0.0)rgb=mix(rgb,uTint.rgb,uTint.a);
if(w>0.0&&(uRim>0.0||uSpecular>0.0)){float l=max(dot(n,uLight),0.0);l*=l;l*=l;l*=l;float h=clamp(w*(uRim+uSpecular*l),0.0,1.0);rgb=clamp(rgb+(1.0-rgb)*h,0.0,1.0);}
ivec3 bytes=ivec3(encodeByte(rgb.r),encodeByte(rgb.g),encodeByte(rgb.b));
ivec3 premult=(bytes*int(alpha)+(uQuantizeUp?254:127))/255;
result=vec4(vec3(premult)/255.0,alpha/255.0);
}`;

export const BLUR = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uSource;
uniform highp sampler2D uEncoding;
uniform ivec2 uAxis;
uniform int uRadius;
uniform bool uPrepared,uSourceLinear;
out vec4 result;
float decodeByte(float v){return v<=.04045?v/12.92:pow((v+.055)/1.055,2.4);}
void main(){ivec2 p=ivec2(gl_FragCoord.xy),size=textureSize(uSource,0);vec4 sum=vec4(0.0);
for(int k=-16;k<=16;k++){if(abs(k)<=uRadius){vec4 c=texelFetch(uSource,clamp(p+uAxis*k,ivec2(0),size-1),0);sum+=uPrepared?c:(uSourceLinear?vec4(c.rgb*c.a,c.a):vec4(vec3(decodeByte(c.r),decodeByte(c.g),decodeByte(c.b))*c.a,c.a));}}
result=sum/float(2*uRadius+1);
}`;

export function encodingTextureData(): Float32Array {
  const data = new Float32Array(64 * 64 * 4);
  const decode = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  for (let i = 0; i < 4096; i++) {
    const v = (i + .5) / 4096, byte = Math.round((v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055) * 255);
    data.set([byte, byte ? decode((byte - .5) / 255) : -1, byte < 255 ? decode((byte + .5) / 255) : 2, 0], i * 4);
  }
  return data;
}
