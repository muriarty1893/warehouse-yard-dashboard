import type { Cargo, CargoLook, CargoType, Dimensions, DocumentType, SourceDocument } from './types';

/**
 * Deterministic sample data for the dev yard (spec §44): what demo cargo is
 * made of, and its paperwork. Where it goes is decided by world/demo.ts.
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

/** Can something be stacked on top of this look? */
export const isStackable = (look: CargoLook) => look === 'container' || look === 'group-cartons' || LOOKS[look].stackable;

/** Type and typical size/weight of a new cargo unit of this look (forms prefill these). */
export function lookDefaults(look: Exclude<CargoLook, 'container' | 'group-cartons'>) {
  const mid = () => 0.5;
  const spec = LOOKS[look];
  return { type: spec.type, dims: spec.dims(mid), weightKg: Math.round(spec.weight(mid) / 10) * 10 };
}

export type UnitLook = Exclude<CargoLook, 'container'>;

/** A cargo unit's record without its location: what the goods are. */
export function makeUnit(rng: Rng, id: string, look: UnitLook, opts: { destination?: string; description?: string } = {}): Omit<Cargo, 'x' | 'y' | 'yaw' | 'on' | 'areaId'> {
  const destination = opts.destination ?? pick(rng, DESTINATIONS);
  if (look === 'group-cartons') {
    return { id, type: 'group', look, description: opts.description ?? 'Box group', destination, weightKg: 800, dims: { l: 1.7, w: 1.5, h: 0.42 } };
  }
  const spec = LOOKS[look];
  return { id, type: spec.type, look, description: opts.description ?? spec.describe(rng), destination, weightKg: spec.weight(rng), dims: spec.dims(rng) };
}

export { DESTINATIONS, pick, weighted };
export type { Rng };

// ---------------------------------------------------------------------------
// Demo source documents: most cargo has its paperwork entered, some does not
// (so the "missing documents" view has something to show).

const SHIPPERS = ['Ege Seramik A.Ş.', 'Marmara Elektrik', 'Konya Tarım Ltd.', 'Bursa Tekstil A.Ş.', 'Anadolu Ambalaj', 'Kapadokya Mobilya', 'Akdeniz Gıda A.Ş.', 'Trakya Kablo San.'];
const CONSIGNEES = ['Anadolu Market', 'Karadeniz Lojistik', 'Başkent Yapı', 'Delta Perakende', 'Orion Makina', 'Yıldız Depoculuk'];
const DOC_MIX: Partial<Record<DocumentType, number>> = { delivery_note: 0.4, cmr: 0.25, invoice: 0.2, bill_of_lading: 0.1, packing_list: 0.05 };
const CURRENCIES = ['TRY', 'EUR', 'USD'];

export function documentNumber(type: DocumentType, n: number): string {
  const pad = (k: number) => String(n % 10 ** k).padStart(k, '0');
  switch (type) {
    case 'bill_of_lading':
      return `BL-26-${pad(5)}`;
    case 'cmr':
      return `CMR ${pad(7)}`;
    case 'delivery_note':
      return `DN-2026-${pad(6)}`;
    case 'invoice':
      return `INV-2026-${pad(5)}`;
    case 'packing_list':
      return `PL-${pad(5)}`;
    case 'customs':
      return `TR-26-34-EX-${pad(7)}`;
    default:
      return `DOC-${pad(6)}`;
  }
}

export function seedDocuments(cargo: Cargo[], now = Date.UTC(2026, 9, 19, 8, 30)): SourceDocument[] {
  const rng = mulberry32(77031);
  const docs: SourceDocument[] = [];
  cargo.forEach((c, i) => {
    // CARGO-18492 is the spec's worked example: keep it documented.
    if (c.id !== 'CARGO-18492' && rng() < 0.22) return;
    const type = weighted(rng, DOC_MIX);
    const day = 12 + Math.floor(rng() * 8);
    const pieces = c.type === 'group' ? 20 : c.look === 'cartons' ? Math.round(c.dims.h / 0.4) * 4 : 1;
    docs.push({
      id: `DOC-${String(1001 + i).padStart(5, '0')}`,
      cargoId: c.id,
      type,
      number: documentNumber(type, Math.floor(rng() * 1e7)),
      issuedOn: `2026-10-${String(day).padStart(2, '0')}`,
      shipper: pick(rng, SHIPPERS),
      consignee: `${pick(rng, CONSIGNEES)} · ${c.destination}`,
      origin: pick(rng, DESTINATIONS),
      destination: c.destination,
      pieces,
      grossKg: c.weightKg,
      value: type === 'invoice' ? Math.round(2000 + rng() * 48000) : undefined,
      currency: type === 'invoice' ? pick(rng, CURRENCIES) : undefined,
      items: `${pieces} × ${c.description}`,
      source: 'demo',
      status: rng() < 0.86 ? 'confirmed' : 'draft',
      createdBy: 'Deniz Kaya',
      createdAt: now - Math.floor(rng() * 6 * 86400e3),
      updatedAt: now,
    });
  });
  return docs;
}
