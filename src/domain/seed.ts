import type { Cargo, CargoLook, CargoType, Dimensions, StoragePosition, YardConfig } from './types';
import { allPositions } from './yard';

/**
 * Deterministic sample World State for the dev yard (spec §44): simulated
 * cargo sitting in storage positions. Same seed → same yard every reload.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Rng = () => number;
const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
function weighted<T extends string>(rng: Rng, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1][0];
}

const DESTINATIONS = ['Ankara', 'İzmir', 'Bursa', 'Konya', 'Adana', 'Antalya', 'Kayseri', 'Samsun', 'Eskişehir', 'Gaziantep', 'Mersin', 'Trabzon'];

const PALLET_GOODS = ['LED Panel 60×60', 'Office Chair', 'Cardboard Box (M)', 'Safety Helmet', 'Ceramic Tiles', 'Olive Oil 5 L', 'Kitchen Appliances', 'Textile Bales', 'Paint 20 L', 'Spare Parts'];
const WRAP_GOODS = ['Nitrile Gloves', 'Plastic Container', 'Detergent 4 L', 'PET Preforms', 'Packaging Film'];
const COLD_GOODS = ['Frozen Peas 10 kg', 'Spring Water 24-pack', 'Dairy Crates', 'Ice Cream Tubs'];

export const CONTAINER_LIVERIES = [
  { brand: 'MARLIN', color: '#17a99a' },
  { brand: 'ORIENTA', color: '#e8762b' },
  { brand: 'KÖRFEZ LINE', color: '#2f5ff0' },
  { brand: 'NOVA', color: '#8d97ad' },
  { brand: 'ANADOLU', color: '#d64b4b' },
  { brand: 'DOCKTOR', color: '#eef1f7' },
] as const;

interface LookSpec {
  type: CargoType;
  dims: (rng: Rng) => Dimensions;
  describe: (rng: Rng) => string;
  weight: (rng: Rng) => number;
  stackable: boolean;
}

const LOOKS: Record<Exclude<CargoLook, 'container' | 'group-cartons'>, LookSpec> = {
  cartons: {
    type: 'pallet',
    dims: (rng) => ({ l: 1.2, w: 0.8, h: 0.144 + 0.4 * (rng() < 0.55 ? 2 : 3) }),
    describe: (rng) => pick(rng, PALLET_GOODS),
    weight: (rng) => Math.round(250 + rng() * 650),
    stackable: true,
  },
  'wrap-blue': {
    type: 'pallet',
    dims: (rng) => ({ l: 1.2, w: 0.8, h: 0.144 + 0.42 * (rng() < 0.5 ? 2 : 3) }),
    describe: (rng) => pick(rng, WRAP_GOODS),
    weight: (rng) => Math.round(200 + rng() * 500),
    stackable: true,
  },
  'wrap-white': {
    type: 'pallet',
    dims: () => ({ l: 1.2, w: 0.8, h: 1.25 }),
    describe: (rng) => pick(rng, COLD_GOODS),
    weight: (rng) => Math.round(400 + rng() * 500),
    stackable: true,
  },
  crate: {
    type: 'crate',
    dims: (rng) => ({ l: 1.5 + rng() * 0.2, w: 1.2, h: 0.9 + rng() * 0.4 }),
    describe: (rng) => pick(rng, ['Machine Parts Crate', 'Export Crate', 'Gearbox Crate']),
    weight: (rng) => Math.round(500 + rng() * 900),
    stackable: true,
  },
  drum: {
    type: 'roll',
    dims: () => ({ l: 1.5, w: 0.95, h: 1.5 }),
    describe: (rng) => pick(rng, ['Cable Drum · Cu 3×95', 'Cable Drum · Fiber', 'Steel Wire Reel']),
    weight: (rng) => Math.round(600 + rng() * 800),
    stackable: false,
  },
  bag: {
    type: 'raw_material',
    dims: () => ({ l: 1.1, w: 1.1, h: 1.3 }),
    describe: (rng) => pick(rng, ['Bulk Bag · PP Granules', 'Bulk Bag · Cement', 'Bulk Bag · Fertilizer']),
    weight: (rng) => Math.round(800 + rng() * 400),
    stackable: true,
  },
  machine: {
    type: 'machine',
    dims: () => ({ l: 1.7, w: 1.4, h: 1.55 }),
    describe: (rng) => pick(rng, ['CNC Lathe', 'Air Compressor', 'Hydraulic Press', 'Generator Set']),
    weight: (rng) => Math.round(1400 + rng() * 2200),
    stackable: false,
  },
  pipes: {
    type: 'large_freight',
    dims: () => ({ l: 1.75, w: 1.3, h: 0.95 }),
    describe: (rng) => pick(rng, ['Steel Pipes Ø200', 'Galvanized Tubes', 'HDPE Pipe Bundle']),
    weight: (rng) => Math.round(900 + rng() * 1200),
    stackable: false,
  },
};

type FixedSlot = { look: CargoLook; levels?: number; id?: string; pinned?: boolean; description?: string };

/** Slots with fixed content: spec examples + slots that forklifts work. */
const FIXED: Record<string, FixedSlot | 'empty'> = {
  B17: { look: 'cartons', id: 'CARGO-18492', pinned: true, description: 'Pallet · Ankara' },
  C05: { look: 'group-cartons', id: 'GROUP-0042', pinned: true, description: '20 identical boxes' },
  B16: { look: 'cartons', levels: 1 },
  A05: { look: 'bag', levels: 1 },
  A10: { look: 'drum', pinned: true },
  B08: { look: 'wrap-blue', levels: 2, pinned: true },
};

