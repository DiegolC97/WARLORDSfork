/**
 * The campaign map as data: 28 regions on a hex layout, grouped into six
 * blocs of four (one per territory-holding race) plus four contested regions
 * that belong to no race.
 *
 * Adjacency is explicit — it is what decides which regions can be attacked
 * from the player's holdings — and the test suite checks it stays consistent
 * with the hex geometry the map draws, so an arrow never points somewhere
 * the picture does not justify.
 *
 * Region names live in `src/names/displayNames.ts` (`regionName(id)`); this
 * file holds only identifiers, structure and layout. No unit statistics
 * live here: the seam to the roster is each bloc's race id.
 */
import type { BlocRaceId } from '../save';

export const REGION_IDS = [
  'r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10',
  'r11', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18', 'r19', 'r20',
  'r21', 'r22', 'r23', 'r24', 'r25', 'r26', 'r27', 'r28',
] as const;
export type RegionId = (typeof REGION_IDS)[number];

export const CONTESTED = 'contested';
/** A region's bloc: the race that holds it at campaign start, or contested. */
export type Bloc = BlocRaceId | typeof CONTESTED;

export interface RegionData {
  readonly id: RegionId;
  readonly bloc: Bloc;
  /** Odd-r offset hex coordinates (odd rows shifted half a hex right). Layout only. */
  readonly col: number;
  readonly row: number;
  /** Regions sharing a border; symmetric. */
  readonly adjacent: readonly RegionId[];
}

export const REGIONS: readonly RegionData[] = [
  // race1 bloc — north-west
  { id: 'r01', bloc: 'race1', col: 1, row: 0, adjacent: ['r02', 'r03', 'r04'] },
  { id: 'r02', bloc: 'race1', col: 2, row: 0, adjacent: ['r01', 'r04', 'r07', 'r25'] },
  { id: 'r03', bloc: 'race1', col: 0, row: 1, adjacent: ['r01', 'r04', 'r13', 'r15'] },
  { id: 'r04', bloc: 'race1', col: 1, row: 1, adjacent: ['r01', 'r02', 'r03', 'r15', 'r25', 'r26'] },
  // race2 bloc — north-east
  { id: 'r05', bloc: 'race2', col: 4, row: 0, adjacent: ['r06', 'r07', 'r08', 'r09'] },
  { id: 'r06', bloc: 'race2', col: 4, row: 1, adjacent: ['r05', 'r08', 'r09', 'r10', 'r11', 'r12'] },
  { id: 'r07', bloc: 'race2', col: 3, row: 0, adjacent: ['r02', 'r05', 'r08', 'r25'] },
  { id: 'r08', bloc: 'race2', col: 3, row: 1, adjacent: ['r05', 'r06', 'r07', 'r12', 'r25', 'r27'] },
  // race3 bloc — east
  { id: 'r09', bloc: 'race3', col: 5, row: 0, adjacent: ['r05', 'r06', 'r10'] },
  { id: 'r10', bloc: 'race3', col: 5, row: 1, adjacent: ['r06', 'r09', 'r11'] },
  { id: 'r11', bloc: 'race3', col: 5, row: 2, adjacent: ['r06', 'r10', 'r12', 'r21', 'r24'] },
  { id: 'r12', bloc: 'race3', col: 4, row: 2, adjacent: ['r06', 'r08', 'r11', 'r24', 'r27', 'r28'] },
  // race4 bloc — west
  { id: 'r13', bloc: 'race4', col: 0, row: 2, adjacent: ['r03', 'r14', 'r15'] },
  { id: 'r14', bloc: 'race4', col: 0, row: 3, adjacent: ['r13', 'r15', 'r16', 'r17'] },
  { id: 'r15', bloc: 'race4', col: 1, row: 2, adjacent: ['r03', 'r04', 'r13', 'r14', 'r16', 'r26'] },
  { id: 'r16', bloc: 'race4', col: 1, row: 3, adjacent: ['r14', 'r15', 'r17', 'r18', 'r20', 'r26'] },
  // race5 bloc — south-west
  { id: 'r17', bloc: 'race5', col: 1, row: 4, adjacent: ['r14', 'r16', 'r18'] },
  { id: 'r18', bloc: 'race5', col: 2, row: 4, adjacent: ['r16', 'r17', 'r19', 'r20'] },
  { id: 'r19', bloc: 'race5', col: 3, row: 4, adjacent: ['r18', 'r20', 'r23', 'r28'] },
  { id: 'r20', bloc: 'race5', col: 2, row: 3, adjacent: ['r16', 'r18', 'r19', 'r26', 'r27', 'r28'] },
  // race6 bloc — south-east
  { id: 'r21', bloc: 'race6', col: 5, row: 3, adjacent: ['r11', 'r22', 'r24'] },
  { id: 'r22', bloc: 'race6', col: 5, row: 4, adjacent: ['r21', 'r23', 'r24'] },
  { id: 'r23', bloc: 'race6', col: 4, row: 4, adjacent: ['r19', 'r22', 'r24', 'r28'] },
  { id: 'r24', bloc: 'race6', col: 4, row: 3, adjacent: ['r11', 'r12', 'r21', 'r22', 'r23', 'r28'] },
  // contested — the centre, bordering every bloc
  { id: 'r25', bloc: CONTESTED, col: 2, row: 1, adjacent: ['r02', 'r04', 'r07', 'r08', 'r26', 'r27'] },
  { id: 'r26', bloc: CONTESTED, col: 2, row: 2, adjacent: ['r04', 'r15', 'r16', 'r20', 'r25', 'r27'] },
  { id: 'r27', bloc: CONTESTED, col: 3, row: 2, adjacent: ['r08', 'r12', 'r20', 'r25', 'r26', 'r28'] },
  { id: 'r28', bloc: CONTESTED, col: 3, row: 3, adjacent: ['r12', 'r19', 'r20', 'r23', 'r24', 'r27'] },
];

