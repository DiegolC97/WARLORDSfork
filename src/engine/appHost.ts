/**
 * What every engine-backed host shares, whichever graphics device the
 * application runs on: the host camera that clears the canvas, per-screen
 * scene roots, the frame callback and the asset backend that turns a
 * manifest spec into an engine asset. `playcanvasHost.ts` (WebGL, the
 * browser) and `headlessHost.ts` (the null device, tests) both build on it.
 */
import * as pc from 'playcanvas';
import type { AssetBackend, AssetSpec } from '../assets/loader';
import type { EngineHost } from './host';

/** The host's own camera: it clears the canvas every frame; screens may add cameras of their own above it. */
export function addHostCamera(app: pc.AppBase): pc.Entity {
  const camera = new pc.Entity('camera', app);
  camera.addComponent('camera', { clearColor: new pc.Color(0.05, 0.05, 0.08), priority: 0 });
  camera.setPosition(0, 0, 10);
  app.root.addChild(camera);
  return camera;
}

/** The host methods every engine-backed host answers the same way. */
export function appHostMethods(app: pc.AppBase, camera: pc.Entity): Pick<EngineHost, 'createSceneRoot' | 'setClearColor' | 'onFrame'> {
  return {
    createSceneRoot(name) {
      const root = new pc.Entity(name, app);
      app.root.addChild(root);
      return root;
    },
    setClearColor(r, g, b) {
      if (camera.camera) camera.camera.clearColor = new pc.Color(r, g, b);
    },
    onFrame(cb) {
      const handler = (dt: number) => cb(dt);
      app.on('update', handler);
      return () => app.off('update', handler);
    },
  };
}

/** An asset backend over the application's registry: each spec becomes a `pc.Asset` loaded by the engine's handlers. */
export function engineAssetBackend(app: pc.AppBase): AssetBackend {
  return {
    load(spec: AssetSpec) {
      return new Promise((resolve, reject) => {
        const existing = app.assets.find(spec.id, spec.type);
        const asset = existing ?? new pc.Asset(spec.id, spec.type, { url: spec.url });
        if (!existing) app.assets.add(asset);
        asset.ready(() => resolve(asset.resource));
        asset.once('error', (err: unknown) => reject(err));
        app.assets.load(asset);
      });
    },
    unload(spec: AssetSpec) {
      const asset = app.assets.find(spec.id, spec.type);
      if (asset) {
        asset.unload();
        app.assets.remove(asset);
      }
    },
  };
}
