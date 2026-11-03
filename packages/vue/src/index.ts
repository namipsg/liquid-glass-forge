import { defineComponent, h, inject, mergeProps, onActivated, onBeforeUnmount, onDeactivated, onMounted, provide, shallowRef, toRaw, toValue, watch } from 'vue';
import type { HTMLAttributes, InjectionKey, MaybeRefOrGetter, PropType, ShallowRef } from 'vue';
import { createGlassScene } from '@liquid-glass-forge/dom';
import type { GlassAttachment, GlassMaterial, GlassRenderer, GlassScene, SceneSource } from '@liquid-glass-forge/dom';

interface SceneContext { readonly scene: ShallowRef<GlassScene | null> }
const SceneKey: InjectionKey<SceneContext> = Symbol('LiquidGlassForgeScene');

/** Caller owns source/renderer descriptors. This provider owns engine lifetimes. */
export const GlassSceneProvider = defineComponent({
  name: 'GlassSceneProvider',
  props: {
    source: Object as PropType<SceneSource>,
    renderer: Object as PropType<GlassRenderer>,
    timeoutMs: Number,
    paused: Boolean,
    onError: Function as PropType<(error: unknown) => void>,
  },
  setup(props, { slots }) {
    const scene = shallowRef<GlassScene | null>(null);
    provide(SceneKey, { scene });
    let mounted = false, active = false, dirty = true;
    const retire = () => { const old = scene.value; scene.value = null; old?.dispose(); };
    const start = () => {
      if (!mounted || !active) return;
      if (dirty || !scene.value) {
        retire();
        const next = createGlassScene({
          ...(props.source ? { source: toRaw(props.source) } : {}),
          ...(props.renderer ? { renderer: toRaw(props.renderer) } : {}),
          ...(props.timeoutMs === undefined ? {} : { timeoutMs: props.timeoutMs }),
          onError: cause => props.onError?.(cause),
        });
        if (props.paused) next.pause();
        scene.value = next; dirty = false;
      } else if (!props.paused && scene.value.state === 'paused') scene.value.resume();
    };
    watch(() => [props.source, props.renderer, props.timeoutMs], () => { dirty = true; retire(); start(); }, { flush: 'post' });
    watch(() => props.paused, paused => { if (paused) scene.value?.pause(); else start(); }, { flush: 'post' });
    onMounted(() => { mounted = active = true; start(); });
    onActivated(() => { active = true; start(); });
    onDeactivated(() => { active = false; scene.value?.pause(); });
    onBeforeUnmount(() => { mounted = active = false; retire(); });
    return () => slots.default?.();
  },
});

export interface UseGlassSurfaceOptions { readonly material?: MaybeRefOrGetter<GlassMaterial> }
export interface GlassSurfaceBinding {
  readonly element: ShallowRef<HTMLElement | null>;
  readonly target: ShallowRef<HTMLCanvasElement | null>;
  readonly invalidate: () => void;
}

/** Setup-only composable. Supply a dedicated direct canvas child owned by Vue. */
export function useGlassSurface(options: UseGlassSurfaceOptions = {}): GlassSurfaceBinding {
  const shared = inject(SceneKey, null);
  const element = shallowRef<HTMLElement | null>(null), target = shallowRef<HTMLCanvasElement | null>(null);
  let boundElement: HTMLElement | null = null, boundTarget: HTMLCanvasElement | null = null, boundScene: GlassScene | null = null;
  let active = false, attachment: GlassAttachment | null = null, owned: GlassScene | null = null;
  const material = () => options.material === undefined ? 'glass' : toValue(options.material);
  const detach = () => { attachment?.dispose(); attachment = null; boundElement = boundTarget = null; boundScene = null; };
  const attach = () => {
    if (!active || !element.value || !target.value) { detach(); return; }
    if (!shared && !owned) owned = createGlassScene();
    const scene = shared ? shared.scene.value : owned;
    if (!scene || scene.state === 'destroyed') { detach(); return; }
    if (attachment && boundScene === scene && boundElement === element.value && boundTarget === target.value) return;
    detach();
    if (owned?.state === 'paused') owned.resume();
    attachment = scene.attach(element.value, { target: target.value, material: material() });
    boundElement = element.value; boundTarget = target.value; boundScene = scene;
  };
  watch([element, target, () => shared?.scene.value], attach, { flush: 'post' });
  watch(material, value => attachment?.update({ material: value }), { flush: 'post' });
  onMounted(() => { active = true; attach(); });
  onActivated(() => { if (active) return; active = true; attach(); });
  onDeactivated(() => { active = false; detach(); owned?.pause(); });
  onBeforeUnmount(() => { active = false; detach(); owned?.dispose(); owned = null; });
  return { element, target, invalidate: () => attachment?.invalidate() };
}

export interface GlassSurfaceHandle {
  readonly element: HTMLElement | null;
  readonly target: HTMLCanvasElement | null;
  readonly invalidate: () => void;
}
export interface GlassSurfaceProps extends HTMLAttributes { readonly material?: GlassMaterial }
/** Stable server/client markup. Native attributes/events and slots remain Vue-owned. */
export const GlassSurface = defineComponent<GlassSurfaceProps>((props, { attrs, slots, expose }) => {
  const material = () => props.material ?? 'glass';
  const binding = useGlassSurface({ material });
  expose({ get element() { return binding.element.value; }, get target() { return binding.target.value; }, invalidate: binding.invalidate });
  return () => h('div', mergeProps(attrs, { class: 'lgf-host', ref: binding.element }), [
    h('canvas', { class: 'lgf-surface', 'data-lgf-material': material(), 'aria-hidden': 'true', role: 'presentation', tabindex: -1, ref: binding.target }),
    ...(slots.default?.() ?? []),
  ]);
}, {
  name: 'GlassSurface', inheritAttrs: false,
  props: { material: { type: String as PropType<GlassMaterial>, default: 'glass' } },
});
