import { Component, DestroyRef, computed, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { GlassSceneDirective, GlassSurfaceComponent } from '@liquid-glass-forge/angular';
import { installRuntime } from './runtime.mjs';
const api = installRuntime('Angular');
document.querySelector('#app')!.innerHTML = '<phase10-root></phase10-root>';
@Component({ selector: 'phase10-root', standalone: true, imports: [GlassSceneDirective, GlassSurfaceComponent], template: `
  @if(state().shown && state().run) {
    <section lgfScene [lgfSource]="state().run.source" [lgfRenderer]="state().run.renderer" [lgfTimeoutMs]="1500" (lgfError)="state().run.report($event)">
      @for(i of indices(); track i) {
        <lgf-surface class="test-card" [material]="state().material">
          <p>Readable native content</p><label [attr.for]="'name-'+i">Name {{i}}</label>
          <input [id]="'name-'+i" [name]="'name-'+i" /><button [id]="'count-'+i">Count</button>
          <a href="#destination" [id]="'link-'+i">Next section</a>
          <img [id]="'image-'+i" src="/fixture.png" alt="Color tile" draggable="true" width="24" height="24" />
        </lgf-surface>
      }
    </section>
  }
` })
class App {
  readonly state = signal<any>(api.state); readonly indices = computed(() => Array.from({ length: this.state().count }, (_, i) => i));
  constructor() { const off = api.subscribe((state: any) => this.state.set(state)); inject(DestroyRef).onDestroy(off); }
}
bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch(error => { throw error; });