/** Open storage gets weatherproof goods; the covered hold spaces get palletized goods. */
const ZONE_MIX: Record<string, Partial<Record<CargoLook, number>>> = {
  A: { crate: 0.3, drum: 0.25, pipes: 0.2, machine: 0.1, bag: 0.15 },
  B: { cartons: 0.5, 'wrap-blue': 0.3, 'wrap-white': 0.2 },
  C: { cartons: 0.35, 'wrap-blue': 0.25, crate: 0.2, bag: 0.2 },
};

export function seedCargo(yard: YardConfig): Cargo[] {
  const rng = mulberry32(18492);
  const cargo: Cargo[] = [];
  let serial = 18400;
  const nextId = () => {
    serial += 1;
    if (serial === 18492) serial += 1;
    return `CARGO-${serial}`;
  };

  const place = (pos: StoragePosition, look: CargoLook, levels: number, fixed?: FixedSlot) => {
    for (let level = 0; level < levels; level++) {
      const id = level === 0 && fixed?.id ? fixed.id : nextId();
      const pinned = !!fixed?.pinned && level === levels - 1;
      cargo.push(makeCargo(rng, id, look, pos, level, pinned, fixed?.description));
    }
  };

  for (const pos of allPositions(yard)) {
    const fixed = FIXED[pos.id];
    if (fixed === 'empty') continue;
    if (fixed) {
      place(pos, fixed.look, fixed.levels ?? 1, fixed);
      continue;
    }
    const zone = yard.zones.find((z) => z.id === pos.zoneId);
    if (zone?.kind === 'container') {
      if (rng() < 0.15) continue;
      place(pos, 'container', rng() < 0.4 ? 2 : 1);
      continue;
    }
    const mix = ZONE_MIX[pos.zoneId];
    if (!mix || rng() > 0.78) continue;
    const look = weighted(rng, mix);
    const spec = LOOKS[look as keyof typeof LOOKS];
    const levels = spec?.stackable && rng() < 0.38 ? Math.min(2, pos.maxStack) : 1;
    place(pos, look, levels);
  }
  return cargo;
}

function makeCargo(
  rng: Rng,
  id: string,
  look: CargoLook,
  pos: StoragePosition,
  stackLevel: number,
  pinned: boolean,
  description?: string,
): Cargo {
  const destination = id === 'CARGO-18492' ? 'Ankara' : pick(rng, DESTINATIONS);
  if (look === 'container') {
    const livery = pick(rng, CONTAINER_LIVERIES);
    // Size is per position so a stack never puts a 40′ on top of a 20′.
    const fortyFoot = hashString(pos.id) % 4 !== 0;
    return {
      id,
      type: 'container',
      look,
      description: `${fortyFoot ? '40′' : '20′'} Container · ${livery.brand}`,
      destination,
      weightKg: Math.round((fortyFoot ? 9000 : 5000) + rng() * 14000),
      dims: { l: 2.44, w: fortyFoot ? 12.19 : 6.06, h: 2.59 },
      positionId: pos.id,
      stackLevel,
      color: livery.color,
      brand: livery.brand,
      pinned,
    };
  }
  if (look === 'group-cartons') {
    return {
      id,
      type: 'group',
      look,
      description: description ?? 'Box group',
      destination: 'Ankara',
      weightKg: 800,
      dims: { l: 1.7, w: 1.5, h: 0.42 },
      positionId: pos.id,
      stackLevel,
      pinned,
    };
  }
  const spec = LOOKS[look];
  const cargo: Cargo = {
    id,
    type: spec.type,
    look,
    description: description ?? spec.describe(rng),
    destination,
    weightKg: spec.weight(rng),
    dims: spec.dims(rng),
    positionId: pos.id,
    stackLevel,
    pinned,
  };
  if (id === 'CARGO-18492') {
    // Spec §8 example record.
    cargo.weightKg = 720;
    cargo.dims = { l: 1.2, w: 0.8, h: 1.0 };
  }
  return cargo;
}
