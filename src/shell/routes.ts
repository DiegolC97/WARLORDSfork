/**
 * Navigation as data. A screen never names another screen: it emits an
 * event (`ctx.navigate('back')`) and this table decides where that leads.
 *
 * To add a screen: add its id to `SCREEN_IDS`, add its row here, register its
 * definition in `screens/index.ts`. The route tests check that every screen is
 * reachable from the main menu and can get back to it.
 */

export const SCREEN_IDS = [
  'boot',
  'menu',
  'instructions',
  'options',
  'credits',
  'shop',
  'map',
  'battle',
  'result',
] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export type RouteTable = Readonly<Record<ScreenId, Readonly<Record<string, ScreenId>>>>;

export const INITIAL_SCREEN: ScreenId = 'boot';
export const HOME_SCREEN: ScreenId = 'menu';

export const ROUTES: RouteTable = {
  boot: { ready: 'menu' },
  menu: {
    campaign: 'map',
    twoPlayer: 'battle',
    instructions: 'instructions',
    options: 'options',
    credits: 'credits',
  },
  instructions: { back: 'menu' },
  options: { back: 'menu' },
  credits: { back: 'menu' },
  map: { back: 'menu', shop: 'shop', battle: 'battle' },
  shop: { back: 'map' },
  battle: { finished: 'result', retreat: 'map' },
  result: { continue: 'map', menu: 'menu' },
};

export function resolveRoute(routes: RouteTable, from: ScreenId, event: string): ScreenId | undefined {
  return routes[from][event];
}

/** Every screen reachable from `start` by following events. */
export function reachableFrom(routes: RouteTable, start: ScreenId): Set<ScreenId> {
  const seen = new Set<ScreenId>([start]);
  const queue: ScreenId[] = [start];
  while (queue.length) {
    const at = queue.shift()!;
    for (const next of Object.values(routes[at])) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Shortest event sequence from `from` to `to`, or `undefined` if there is none. */
export function pathBetween(routes: RouteTable, from: ScreenId, to: ScreenId): string[] | undefined {
  const prev = new Map<ScreenId, { via: ScreenId; event: string }>();
  const queue: ScreenId[] = [from];
  const seen = new Set<ScreenId>([from]);
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) {
      const events: string[] = [];
      let cur = at;
      while (cur !== from) {
        const step = prev.get(cur)!;
        events.unshift(step.event);
        cur = step.via;
      }
      return events;
    }
    for (const [event, next] of Object.entries(routes[at])) {
      if (!seen.has(next)) {
        seen.add(next);
        prev.set(next, { via: at, event });
        queue.push(next);
      }
    }
  }
  return undefined;
}
