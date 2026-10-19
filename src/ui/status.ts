import type { BayStatus, ForkliftStatus, TruckStatus } from '../world/snapshot';
import type { Tone } from './kit';

export const TRUCK_STATUS: Record<TruckStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Scheduled', tone: 'gray' },
  'en-route': { label: 'En route', tone: 'blue' },
  'at-gate': { label: 'At gate', tone: 'amber' },
  docking: { label: 'Docking', tone: 'violet' },
  loading: { label: 'Loading', tone: 'green' },
  unloading: { label: 'Unloading', tone: 'green' },
  departing: { label: 'Departing', tone: 'blue' },
  departed: { label: 'Departed', tone: 'gray' },
  waiting: { label: 'Waiting', tone: 'amber' },
  dropped: { label: 'Dropped', tone: 'gray' },
};

export const FORKLIFT_STATUS: Record<ForkliftStatus, { label: string; tone: Tone }> = {
  picking: { label: 'Picking', tone: 'blue' },
  carrying: { label: 'Carrying', tone: 'blue' },
  loading: { label: 'Loading truck', tone: 'green' },
  returning: { label: 'Returning', tone: 'gray' },
  charging: { label: 'Charging', tone: 'amber' },
  idle: { label: 'Idle', tone: 'gray' },
};

export const BAY_STATUS: Record<BayStatus, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'gray' },
  docking: { label: 'Docking', tone: 'violet' },
  loading: { label: 'Loading', tone: 'green' },
  unloading: { label: 'Unloading', tone: 'green' },
  waiting: { label: 'Occupied', tone: 'amber' },
  dropped: { label: 'Trailer', tone: 'gray' },
};

export const batteryTone = (pct: number): Tone => (pct < 30 ? 'red' : pct < 50 ? 'amber' : 'green');

export const CARRIER_COLORS: Record<string, string> = {
  Docktor: '#2f5ff0',
  Nordline: '#16a39b',
  Cargoviva: '#f07d2a',
  Bluepeak: '#1d2b5a',
};
