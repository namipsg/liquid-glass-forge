import'./style.css';import'./sections.css';import{mountSiteComponents}from'./site-components.mjs';
import { mountAnalytics } from './analytics.mjs';
mountAnalytics();
const $=s=>document.querySelector(s),text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
try{const data=await fetch(new URL('./support/overview.json',document.baseURI)).then(r=>{if(!r.ok)throw Error('Support data unavailable');return r.json();});
 const releaseLabel = data.installVersion ? 'Experimental npm preview · '+data.installVersion : 'Experimental preview';
 const buildLabel = 'Showcase build '+data.version+'. Physical-device qualification remains open.';
 $('#support-release').append(text('strong',releaseLabel),text('p',buildLabel));
 for(const f of data.frameworks){const card=document.createElement('article');card.className='framework-support-card';card.append(text('strong',f.name),text('p',f.detail),text('code',f.package));const a=document.createElement('a');a.className='text-link';a.href='./?framework='+f.id+'#developers';a.dataset.siteGlass='';a.textContent='View '+f.name+' integration ↗';card.append(a);if(f.version){const npm=text('a','View '+f.version+' on npm ↗','text-link');npm.href='https://www.npmjs.com/package/'+f.package+'/v/'+f.version;card.append(npm);}$('#support-frameworks').append(card);}
 for(const r of data.renderers){const c=document.createElement('article');c.append(text('h3',r.name),text('p',r.detail));$('#support-renderers').append(c);}
 for(const d of data.devices){const row=document.createElement('article');row.append(text('strong',d.name),text('span',d.state),text('p',d.detail));$('#support-devices').append(row);}
 $('#support-policy').textContent=data.claimPolicy;$('#support-source').textContent='Generated from '+data.source+'. Original qualification status: '+data.qualificationStatus+'.';
 const raw=await fetch(new URL('./support/qualification.json',document.baseURI)).then(r=>r.json());for(const e of raw.environments){const c=document.createElement('article');c.append(text('h3',e.device||e.id),text('p',[e.os,e.browser].filter(Boolean).join(' · ')||'Required physical identity or coverage remains incomplete.'),text('strong','Qualification: '+e.status));const ul=document.createElement('ul');for(const reason of e.reasons??[])ul.append(text('li',reason));c.append(ul);$('#support-records').append(c);}
 const site=mountSiteComponents(document);window.lgfSupport={data,get diagnostics(){return site.diagnostics;}};
}catch(error){$('#support-release').textContent='Support data could not load. Please return to the studio or read the repository record.';console.error(error);}
