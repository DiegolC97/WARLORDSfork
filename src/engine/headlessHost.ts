/**
 * The engine without a screen: a real PlayCanvas application on the null
 * graphics device, for tests that must see what the renderer builds —
 * entities, sprite components, clips, frames, transforms and the camera's
 * projection — without WebGL. Nothing is rasterised; everything else runs.
 *
 * Frames never happen on their own: a test drives them with
 * `tick(frames, fps)`, which updates the application (firing every
 * `onFrame` callback) and renders once, so the layers' draw order is the
 * one the browser would use.
 *
 * Assets: a `readText` reader (tests pass one over `public/`) resolves
 * `json` specs to the parsed document and `textureatlas` specs to an
 * engine `TextureAtlas` with a texture of the atlas's declared size and
 * the file's frames — the same resource the browser's atlas loader
 * produces. Without a reader, or for other types, a spec resolves to a
 * stub as the null host's does.
 */
import * as pc from 'playcanvas';
import type { AssetBackend, AssetSpec } from '../assets/loader';
import type { EngineHost, FrameCallback } from './host';
import { addHostCamera, appHostMethods } from './appHost';

export interface HeadlessHostOptions {
  /** Canvas size in pixels (the device's resolution and, headless, its client size). */
  readonly width?: number;
  readonly height?: number;
  /** Text of a site-relative asset url, or `null` when there is no such file. */
  readonly readText?: (url: string) => string | null;
}

export class HeadlessEngineHost implements EngineHost {
  readonly app: pc.Application;
  readonly device: pc.NullGraphicsDevice;
  readonly canvas: HTMLCanvasElement;
  readonly assetBackend: AssetBackend;
  readonly rootsCreated: string[] = [];
  private readonly methods: ReturnType<typeof appHostMethods>;
  private frameListenerCount = 0;

  constructor(options: HeadlessHostOptions = {}) {
    const { width = 1400, height = 900, readText } = options;
    this.canvas = document.createElement('canvas');
    // jsdom lays nothing out, so the canvas reports its fixed size as its client rect (what the cameras' screen
    // conversions and the field viewport read).
    this.canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) });
    this.device = new pc.NullGraphicsDevice(this.canvas, {});
    this.app = new pc.Application(this.canvas, { graphicsDevice: this.device });
    this.app.setCanvasResolution(pc.RESOLUTION_FIXED, width, height);
    const camera = addHostCamera(this.app);
    this.methods = appHostMethods(this.app, camera);
    const device = this.device;
    this.assetBackend = {
      load: async (spec: AssetSpec) => {
        const text = readText?.(spec.url) ?? null;
        if (text === null) return { id: spec.id, url: spec.url };
        if (spec.type === 'json') return JSON.parse(text) as unknown;
        if (spec.type === 'textureatlas') return textureAtlasFromDocument(device, JSON.parse(text) as AtlasLike);
        return { id: spec.id, url: spec.url };
      },
      unload: () => {},
    };
  }

  createSceneRoot(name: string): pc.Entity {
    this.rootsCreated.push(name);
    return this.methods.createSceneRoot(name) as pc.Entity;
  }

  setClearColor(r: number, g: number, b: number): void {
    this.methods.setClearColor(r, g, b);
  }

  onFrame(cb: FrameCallback): () => void {
    this.frameListenerCount++;
    const off = this.methods.onFrame(cb);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.frameListenerCount--;
      off();
    };
  }

  /** Number of frame callbacks currently subscribed. */
  get frameListeners(): number {
    return this.frameListenerCount;
  }

  /** Deliver `frames` frames of `1 / fps` seconds: update the application (every subscriber runs) and render. */
  tick(frames = 1, fps = 24): void {
    for (let i = 0; i < frames; i++) {
      this.app.update(1 / fps);
      this.app.render();
    }
  }

  /** The cameras currently rendering, by priority — what `render` drew with. */
  get cameras(): readonly pc.CameraComponent[] {
    return this.app.systems.camera?.cameras ?? [];
  }

  destroy(): void {
    this.app.destroy();
  }
}

/** The shape of an atlas json the reader hands back (`AtlasDocument` in `src/roster/atlas.ts`, untyped here). */
export interface AtlasLike {
  readonly texture?: string;
  readonly meta?: { readonly size?: readonly [number, number] };
  readonly frames: Readonly<Record<string, { readonly rect: readonly number[]; readonly pivot: readonly number[]; readonly border?: readonly number[] }>>;
}

/** An engine texture atlas from a parsed atlas json: the frames as the engine's atlas loader builds them, over a blank texture of the declared size. */
export function textureAtlasFromDocument(device: pc.GraphicsDevice, doc: AtlasLike): pc.TextureAtlas {
  let width = doc.meta?.size?.[0] ?? 0;
  let height = doc.meta?.size?.[1] ?? 0;
  if (!(width > 0 && height > 0)) {
    width = 1;
    height = 1;
    for (const f of Object.values(doc.frames)) {
      width = Math.max(width, (f.rect[0] ?? 0) + (f.rect[2] ?? 0));
      height = Math.max(height, (f.rect[1] ?? 0) + (f.rect[3] ?? 0));
    }
  }
  const atlas = new pc.TextureAtlas();
  atlas.texture = new pc.Texture(device, { name: doc.texture ?? 'atlas', width, height, format: pc.PIXELFORMAT_RGBA8, mipmaps: false });
  const frames: Record<string, { rect: pc.Vec4; pivot: pc.Vec2; border: pc.Vec4 }> = {};
  for (const [key, f] of Object.entries(doc.frames)) {
    frames[key] = { rect: new pc.Vec4(...(f.rect as [number, number, number, number])), pivot: new pc.Vec2(...(f.pivot as [number, number])), border: new pc.Vec4(...((f.border ?? [0, 0, 0, 0]) as [number, number, number, number])) };
  }
  atlas.frames = frames;
  return atlas;
}
