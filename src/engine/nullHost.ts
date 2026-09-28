import { nullAssetBackend } from '../assets/loader';
import type { EngineHost } from './host';

/** Headless host for tests and for booting without WebGL. Records what was asked of it. */
export class NullEngineHost implements EngineHost {
  readonly app = null;
  readonly assetBackend = nullAssetBackend;
  readonly rootsCreated: string[] = [];
  clearColor: [number, number, number] = [0, 0, 0];

  createSceneRoot(name: string): null {
    this.rootsCreated.push(name);
    return null;
  }

  setClearColor(r: number, g: number, b: number): void {
    this.clearColor = [r, g, b];
  }
}