export interface BlocDefinition {
  readonly regions: readonly RegionId[];
  /**
   * The three regions the player holds when starting as this race. The
   * fourth region of the bloc (`holdout`) stays with the race itself, so a
   * full conquest from three starting regions is exactly 25 battles.
   */
  readonly starting: readonly RegionId[];
  readonly holdout: RegionId;
}

/** Each race's bloc. The holdout is the bloc's region facing the contested centre. */
export const BLOCS: Readonly<Record<BlocRaceId, BlocDefinition>> = {
  race1: { regions: ['r01', 'r02', 'r03', 'r04'], starting: ['r01', 'r02', 'r03'], holdout: 'r04' },
  race2: { regions: ['r05', 'r06', 'r07', 'r08'], starting: ['r05', 'r06', 'r07'], holdout: 'r08' },
  race3: { regions: ['r09', 'r10', 'r11', 'r12'], starting: ['r09', 'r10', 'r11'], holdout: 'r12' },
  race4: { regions: ['r13', 'r14', 'r15', 'r16'], starting: ['r13', 'r14', 'r15'], holdout: 'r16' },
  race5: { regions: ['r17', 'r18', 'r19', 'r20'], starting: ['r17', 'r18', 'r19'], holdout: 'r20' },
  race6: { regions: ['r21', 'r22', 'r23', 'r24'], starting: ['r21', 'r22', 'r23'], holdout: 'r24' },
};

export const CONTESTED_REGIONS: readonly RegionId[] = ['r25', 'r26', 'r27', 'r28'];

const BY_ID: ReadonlyMap<RegionId, RegionData> = new Map(REGIONS.map((r) => [r.id, r]));

export function region(id: RegionId): RegionData {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`unknown region "${id}"`);
  return r;
}

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && BY_ID.has(value as RegionId);
}

export function isContested(id: RegionId): boolean {
  return region(id).bloc === CONTESTED;
}

/** Neighbours of a region on an odd-r offset hex grid — the geometry the map draws. */
export function hexNeighbours(col: number, row: number): readonly [number, number][] {
  return row % 2 === 0
    ? [[col - 1, row], [col + 1, row], [col - 1, row - 1], [col, row - 1], [col - 1, row + 1], [col, row + 1]]
    : [[col - 1, row], [col + 1, row], [col, row - 1], [col + 1, row - 1], [col, row + 1], [col + 1, row + 1]];
}
