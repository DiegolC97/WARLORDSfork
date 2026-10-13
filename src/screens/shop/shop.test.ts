import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../../app';
import { NullEngineHost } from '../../engine/nullHost';
import { killBounty, shopOffers, shopPrice, unitDisplayName, unitStats, type UnitId } from '../../roster';
import { MemoryStorage, SaveStore } from '../../save';

let overlayRoot: HTMLElement;
let storage: MemoryStorage;
let app: App;

const boot = async () => {
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  app = await createApp({ host: new NullEngineHost(), overlayRoot, storage });
  await app.shell.navigate('ready');
};

const click = async (action: string) => {
  const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) throw new Error(`no button "${action}" on ${app.shell.activeScreenId}`);
  if (btn.disabled) throw new Error(`button "${action}" is disabled`);
  btn.click();
  await app.shell.settled();
};

const saved = () => new SaveStore({ storage }).load().save;
const offerNode = (unit: UnitId) => overlayRoot.querySelector<HTMLElement>(`[data-offer="${unit}"]`);

beforeEach(async () => {
  storage = new MemoryStorage();
  await boot();
  await click('campaign');
  await click('pick-race:race4');
  await click('shop');
});

describe('shop reads the roster definition (AC 8)', () => {
  it('lists the offers with the data-driven price and bounty, named for the player\'s race', () => {
    expect(app.shell.activeScreenId).toBe('shop');
    const expected = shopOffers(saved().ownedUnits, 'race4');
    const shown = [...overlayRoot.querySelectorAll<HTMLElement>('[data-offer]')].map((n) => Number(n.dataset.offer));
    expect(shown).toEqual(expected);
    for (const unit of expected) {
      const node = offerNode(unit)!;
      expect(node.dataset.price).toBe(String(shopPrice(unit)));
      expect(node.dataset.bounty).toBe(String(killBounty(unit)));
      expect(node.dataset.price).toBe(String(unitStats(unit).cost));
      expect(node.textContent).toContain(unitDisplayName(unit, 'race4'));
    }
    expect(overlayRoot.querySelector('[data-role="owned"]')!.textContent).toContain(unitDisplayName(0, 'race4'));
  });

  it('buying deducts the price from the data and adds the unit to the army', async () => {
    // The cheapest offer the starting 500 gold can afford.
    const unit = shopOffers(saved().ownedUnits, 'race4')
      .filter((u) => shopPrice(u) <= 500)
      .sort((a, b) => shopPrice(a) - shopPrice(b))[0]!;
    const price = shopPrice(unit);
    expect(offerNode(unit)!.querySelector('button')!.textContent).toBe(`Buy for ${price}`);
    await click(`buy:${unit}`);
    expect(saved().gold).toBe(500 - price);
    expect(saved().ownedUnits).toContain(unit);
    expect(offerNode(unit)).toBeNull();
    expect(overlayRoot.querySelector('[data-role="owned"]')!.textContent).toContain(unitDisplayName(unit, 'race4'));
    const unaffordable = overlayRoot.querySelector<HTMLButtonElement>('button[data-action^="buy:"]:not([disabled])');
    for (const node of overlayRoot.querySelectorAll<HTMLElement>('[data-offer]')) {
      const btn = node.querySelector<HTMLButtonElement>('button')!;
      expect(btn.disabled).toBe(Number(node.dataset.price) > saved().gold);
    }
    expect(unaffordable === null || Number(unaffordable.closest<HTMLElement>('[data-offer]')!.dataset.price) <= saved().gold).toBe(true);
  });
});
