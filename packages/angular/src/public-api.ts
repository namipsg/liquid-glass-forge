import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, ApplicationRef, Component, DestroyRef, Directive, effect, ElementRef, forwardRef, inject, InjectionToken, input, NgZone, output, PLATFORM_ID, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { createGlassScene } from '@liquid-glass-forge/dom';
import type { GlassAttachment, GlassMaterial, GlassRenderer, GlassScene, SceneSource } from '@liquid-glass-forge/dom';

/** Private per-provider context; scenes never become Angular application globals. */
const SCENE = new InjectionToken<GlassSceneDirective>('LiquidGlassForgeScene');

/** Local view readiness plus application stability, not a global hydration claim.
 * Incremental/deferred hydration is outside this package's tested support matrix. */
function afterStableView(action: () => void): void {
  const destroy = inject(DestroyRef), app = inject(ApplicationRef), zone = inject(NgZone);
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const render = afterNextRender(() => zone.runOutsideAngular(() => {
    app.isStable.pipe(filter(Boolean), take(1), takeUntilDestroyed(destroy)).subscribe(() => {
      if (!destroy.destroyed) action();
    });
  }));
  destroy.onDestroy(() => render.destroy());
}

/** Borrowed inputs; this directive owns one cancellable scene lifetime. */
@Directive({ selector: '[lgfScene]', standalone: true, exportAs: 'lgfScene', providers: [{ provide: SCENE, useExisting: forwardRef(() => GlassSceneDirective) }] })
export class GlassSceneDirective {
  readonly lgfSource = input<SceneSource>();
  readonly lgfRenderer = input<GlassRenderer>();
  readonly lgfTimeoutMs = input<number>();
  readonly lgfPaused = input(false);
  readonly lgfError = output<unknown>();
  private readonly state = signal<GlassScene | null>(null);
  readonly scene = this.state.asReadonly();
  private readonly zone = inject(NgZone);
  private readonly destroy = inject(DestroyRef);
  private ready = false;
  private viewReady = false;
  private previous: readonly [SceneSource | undefined, GlassRenderer | undefined, number | undefined] | undefined;
  constructor() {
    afterStableView(() => { this.ready = true; this.apply(); });
    effect(() => {
      this.lgfSource(); this.lgfRenderer(); this.lgfTimeoutMs(); this.lgfPaused();
      untracked(() => this.apply());
    });
    this.destroy.onDestroy(() => { this.ready = false; this.state()?.dispose(); this.state.set(null); });
  }
  ngAfterViewInit(): void { this.viewReady = true; this.apply(); }
  private apply(): void {
    if (!this.ready || !this.viewReady || this.destroy.destroyed) return;
    this.zone.runOutsideAngular(() => {
      const source = this.lgfSource(), renderer = this.lgfRenderer(), timeout = this.lgfTimeoutMs();
      if (!this.previous || source !== this.previous[0] || renderer !== this.previous[1] || timeout !== this.previous[2]) {
        this.state()?.dispose();
        // Source callbacks can be invoked from a zoned application event. Keep
        // acquisition, invalidation and renderer work outside Angular scheduling.
        const outside: SceneSource | undefined = source ? {
          read: options => this.zone.runOutsideAngular(() => source.read(options)),
          ...(source.subscribe ? { subscribe: (listener: () => void) => this.zone.runOutsideAngular(() => source.subscribe!(() => this.zone.runOutsideAngular(listener))) } : {}),
        } : undefined;
        const next = createGlassScene({ ...(outside ? { source: outside } : {}), ...(renderer ? { renderer } : {}),
          ...(timeout === undefined ? {} : { timeoutMs: timeout }), onError: cause => { if (!this.destroy.destroyed) this.zone.run(() => this.lgfError.emit(cause)); } });
        if (this.lgfPaused()) next.pause();
        this.previous = [source, renderer, timeout]; this.state.set(next);
      } else {
        const current = this.state();
        if (this.lgfPaused()) current?.pause(); else if (current?.state === 'paused') current.resume();
      }
    });
  }
}

