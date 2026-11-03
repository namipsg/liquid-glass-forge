import { afterEveryRender, afterNextRender, Component, DestroyRef, inject, ApplicationRef, PendingTasks, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { GlassSceneDirective, GlassSurfaceComponent, GlassSurfaceDirective } from '@liquid-glass-forge/angular';
import { renderer, sourceProvider, stats } from './state';
import type { GlassMaterial } from '@liquid-glass-forge/dom';

@Component({selector:'phase9-root',standalone:true,imports:[RouterOutlet],template:'<router-outlet />'})
export class App {}
@Component({standalone:true,imports:[RouterLink],template:'<h1 id="away">Other route</h1><a routerLink="/" id="navigate-home">Home</a>'})
export class Away {}
@Component({standalone:true,imports:[GlassSceneDirective,GlassSurfaceComponent,GlassSurfaceDirective,RouterLink],template:`
 <h1>Angular packed consumer</h1><p id="error">{{error()}}</p>
 <button id="release-stability" (click)="releaseStability()">Release initial application task</button>
 <button id="toggle" (click)="shown.set(!shown())">Mount/unmount</button>
 <button id="replace" (click)="replace()">Replace source</button>
 <button id="material" (click)="material.set(material()==='glass'?'opaque':'glass')">Material</button>
 <button id="projection" (click)="label.set('Updated projection')">Projection update</button>
 <button id="target-input" (click)="targetAlt.set(!targetAlt())">Retarget directive input</button><button id="target" (click)="swap.set(!swap())">Replace directive host/target</button>
 <button id="pause" (click)="paused.set(!paused())">Pause/resume</button>
 <button id="switch" (click)="switchRenderer()">Switch renderer</button>
 <button id="held" (click)="mode.set('held');activeRenderer.set(makeRenderer('held'))">Pending render</button>
 <button id="init" (click)="mode.set('init');activeRenderer.set(makeRenderer('init'))">Pending init</button>
 <output id="clicks">{{clicks()}}</output>
 @if(shown()) {
  <section lgfScene [lgfSource]="source" [lgfRenderer]="activeRenderer()" [lgfPaused]="paused()" (lgfError)="report($event)">
   <lgf-surface id="surface" [material]="material()" style="width:160px;height:70px">
    <label>{{label()}} <input id="native-input" [value]="text()" (input)="setText($event)" /></label>
    <button id="native-button" (click)="clicks.set(clicks()+1)">Native click</button>
   </lgf-surface>
   @if(swap()) {
    <article id="directive" lgfSurface [lgfTarget]="targetAlt()?targetB2:targetB1" style="position:relative;width:160px;height:70px"><canvas #targetB1 class="lgf-surface" [attr.data-active]="!targetAlt()" [style.display]="targetAlt()?'none':''" data-lgf-material="glass" aria-hidden="true" role="presentation" tabindex="-1"></canvas><canvas #targetB2 class="lgf-surface" [attr.data-active]="targetAlt()" [style.display]="targetAlt()?'':'none'" data-lgf-material="glass" aria-hidden="true" role="presentation" tabindex="-1"></canvas><span>Replacement directive content</span></article>
   } @else {
    <section id="directive" lgfSurface [lgfTarget]="targetAlt()?targetA2:targetA1" style="position:relative;width:160px;height:70px"><canvas #targetA1 class="lgf-surface" [attr.data-active]="!targetAlt()" [style.display]="targetAlt()?'none':''" data-lgf-material="glass" aria-hidden="true" role="presentation" tabindex="-1"></canvas><canvas #targetA2 class="lgf-surface" [attr.data-active]="targetAlt()" [style.display]="targetAlt()?'':'none'" data-lgf-material="glass" aria-hidden="true" role="presentation" tabindex="-1"></canvas><span>Directive content</span></section>
   }
  </section>
 }
 <lgf-surface id="standalone" material="opaque" style="width:160px;height:40px"><input id="local-input" aria-label="Material-only input"/></lgf-surface>
 <a routerLink="/away" id="navigate-away">Away</a>
`})
export class Fixture {
 readonly shown=signal(true); readonly paused=signal(false); readonly material=signal<GlassMaterial>('glass');
 readonly label=signal('Native'); readonly swap=signal(false); readonly targetAlt=signal(false); readonly clicks=signal(0);
 readonly text=signal(''); readonly error=signal(''); readonly mode=signal('cpu');
 readonly source=sourceProvider(); readonly makeRenderer=renderer; readonly activeRenderer=signal(renderer('cpu'));
 private done:(()=>void)|undefined;
 constructor(){
  if(isPlatformBrowser(inject(PLATFORM_ID)))this.done=inject(PendingTasks).add();
  afterEveryRender(()=>{stats.angularRenders++;});
  afterNextRender(()=>{(window as any).phase9={stats,source:this.source,fixture:this};});
  const subscription=inject(ApplicationRef).isStable.subscribe(value=>{(stats as any).stable=value;});
  inject(DestroyRef).onDestroy(()=>{subscription.unsubscribe();this.done?.();});
 }
 releaseStability():void{this.done?.();this.done=undefined;}
 replace():void{this.source.replace({kind:'pixels',width:1,height:1,data:new Uint8Array([0,255,0,255])});}
 switchRenderer():void{const next=this.mode()==='cpu'?'second':'cpu';this.mode.set(next);this.activeRenderer.set(renderer(next));}
 setText(event:Event):void{this.text.set((event.target as HTMLInputElement).value);}
 report(error:unknown):void{this.error.set(String(error));}
}
