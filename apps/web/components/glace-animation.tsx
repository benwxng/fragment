'use client';

import { useEffect, useRef, useState } from 'react';
import type { Rive } from '@rive-app/canvas';
import { MarkIcon } from '@/components/icons';

export function GlaceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Rive | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion || !canvasRef.current) return;
    let disposed = false;
    let player: Rive | undefined;
    const resize = () => player?.resizeDrawingSurfaceToCanvas();
    const observer = new ResizeObserver(resize);
    const canvas = canvasRef.current;

    async function load() {
      try {
        const { Rive, RuntimeLoader, Layout, Fit, Alignment } = await import('@rive-app/canvas');
        if (disposed) return;
        RuntimeLoader.setWasmUrl('/brand/rive.wasm');
        player = new Rive({
          src: '/brand/glace-eye.riv',
          canvas,
          artboard: 'Glace',
          stateMachines: 'Glace Loop',
          autoplay: false,
          layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
          onLoad: () => {
            if (disposed) return;
            resize();
            setReady(true);
          },
          onLoadError: () => { if (!disposed) setReady(false); },
        });
        playerRef.current = player;
        observer.observe(canvas);
        window.addEventListener('resize', resize);
      } catch {
        // Keep the static logo if the runtime cannot load.
        if (!disposed) setReady(false);
      }
    }
    void load();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', resize);
      playerRef.current = null;
      player?.cleanup();
      setReady(false);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!ready) return;
    const update = () => {
      if (paused || reducedMotion || document.hidden) playerRef.current?.pause();
      else playerRef.current?.play();
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [paused, ready, reducedMotion]);

  return (
    <div className="auth-art">
      <div className="auth-eye" aria-hidden="true">
        <div className="auth-eye-static" hidden={ready && !reducedMotion}><MarkIcon /></div>
        <canvas ref={canvasRef} className="auth-eye-canvas" hidden={!ready || reducedMotion} />
      </div>
      <div className="auth-art-caption">
        <p className="auth-art-name">Glace</p>
        <p>Keep what catches your eye.</p>
      </div>
      {ready && !reducedMotion ? (
        <button className="auth-animation-control" type="button" onClick={() => setPaused(value => !value)}>
          {paused ? 'Play animation' : 'Pause animation'}
        </button>
      ) : null}
    </div>
  );
}