/** Engine state is ordinary data; bitmap completion never writes Angular signals. */
class SurfaceBinding {
  private attachment: GlassAttachment | undefined;
  private owned: GlassScene | undefined;
  private lastScene: GlassScene | undefined;
  private lastTarget: HTMLCanvasElement | undefined;
  private lastMaterial: GlassMaterial | undefined;
  constructor(private readonly element: HTMLElement, private readonly shared: boolean) {}
  update(target: HTMLCanvasElement, scene: GlassScene | null, material: GlassMaterial): void {
    if (this.shared && !scene) { this.detach(); return; }
    if (!this.shared) this.owned ??= createGlassScene();
    const current = scene ?? this.owned!;
    if (current.state === 'destroyed') { this.detach(); return; }
    if (this.attachment && this.lastScene === current && this.lastTarget === target) {
      if (this.lastMaterial !== material) this.attachment.update({ material });
    } else {
      this.detach();
      this.attachment = current.attach(this.element, { target, material });
      this.lastScene = current; this.lastTarget = target;
    }
    this.lastMaterial = material;
  }
  invalidate(): void { this.attachment?.invalidate(); }
  private detach(): void { this.attachment?.dispose(); this.attachment = undefined; this.lastScene = undefined; this.lastTarget = undefined; this.lastMaterial = undefined; }
  destroy(): void { this.detach(); this.owned?.dispose(); this.owned = undefined; }
}

/** Angular owns the custom host, decorative canvas and projected semantic DOM. */
@Component({
  selector: 'lgf-surface', standalone: true, exportAs: 'lgfSurface',
  host: { class: 'lgf-host' }, styles: [':host { display: block; }'],
  template: '<canvas #glassTarget class="lgf-surface" [attr.data-lgf-material]="material()" aria-hidden="true" role="presentation" tabindex="-1"></canvas><ng-content />',
})
export class GlassSurfaceComponent {
  readonly material = input<GlassMaterial>('glass');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('glassTarget');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly parent = inject(SCENE, { optional: true });
  private readonly zone = inject(NgZone);
  private readonly destroy = inject(DestroyRef);
  private readonly binding = new SurfaceBinding(this.host.nativeElement, !!this.parent);
  private ready = false;
  private viewReady = false;
  constructor() {
    afterStableView(() => { this.ready = true; this.refresh(); });
    effect(() => { this.material(); this.canvas(); this.parent?.scene(); untracked(() => this.refresh()); });
    this.destroy.onDestroy(() => { this.ready = false; this.binding.destroy(); });
  }
  ngAfterViewInit(): void { this.viewReady = true; this.refresh(); }
  get element(): HTMLElement { return this.host.nativeElement; }
  get target(): HTMLCanvasElement | undefined { return this.canvas()?.nativeElement; }
  invalidate(): void { this.zone.runOutsideAngular(() => this.binding.invalidate()); }
  private refresh(): void {
    if (!this.ready || !this.viewReady || this.destroy.destroyed) return;
    const target = this.target; if (!target) return;
    this.zone.runOutsideAngular(() => this.binding.update(target, this.parent?.scene() ?? null, this.material()));
  }
}

/** Bind a caller-template-owned direct canvas child; never create or move nodes. */
@Directive({ selector: '[lgfSurface]', standalone: true, exportAs: 'lgfSurface', host: { class: 'lgf-host' } })
export class GlassSurfaceDirective {
  readonly lgfTarget = input.required<HTMLCanvasElement>();
  readonly lgfMaterial = input<GlassMaterial>('glass');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly parent = inject(SCENE, { optional: true });
  private readonly zone = inject(NgZone);
  private readonly destroy = inject(DestroyRef);
  private readonly binding = new SurfaceBinding(this.host.nativeElement, !!this.parent);
  private ready = false;
  private viewReady = false;
  constructor() {
    afterStableView(() => { this.ready = true; this.refresh(); });
    effect(() => { this.lgfTarget(); this.lgfMaterial(); this.parent?.scene(); untracked(() => this.refresh()); });
    this.destroy.onDestroy(() => { this.ready = false; this.binding.destroy(); });
  }
  ngAfterViewInit(): void { this.viewReady = true; this.refresh(); }
  get element(): HTMLElement { return this.host.nativeElement; }
  get target(): HTMLCanvasElement { return this.lgfTarget(); }
  invalidate(): void { this.zone.runOutsideAngular(() => this.binding.invalidate()); }
  private refresh(): void {
    if (!this.ready || !this.viewReady || this.destroy.destroyed) return;
    this.zone.runOutsideAngular(() => this.binding.update(this.target, this.parent?.scene() ?? null, this.lgfMaterial()));
  }
}
