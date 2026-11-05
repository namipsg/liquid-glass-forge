// In src/styles.css: @import '@liquid-glass-forge/dom/styles.css';
import { Component } from '@angular/core';
import { GlassSurfaceComponent } from '@liquid-glass-forge/angular';

@Component({
  selector: 'app-glass-demo',
  standalone: true,
  imports: [GlassSurfaceComponent],
  template: `
    <main style="padding: 48px; background: linear-gradient(130deg, #bde7ff, #8495ea)">
      <lgf-surface style="display: inline-block; padding: 16px; border-radius: 24px">
        <button type="button">Continue</button>
      </lgf-surface>
    </main>
  `,
})
export class GlassDemoComponent {}
