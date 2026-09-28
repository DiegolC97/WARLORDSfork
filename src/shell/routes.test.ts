import { describe, expect, it } from 'vitest';
import { HOME_SCREEN, INITIAL_SCREEN, ROUTES, SCREEN_IDS, pathBetween, reachableFrom } from './routes';

describe('route table', () => {
  it('has a row for every screen and only targets known screens', () => {
    for (const id of SCREEN_IDS) {
      expect(ROUTES).toHaveProperty(id);
      for (const target of Object.values(ROUTES[id])) expect(SCREEN_IDS).toContain(target);
    }
  });

  it('reaches every screen from the main menu (boot only via start)', () => {
    const reachable = reachableFrom(ROUTES, HOME_SCREEN);
    for (const id of SCREEN_IDS) {
      if (id === INITIAL_SCREEN) continue;
      expect(reachable.has(id), `screen "${id}" is not reachable from the menu`).toBe(true);
    }
  });

  it('every screen can get back to the main menu — no dead route', () => {
    for (const id of SCREEN_IDS) {
      expect(pathBetween(ROUTES, id, HOME_SCREEN), `no way back to menu from "${id}"`).toBeDefined();
    }
  });

  it('boot leads to the main menu', () => {
    expect(pathBetween(ROUTES, INITIAL_SCREEN, HOME_SCREEN)).toEqual(['ready']);
  });
});
