import { nullAssetBackend } from '../assets/loader';
import type { EngineHost, FrameCallback } from './host';

/**
 * Headless host for tests and for booting without WebGL. Records what was
 * asked of it. Frames never happen on their own: a test drives them with
 * `tick(frames, fps)`.
 */
export class NullEngineHost implements EngineHost {
  readonly app = null;
  readonly assetBackend = nullAssetBackend;
  readonly rootsCreated: string[] = [];
  clearColor: [number, number, number] = [0, 0, 0];
  private readonly frameCallbacks = new Set<FrameCallback>();

  createSceneRoot(name: string): null {
    this.rootsCreated.push(name);
    return null;
  }

  setClearColor(r: number, g: number, b: number): void {
    this.clearColor = [r, g, b];
  }

  onFrame(cb: FrameCallback): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  /** Number of frame callbacks currently subscribed. */
  get frameListeners(): number {
    return this.frameCallbacks.size;
  }

  /** Deliver `frames` frames, each `1 / fps` seconds long, to every subscriber. */
  tick(frames = 1, fps = 24): void {
    for (let i = 0; i < frames; i++) {
      for (const cb of [...this.frameCallbacks]) cb(1 / fps);
    }
  }
}
