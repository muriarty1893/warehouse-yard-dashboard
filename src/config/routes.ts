/**
 * Default delivery routes of the plannable trucks (spec §1.1), drop order
 * first to last. Managers can change them per truck in the load planner.
 */

/** Trucks in the order they are planned; overflow moves down this queue. */
export const PLAN_QUEUE = ['TRUCK-102', 'TRUCK-109', 'TRUCK-110'];

export const DEFAULT_ROUTES: Record<string, string[]> = {
  'TRUCK-102': ['Eskişehir', 'Ankara', 'Kayseri'],
  'TRUCK-109': ['Konya', 'Adana', 'Mersin', 'Gaziantep'],
  // Overlaps TRUCK-102, so its overflow has somewhere to go.
  'TRUCK-110': ['Ankara', 'Kayseri', 'Samsun', 'Trabzon'],
};
