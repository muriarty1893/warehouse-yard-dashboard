import { setCampaignOrder } from './progress';
import type { HintKey, Recipe } from './types';

/**
 * The campaign's nine shifts (spec §2). Each teaches one thing; mechanics
 * accumulate. Star targets come from the test bots (`npm run balance`).
 */
export const RECIPES: Recipe[] = [
  {
    id: 'opening-gate',
    no: 1,
    name: 'Opening the gate',
    teaches: 'Bays and the gate waiting fee',
    briefing: {
      newTitle: 'New today: inbound trucks',
      newText: 'Trucks arrive at the gate with cargo. Click a truck, then send it to a free bay. The crew unloads it into storage.',
      rule: 'Every waiting truck gets 5 free minutes at the gate. After that the gate waiting fee is €12 a minute.',
    },
    seed: 101,
    bays: ['L1', 'L2'],
    forklifts: ['FL-01', 'FL-02', 'FL-03'],
    fill: 'quiet',
    mechanics: [],
    trucks: [
      { id: 'TRUCK-201', kind: 'inbound', carrier: 'cargoviva', arriveMin: 10, plannedArriveMin: 10, units: 5 },
      { id: 'TRUCK-202', kind: 'inbound', carrier: 'nordline', arriveMin: 40, plannedArriveMin: 40, units: 4 },
      { id: 'TRUCK-203', kind: 'inbound', carrier: 'bluepeak', arriveMin: 90, plannedArriveMin: 90, units: 6 },
      { id: 'TRUCK-204', kind: 'inbound', carrier: 'docktor', arriveMin: 180, plannedArriveMin: 180, units: 5 },
    ],
    incidents: [],
    budget: 0,
    targets: [0, 0, 0],
  },
];

export function recipeById(id: string): Recipe {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`No shift ${id}`);
  return r;
}

/** First-time hints, one per mechanic (spec §2). */
export const HINTS: Record<HintKey, { title: string; text: string; anchor: 'timeline' | 'crew' | 'papers' | 'spend' | 'selection' }> = {
  basics: { title: 'Trucks at the gate', text: 'Trucks wait at the gate. Click one, then pick a free bay. The first 5 minutes are free.', anchor: 'timeline' },
  storage: { title: 'Where it goes', text: 'Pick a storage area for a docked truck’s cargo. Covered areas keep cartons dry; areas near the bays make loading faster later.', anchor: 'selection' },
  outbound: { title: 'Outbound trucks', text: 'This truck collects cargo. Give it a bay, press Plan load, confirm the plan, and Dispatch once it is loaded — before its deadline.', anchor: 'selection' },
  papers: { title: 'Missing papers', text: 'Some units have papers missing. The clerk fixes them one by one; reorder the list, or rush one for €40. Units must not leave without papers.', anchor: 'papers' },
  queue: { title: 'The crew queue', text: 'The crew works from the top of this list. Move jobs up or down, or mark a truck urgent to put it first.', anchor: 'crew' },
  tempForklift: { title: 'A forklift broke down', text: 'You can rent a temp forklift by the hour. It costs money, but so do late trucks.', anchor: 'spend' },
  rain: { title: 'Rain is coming', text: 'Cartons and bags in the open yard get damaged in the rain. Move them under cover before it starts.', anchor: 'timeline' },
  bayClosed: { title: 'A bay is closed', text: 'One bay can’t take trucks for a while. Plan around it.', anchor: 'timeline' },
  rushOrder: { title: 'Rush order', text: 'A truck nobody expected, paying double, with a tight deadline. Taking it may make something else late.', anchor: 'timeline' },
  overtime: { title: 'Overtime', text: 'One hour left. Overtime keeps the yard open 30 more minutes for €400.', anchor: 'spend' },
};

setCampaignOrder(RECIPES.map((r) => r.id));
