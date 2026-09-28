/**
 * Instructions text. Written from the original game's mechanics; each section
 * covers one thing a new player needs to win a battle. TO VERIFY against the
 * rules document once it is available in this project (see work order).
 *
 * No race or unit names here — those come from `names/displayNames.ts`.
 */
export type InstructionTopic = 'lanes' | 'spawning' | 'recharge' | 'territory' | 'charge' | 'winning';

export interface InstructionSection {
  topic: InstructionTopic;
  title: string;
  body: string;
}

export const INSTRUCTIONS: readonly InstructionSection[] = [
  {
    topic: 'lanes',
    title: 'Lanes',
    body:
      'The battlefield is split into horizontal lanes. Your army enters from the left edge and the enemy from the right. ' +
      'A unit stays in the lane it was sent down and fights whatever it meets there, so spread your forces across the lanes ' +
      'the enemy is pushing.',
  },
  {
    topic: 'spawning',
    title: 'Spawning units',
    body:
      'Pick a unit type from the rack at the bottom of the screen, then click a lane to send one down it. ' +
      'Turn on auto-send in Options to have the game send your chosen unit as soon as it is ready.',
  },
  {
    topic: 'recharge',
    title: 'Recharge',
    body:
      'Every unit type has its own recharge time. After you send one, its slot on the rack refills before you can send ' +
      'that type again. Stronger units take longer to recharge, so keep cheap units flowing while the heavy ones are ' +
      'still recharging.',
  },
  {
    topic: 'territory',
    title: 'The territory bar',
    body:
      'The bar along the top shows how much of the field each side holds. When your units push past the front line the ' +
      'bar moves towards the enemy; when theirs push past yours it moves towards you.',
  },
  {
    topic: 'charge',
    title: 'The charge meter',
    body:
      'The charge meter fills slowly during the battle. When it is full, press Charge to order every unit on the field ' +
      'forward at once. Save it for the moment a lane is about to break.',
  },
  {
    topic: 'winning',
    title: 'Winning and losing',
    body:
      'You win the battle when the territory bar reaches the enemy end of the field. You lose it when the bar reaches ' +
      'your end. Winning a campaign battle claims that region on the map and earns gold to spend in the shop.',
  },
];
