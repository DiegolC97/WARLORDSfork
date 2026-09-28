/**
 * Import boundaries enforced at build time (`npm run check:deps`, part of
 * `npm run build`). A violation fails the build with a message naming both
 * the importing module and the imported one.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-screen-imports',
      severity: 'error',
      comment:
        'A screen must not import another screen. Screens talk to each other only through ' +
        'navigation events resolved by src/shell/routes.ts.',
      from: { path: '^src/screens/([^/]+)/' },
      to: { path: '^src/screens/(?!$1/)[^/]+/' },
    },
    {
      name: 'screens-expose-only-index',
      severity: 'error',
      comment:
        'Code outside a screen folder may import only that screen\'s index.ts, never its internals.',
      from: { pathNot: '^src/screens/([^/]+)/' },
      to: { path: '^src/screens/[^/]+/(?!index\\.ts$)' },
    },
    {
      name: 'only-save-module-touches-storage',
      severity: 'error',
      comment: 'Only src/save/saveStore.ts may read or write stored campaign data.',
      from: { pathNot: '^src/save/' },
      to: { path: '^src/save/(schema|migrations|saveStore)\\.ts$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'], extensions: ['.ts', '.js'] },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
