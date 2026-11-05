// Original deterministic media for the live examples. No remote/licensed assets.
import{execFileSync}from'node:child_process';
import{mkdir,writeFile,readFile,rename}from'node:fs/promises';
import{createHash}from'node:crypto';
const dir='showcase/public/media';await mkdir(dir,{recursive:true});
const ffmpeg=(args)=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',timeout:180000});
ffmpeg(['-f','lavfi','-i','gradients=s=960x600:r=30:c0=0x103f48:c1=0x7bbfbc:c2=0xefc8ae:c3=0xb9a3d6:n=4:seed=34:speed=0.045:type=spiral','-t','16','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',dir+'/light-study.mp4']);
ffmpeg(['-i',dir+'/light-study.mp4','-frames:v','1','-update','1',dir+'/light-study-poster.jpg']);
ffmpeg(['-f','lavfi','-i','aevalsrc=0.035*(sin(2*PI*130.8128*t)+0.7*sin(2*PI*164.8138*t)+0.5*sin(2*PI*195.9977*t))*(0.65+0.35*sin(2*PI*0.125*t))*sin(PI*t/16)*sin(PI*t/16):s=44100:d=16','-c:a','pcm_s16le',dir+'/slow-light.wav']);
ffmpeg(['-i',dir+'/light-study.mp4','-i',dir+'/slow-light.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',dir+'/light-study-av.mp4']);await rename(dir+'/light-study-av.mp4',dir+'/light-study.mp4');
for(const[name,a,b,c]of[['tidal','#1a3d70','#93b8e3','#d8eaff'],['dunes','#9b4f46','#e9b98c','#e8d8bb'],['violet','#34365e','#a2a5d1','#e4c5db']]){
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><defs><linearGradient id="sky" x2=".8" y2="1"><stop stop-color="${c}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="land" x2="1" y2="1"><stop stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient><radialGradient id="sun"><stop stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><path fill="url(#sky)" d="M0 0h1200v1500H0z"/><circle cx="890" cy="360" r="230" fill="url(#sun)"/><path fill="${a}" opacity=".32" d="M0 840Q300 510 620 730T1200 590V1500H0Z"/><path fill="url(#land)" d="M0 900Q350 660 740 930T1200 770V1500H0Z"/><path fill="${a}" opacity=".78" d="M0 1240Q340 920 680 1130T1200 1000V1500H0Z"/><g fill="none" stroke="${c}" opacity=".16" stroke-width="2">${Array.from({length:18},(_,i)=>`<path d="M-100 ${1000+i*18}Q350 ${700+i*15} 710 ${1060+i*10}T1300 ${850+i*19}"/>`).join('')}</g></svg>`;
await writeFile(dir+'/'+name+'.svg',svg);
}
const files=['light-study.mp4','light-study-poster.jpg','slow-light.wav','tidal.svg','dunes.svg','violet.svg'],hashes={};for(const f of files)hashes[f]=createHash('sha256').update(await readFile(dir+'/'+f)).digest('hex');
await writeFile(dir+'/provenance.json',JSON.stringify({kind:'original-procedural-showcase-media',generator:'scripts/generate-showcase-media.mjs',durationSeconds:16,videoFPS:30,audio:'original C3/E3/G3 sine chord, click to play',files:hashes},null,2)+'\n');
console.log('Generated original video, audio and three landscape illustrations.');
