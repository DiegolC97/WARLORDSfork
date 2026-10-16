/**
 * The rules document's catalogue of engine quirks (§16), each decided:
 * preserved because the remake must feel like the original, fixed because
 * the work order or a plain defect says so, or not applicable because the
 * slice that owned it was redesigned. The decision is also marked in a
 * comment at the rule it touches; `quirks.test.ts` checks the catalogue is
 * complete and that the data-backed decisions hold in the roster.
 *
 * Numbers are the document's; sections name where the rule lives.
 */
export type QuirkDecision = 'preserve' | 'fix' | 'not-applicable';

export interface Quirk {
  /** The document's number, 1–19. */
  readonly id: number;
  readonly section: string;
  readonly summary: string;
  readonly decision: QuirkDecision;
  readonly rationale: string;
  /** Where the decision is applied, or which slice outside the simulation owns it. */
  readonly where: string;
}

export const QUIRKS: readonly Quirk[] = [
  {
    id: 1,
    section: '§16.1, §7.3',
    summary: 'Five helper routines are never defined; the Spearman and Swordsman shield bashes, dropped weapons and blood never happen.',
    decision: 'fix',
    rationale:
      'The work order restores the Spearman bash as a fourth swipe — a shield strike with its own power, reach and strike frame, outside Spear Training — and rebalances its hit points. The Swordsman bash and the cosmetic effects stay absent: nothing in the work order asks for them.',
    where: 'src/roster/data.ts (SPEARMAN_SHIELD_BASH), src/roster/roster.test.ts',
  },
  {
    id: 2,
    section: '§16.2, §8.1, §8.2',
    summary: 'Swordsman swipe 3 passes its Sword bonus into an ignored argument and stays at power 30.',
    decision: 'preserve',
    rationale: 'Part of the balance players remember; the attack table marks the strike as not scaling and the simulation reads that flag.',
    where: 'src/roster/data.ts (unit 1, swipe 3 upgraded: false), ReferenceBattle.attackFrame',
  },
  {
    id: 3,
    section: '§16.3, §8.1',
    summary: 'Longswordsman swipe 2, Spearmaster, Scout, Giant Troll and Flailer get no weapon upgrade at all.',
    decision: 'preserve',
    rationale: 'Same as quirk 2: which strikes scale is data from the document, applied by the one power formula.',
    where: 'src/roster/data.ts (upgraded: false / upgradeTrack: null), src/battle/upgrades.ts (strikePower)',
  },
  {
    id: 4,
    section: '§16.4, §8.1',
    summary: 'The Whirler, a sword unit, scales with the Halberd track.',
    decision: 'preserve',
    rationale: 'Deliberate fidelity: the shop and the battle agree because both read the unit’s track from the roster.',
    where: 'src/roster/data.ts (unit 10, upgradeTrack: halberd)',
  },
  {
    id: 5,
    section: '§16.5, §6.1, §7.2',
    summary: 'Spearmaster, Mage, Axe Thrower and Javelin Thrower walk at a hard-coded 5 per frame; Spearmaster swipe 2 backs up for nine frames.',
    decision: 'preserve',
    rationale: 'Their feel in the lane depends on it; the listed speeds stay cosmetic for the shop, as in the original.',
    where: 'src/roster/data.ts (WALK_FIXED_5, movement: back-6), ReferenceBattle.spawn / attackFrame',
  },
  {
    id: 6,
    section: '§16.6, §8.4',
    summary: 'The Archer is forced into a 40-frame walk after each shot; the other ranged units are not.',
    decision: 'preserve',
    rationale: 'It is the main difference between Archer and Ranger and part of their balance.',
    where: 'src/roster/data.ts (walkAfter), ReferenceBattle.walkOffShot',
  },
  {
    id: 7,
    section: '§16.7, §11',
    summary: 'Region rewards are shown on the map but never paid; kill bounties are the only income.',
    decision: 'preserve',
    rationale: 'The simulation pays bounties only and reports them in the snapshot; the campaign slice shows no reward it does not pay.',
    where: 'ReferenceBattle.damage (killBounty); outside the simulation: src/campaign',
  },
  {
    id: 8,
    section: '§16.8, §5.4',
    summary: 'Gold from a lost battle is kept in memory and only written to the save on the next purchase or win.',
    decision: 'fix',
    rationale: 'A save-timing accident with no gameplay value; the battle screen writes the earned gold on every outcome.',
    where: 'outside the simulation: src/screens/battle/index.ts (recordOutcome)',
  },
  {
    id: 9,
    section: '§16.9, §3, §4',
    summary: 'Recharge progress carries over a unit switch; the counter is never reset by switching and has no cap.',
    decision: 'preserve',
    rationale: 'A documented tactic (switch to a fast unit and release at once) that the original rewards.',
    where: 'ReferenceBattle.canRelease, src/battle/simulation.test.ts (“switching unit keeps the accumulated recharge”)',
  },
  {
    id: 10,
    section: '§16.10, §13',
    summary: 'The computer charges on more than 20 kills; a human on 20 or more.',
    decision: 'preserve',
    rationale: 'The opponent’s rhythm is part of the campaign’s feel; one kill of slack changes nothing for the player.',
    where: 'ReferenceBattle.aiStep',
  },
  {
    id: 11,
    section: '§16.11, §7.4',
    summary: 'Body cleanup references a missing camera, so bodies only disappear through the alpha fade (~25 s).',
    decision: 'preserve',
    rationale: 'The work order specifies exactly this: 500 frames lying, then 1 % per frame to removal.',
    where: 'src/battle/types.ts (BODY_FRAMES, FADE_PER_FRAME), ReferenceBattle.tickUnit / unitState',
  },
  {
    id: 12,
    section: '§16.12, §6.1',
    summary: 'The shop’s “Max Damage” figures are hand-typed and do not match the strike powers.',
    decision: 'preserve',
    rationale: 'Combat never reads them; the roster keeps them as shownMaxDamage for the shop tooltip, exactly as the original displayed.',
    where: 'src/roster/data.ts (shownMaxDamage); outside the simulation: src/screens/shop',
  },
  {
    id: 13,
    section: '§16.13, §12.2',
    summary: 'One region is labelled Easy but carries a Hard-tier reward.',
    decision: 'not-applicable',
    rationale: 'The campaign map was redesigned around six blocs and four contested regions; the original region table is not used.',
    where: 'outside the simulation: src/campaign/regions.ts',
  },
  {
    id: 14,
    section: '§16.14, §8.3',
    summary: 'The enemy side’s gold is accumulated but never used.',
    decision: 'preserve',
    rationale: 'The simulation credits both sides alike and reports both in the snapshot; the campaign reads only the left side’s.',
    where: 'ReferenceBattle.damage, FrameState.spawners[side].gold',
  },
  {
    id: 15,
    section: '§16.15, §7',
    summary: 'Unit sprites carry states (duck, jump, hit reactions, alternative deaths, walk-back) that no rule triggers.',
    decision: 'preserve',
    rationale: 'The simulation emits only walk, swipe-N and death clips; art may hold more, the rules will never ask for it.',
    where: 'src/battle/types.ts (ClipName), ReferenceBattle.unitState',
  },
  {
    id: 16,
    section: '§16.16',
    summary: 'Per-lane unit naming wraps at 300 spawned units per side; an old unit could be overwritten in a very long battle.',
    decision: 'fix',
    rationale: 'An implementation accident with no upside; entity ids are unbounded integers, unique for the whole battle.',
    where: 'ReferenceBattle.nextId',
  },
  {
    id: 17,
    section: '§16.17, §12.4',
    summary: 'The map’s difficulty percentage can exceed 100 %.',
    decision: 'preserve',
    rationale: 'Display only; whichever difficulty display the campaign slice keeps, the simulation is unaffected.',
    where: 'outside the simulation: src/campaign',
  },
  {
    id: 18,
    section: '§16.18, §12.2',
    summary: 'Region adjacency lists are not symmetric; arrows are drawn only from the attacker’s list.',
    decision: 'not-applicable',
    rationale: 'The redesigned map declares its own adjacency; the original lists are not used.',
    where: 'outside the simulation: src/campaign/regions.ts',
  },
  {
    id: 19,
    section: '§16.19, §5.2',
    summary: 'The territory bar animates 1 px per frame, so the instant win lands up to 14 frames late or, if the score swings back, not at all.',
    decision: 'fix',
    rationale:
      'The work order requires the battle to end on the tick the lead reaches the limit, with no further ticks; the drawn width still animates for the renderer and snaps on the deciding tick.',
    where: 'ReferenceBattle.tickBar, src/battle/types.ts (POINTS_TO_WIN), src/battle/simulation.test.ts (“a 25-point lead…”)',
  },
];

/** The catalogue entry for a document quirk number. */
export function quirk(id: number): Quirk {
  const q = QUIRKS.find((entry) => entry.id === id);
  if (!q) throw new Error(`quirk ${id} is not catalogued`);
  return q;
}
