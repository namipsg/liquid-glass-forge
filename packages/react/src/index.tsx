'use client';

import { createContext, createElement, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode, RefCallback } from 'react';
import { createGlassScene } from '@liquid-glass-forge/dom';
import type { GlassScene, GlassAttachment, GlassMaterial, GlassRenderer, SceneSource } from '@liquid-glass-forge/dom';

export interface GlassSceneProviderProps {
  readonly children?: ReactNode;
  readonly source?: SceneSource;
  readonly renderer?: GlassRenderer;
  readonly timeoutMs?: number;
  readonly paused?: boolean;
  readonly onError?: (error: unknown) => void;
}
const SceneContext = createContext<{ readonly scene: GlassScene | null } | null>(null);

/** Caller owns source/renderer objects. Each effect owns one engine lifetime. */
export function GlassSceneProvider({ children, source, renderer, timeoutMs, paused = false, onError }: GlassSceneProviderProps) {
  const [scene, setScene] = useState<GlassScene | null>(null);
  const error = useRef(onError);
  const pausedRef = useRef(paused);
  useEffect(() => { error.current = onError; pausedRef.current = paused; }, [onError, paused]);
  useEffect(() => {
    const next = createGlassScene({ ...(source ? { source } : {}), ...(renderer ? { renderer } : {}),
      ...(timeoutMs === undefined ? {} : { timeoutMs }), onError: cause => error.current?.(cause) });
    if (pausedRef.current) next.pause();
    setScene(next);
    return () => { next.dispose(); setScene(null); };
  }, [source, renderer, timeoutMs]);
  useEffect(() => {
    if (!scene || scene.state === 'destroyed') return;
    if (paused) scene.pause(); else if (scene.state === 'paused') scene.resume();
  }, [scene, paused]);
  const value = useMemo(() => ({ scene }), [scene]);
  return createElement(SceneContext.Provider, { value }, children);
}

export interface UseGlassSurfaceOptions { readonly material?: GlassMaterial }
export interface GlassSurfaceBinding {
  readonly ref: RefCallback<HTMLElement>;
  readonly targetRef: RefCallback<HTMLCanvasElement>;
  readonly invalidate: () => void;
}
/** Supply a dedicated direct canvas child. React retains both DOM nodes. */
export function useGlassSurface({ material = 'glass' }: UseGlassSurfaceOptions = {}): GlassSurfaceBinding {
  const shared = useContext(SceneContext);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<HTMLCanvasElement | null>(null);
  const attachment = useRef<GlassAttachment | null>(null);
  const materialRef = useRef(material);
  useEffect(() => { materialRef.current = material; }, [material]);
  const ref = useCallback((node: HTMLElement | null) => { setElement(node); }, []);
  const targetRef = useCallback((node: HTMLCanvasElement | null) => { setTarget(node); }, []);
  useEffect(() => {
    if (!element || !target || (shared && !shared.scene)) return;
    const owned = shared ? null : createGlassScene();
    const scene = shared?.scene ?? owned!;
    if (scene.state === 'destroyed') return;
    let current: GlassAttachment;
    try { current = scene.attach(element, { target, material: materialRef.current }); }
    catch (cause) { owned?.dispose(); throw cause; }
    attachment.current = current;
    return () => {
      if (attachment.current === current) attachment.current = null;
      current.dispose(); owned?.dispose();
    };
  }, [element, target, shared?.scene, !!shared]);
  useEffect(() => { attachment.current?.update({ material }); }, [material]);
  const invalidate = useCallback(() => { attachment.current?.invalidate(); }, []);
  return useMemo(() => ({ ref, targetRef, invalidate }), [ref, targetRef, invalidate]);
}

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement>, UseGlassSurfaceOptions {
  readonly children?: ReactNode;
}
/** Stable server/client markup; no DOM access or engine allocation in render. */
export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(function GlassSurface(
  { children, material = 'glass', className, ...attributes }, forwardedRef,
) {
  const binding = useGlassSurface({ material });
  const ref = useCallback((node: HTMLDivElement | null) => {
    binding.ref(node);
    if (typeof forwardedRef === 'function') {
      // ForwardedRef retains its legacy void signature; public RefCallback supports cleanup.
      const cleanup = (forwardedRef as RefCallback<HTMLDivElement>)(node);
      if (node) return () => { binding.ref(null); if (typeof cleanup === 'function') cleanup(); else forwardedRef(null); };
    } else if (forwardedRef) {
      forwardedRef.current = node;
      if (node) return () => { binding.ref(null); forwardedRef.current = null; };
    }
    return undefined;
  }, [binding.ref, forwardedRef]);
  return <div {...attributes} className={['lgf-host', className].filter(Boolean).join(' ')} ref={ref}>
    <canvas className="lgf-surface" data-lgf-material={material} aria-hidden="true" role="presentation" tabIndex={-1} ref={binding.targetRef} />
    {children}
  </div>;
});
