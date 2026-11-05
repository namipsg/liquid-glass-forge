export const scenes=[{name:'Fieldnotes',domain:'fieldnotes.test',title:['Find a little','more outside.'],subtitle:'A journal for unhurried days.',colors:['#e1edfc','#9fc2e3','#234b7c']},{name:'Color Studies',domain:'color.test',title:['Everything','in its own light.'],subtitle:'Collected colors. Unexpected places.',colors:['#eed1b9','#cb9c98','#6a4b6b']},{name:'The Studio',domain:'studio.test',title:['A different','kind of surface.'],subtitle:'Small experiments. Tangible ideas.',colors:['#d8def0','#91a6ca','#394e7c']}];
export function landscape(ctx,w,h,index=0,time=0){
 const p=scenes[index%3].colors,g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,p[0]);g.addColorStop(.55,p[1]);g.addColorStop(1,p[2]);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 ctx.fillStyle=p[0];ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(w*.73,h*.23,Math.min(w,h)*.12,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
 for(let i=0;i<4;i++){ctx.fillStyle=p[2];ctx.globalAlpha=.18+i*.12;ctx.beginPath();ctx.moveTo(0,h*(.47+i*.12));ctx.bezierCurveTo(w*.35,h*(.16+i*.14)+Math.sin(time+i)*h*.025,w*.65,h*(.8+i*.04),w,h*(.4+i*.12));ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();}ctx.globalAlpha=1;
 ctx.strokeStyle=p[0];ctx.globalAlpha=.15;for(let i=0;i<16;i++){ctx.beginPath();ctx.moveTo(-w*.1,h*(.73+i*.01));ctx.bezierCurveTo(w*.3,h*(.42+i*.018),w*.65,h*(.97+i*.01),w*1.1,h*(.62+i*.015));ctx.stroke();}ctx.globalAlpha=1;
}
export function browserPage(ctx,w,h,index=0,{reference=false,photo,secondaryPhoto}={}){
 if(reference){
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#9bd4b6');g.addColorStop(.5,'#e3e9b4');g.addColorStop(1,'#429e96');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle='#ffffff70';for(let x=23;x<w;x+=24)ctx.fillRect(x,0,1,h);
  ctx.fillStyle='#0b302c';ctx.font='12px ui-monospace,monospace';ctx.fillText('CONTROLLED SAFARI BACKDROP / TIDAL',26,104);ctx.font='600 56px system-ui';['Content','beneath','the controls.'].forEach((s,i)=>ctx.fillText(s,26,177+i*54));ctx.font='22px system-ui';ctx.fillText('Aa 0123',26,397);ctx.fillText('Light / Glass',26,430);ctx.fillRect(26,463,w-52,4);ctx.font='22px system-ui';ctx.fillText('Watch the toolbar change',26,514);ctx.fillText('as content moves beneath it.',26,548);
  ctx.font='16px system-ui';ctx.fillText('The page draws no glass.',26,604);ctx.fillText('The floating controls belong to the browser.',26,630);
  for(let i=0;i<8;i++){ctx.fillStyle=['#20546b','#2e9f97','#ebbd67','#cc6470','#697bc0','#c1dba7'][i%6];ctx.fillRect(26+i*(w-52)/8,690,(w-52)/8,380);}ctx.strokeStyle='#ffffff70';for(let y=690;y<1070;y+=24){ctx.beginPath();ctx.moveTo(26,y);ctx.lineTo(w-26,y);ctx.stroke();}return;
 }
 const page=scenes[index%3];ctx.fillStyle=page.colors[0];ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(0,230);if(photo)drawPhoto(ctx,photo,w,w*1.18);else landscape(ctx,w,w*1.18,index);ctx.restore();
 ctx.fillStyle='#17273a';ctx.font='600 12px system-ui';ctx.fillText('FIELDNOTES  /  A VISUAL JOURNAL',28,40);ctx.font='500 50px system-ui';page.title.forEach((s,i)=>ctx.fillText(s,28,112+i*53));ctx.font='15px system-ui';ctx.fillText(page.subtitle,28,207);
 const y=230+w*1.18;ctx.fillStyle='#f2f6fd';ctx.fillRect(0,y,w,h-y);ctx.fillStyle='#17273a';ctx.font='12px ui-monospace,monospace';ctx.fillText('THE SLOW COLLECTION',28,y+55);ctx.font='500 32px Georgia';ctx.fillText('Take the long way.',28,y+112);ctx.font='16px system-ui';['Some days ask for a different pace.','A little less noise. A little more light.','Find the shapes you usually walk past.'].forEach((s,i)=>ctx.fillText(s,28,y+158+i*28));ctx.save();ctx.translate(28,y+270);if(secondaryPhoto)drawPhoto(ctx,secondaryPhoto,w-56,w*.65);else landscape(ctx,w-56,w*.65,(index+1)%3);ctx.restore();ctx.font='500 24px Georgia';ctx.fillText('A new perspective, every day.',28,y+w*.65+315);
}
export function cover(ctx,image,w,h){const iw=image.videoWidth||image.naturalWidth||image.width,ih=image.videoHeight||image.naturalHeight||image.height;if(!iw||!ih)return;const s=Math.max(w/iw,h/ih);ctx.drawImage(image,(w-iw*s)/2,(h-ih*s)/2,iw*s,ih*s);}

export function drawPhoto(ctx,image,w,h){
 ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
 cover(ctx,image,w,h);ctx.restore();
}
