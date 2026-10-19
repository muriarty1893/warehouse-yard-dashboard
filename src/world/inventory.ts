import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { devYard } from '../config/devYard';
import { hashString, seedDocuments } from '../domain/seed';
import type { Cargo, CargoEvent, CargoEventKind, SourceDocument, Spot } from '../domain/types';
import { clock } from '../sim/clock';
import { demoCargo, type FillLevel } from './demo';
import { checkSpot, hasOnTop, locationOf } from './placement';
import { fmtClock } from './time';

/**
 * Cargo records, their source documents and history: the part of the World
 * State that people edit by hand. Saved in this browser (localStorage) so
 * manual entries survive a reload; "Reset demo data" brings the seed back.
 */

export const CURRENT_USER = 'Deniz Kaya';

/** Saved data is only reused when the yard layout is unchanged. */
const LAYOUT = hashString(JSON.stringify([devYard.storage, devYard.bays, devYard.fixtures, devYard.buildings]));

export type Result = { ok: true } | { ok: false; reason: string };
export type CargoInput = Omit<Cargo, 'x' | 'y' | 'yaw' | 'on' | 'areaId' | 'pinned' | 'source'>;
export type CargoPatch = Partial<Pick<Cargo, 'description' | 'destination' | 'weightKg' | 'dims' | 'type' | 'look'>>;
export type DocumentInput = Omit<SourceDocument, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'source'> & { id?: string };

interface Saved {
  layout: number;
  /** Simulated day and its workload (how full the storage areas are). */
  day: number;
  fill: FillLevel;
  cargo: Cargo[];
  documents: SourceDocument[];
  events: CargoEvent[];
  cargoSerial: number;
  docSerial: number;
}

interface InventoryState extends Saved {
  nextCargoId: () => string;
  register: (input: CargoInput, spot: Spot, doc?: DocumentInput) => Result;
  update: (id: string, patch: CargoPatch) => void;
  move: (id: string, spot: Spot) => Result;
  /** New simulated day: fresh demo cargo at this workload; hand-made records stay. */
  newDay: (fill?: FillLevel) => void;
  release: (id: string) => Result;
  saveDocument: (input: DocumentInput) => SourceDocument;
  removeDocument: (id: string) => void;
  reset: () => void;
}

const serialOf = (cargo: Cargo[]) => Math.max(18400, ...cargo.map((c) => Number(c.id.match(/^CARGO-(\d+)$/)?.[1] ?? 0)));

function initial(fill: FillLevel = 'normal', day = 1): Saved {
  const cargo = demoCargo(fill, day);
  const documents = seedDocuments(cargo);
  return { layout: LAYOUT, day, fill, cargo, documents, events: [], cargoSerial: serialOf(cargo), docSerial: 1001 + cargo.length };
}

let eventSeq = 0;
function event(cargoId: string, kind: CargoEventKind, text: string): CargoEvent {
  eventSeq += 1;
  return { id: `EV-${Date.now().toString(36)}-${eventSeq}`, cargoId, kind, text, at: Date.now(), yardTime: fmtClock(clock.t) };
}

const DOC_LABEL: Record<SourceDocument['type'], string> = {
  bill_of_lading: 'Bill of lading',
  cmr: 'CMR waybill',
  delivery_note: 'Delivery note',
  invoice: 'Invoice',
  packing_list: 'Packing list',
  customs: 'Customs declaration',
  other: 'Document',
};

/** Save failures (quota, private mode) without feeding back into the persisted store. */
export const useSaveStatus = create<{ error: string | null }>(() => ({ error: null }));

const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      if (useSaveStatus.getState().error) useSaveStatus.setState({ error: null });
    } catch {
      useSaveStatus.setState({ error: 'Browser storage is full or blocked — recent changes are not saved. Remove document photos or reset the demo data.' });
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
  },
};

export const useInventory = create<InventoryState>()(
  persist(
    (set, get) => ({
      ...initial(),

      nextCargoId: () => `CARGO-${get().cargoSerial + 1}`,

      register: (input, spot, doc) => {
        const s = get();
        if (s.cargo.some((c) => c.id === input.id)) return { ok: false, reason: `${input.id} already exists` };
        const check = checkSpot(s.cargo, input, spot);
        if (!check.ok) return { ok: false, reason: check.reason ?? 'Cannot place here' };
        const item: Cargo = { ...input, x: check.x, y: check.y, yaw: check.yaw, on: check.on, areaId: check.areaId, source: 'manual' };
        const serial = Number(input.id.match(/^CARGO-(\d+)$/)?.[1] ?? 0);
        set({
          cargo: [...s.cargo, item],
          cargoSerial: Math.max(s.cargoSerial, serial),
          events: [...s.events, event(item.id, 'registered', `Registered at ${locationOf(item)}${item.on ? ` on ${item.on}` : ''} by ${CURRENT_USER}`)],
        });
        if (doc) get().saveDocument({ ...doc, cargoId: item.id });
        return { ok: true };
      },

      update: (id, patch) => {
        const s = get();
        const before = s.cargo.find((c) => c.id === id);
        if (!before) return;
        const changed = (Object.keys(patch) as (keyof CargoPatch)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
        if (!changed.length) return;
        set({
          cargo: s.cargo.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          events: [...s.events, event(id, 'edited', `Edited ${changed.join(', ').replace('weightKg', 'weight').replace('dims', 'dimensions')}`)],
        });
      },

      move: (id, spot) => {
        const s = get();
        const item = s.cargo.find((c) => c.id === id);
        if (!item) return { ok: false, reason: 'Unknown cargo' };
        if (hasOnTop(s.cargo, id)) return { ok: false, reason: 'Move the unit on top first' };
        const check = checkSpot(s.cargo, item, spot);
        if (!check.ok) return { ok: false, reason: check.reason ?? 'Cannot place here' };
        const moved: Cargo = { ...item, x: check.x, y: check.y, yaw: check.yaw, on: check.on, areaId: check.areaId };
        set({
          cargo: s.cargo.map((c) => (c.id === id ? moved : c)),
          events: [...s.events, event(id, 'moved', `Moved ${locationOf(item)} → ${locationOf(moved)}${moved.on ? ` on ${moved.on}` : ''}`)],
        });
        return { ok: true };
      },

      release: (id) => {
        const s = get();
        const item = s.cargo.find((c) => c.id === id);
        if (!item) return { ok: false, reason: 'Unknown cargo' };
        if (hasOnTop(s.cargo, id)) return { ok: false, reason: 'Release the unit on top first' };
        set({
          cargo: s.cargo.filter((c) => c.id !== id),
          events: [...s.events, event(id, 'released', `Released from ${locationOf(item)} (left the yard)`)],
        });
        return { ok: true };
      },

      newDay: (fill) => {
        const s = get();
        const level = fill ?? s.fill;
        // Keep everything people touched (and whatever it stands on).
        const touched = new Set([...s.events.map((e) => e.cargoId), ...s.documents.filter((d) => d.source === 'manual').map((d) => d.cargoId)]);
        const index = new Map(s.cargo.map((c) => [c.id, c]));
        const keep = new Set<string>();
        for (const c of s.cargo) {
          if (c.source !== 'manual' && !touched.has(c.id)) continue;
          let cur: Cargo | undefined = c;
          while (cur && !keep.has(cur.id)) {
            keep.add(cur.id);
            cur = cur.on ? index.get(cur.on) : undefined;
          }
        }
        const kept = s.cargo.filter((c) => keep.has(c.id));
        const day = s.day + (fill && fill !== s.fill ? 0 : 1);
        const cargo = demoCargo(level, day, kept);
        const fresh = cargo.filter((c) => !keep.has(c.id));
        const documents = [...s.documents.filter((d) => keep.has(d.cargoId) || !index.has(d.cargoId)), ...seedDocuments(fresh).map((d, i) => ({ ...d, id: `DOC-${String(s.docSerial + 1 + i).padStart(5, '0')}` }))];
        set({ day, fill: level, cargo, documents, cargoSerial: Math.max(s.cargoSerial, serialOf(cargo)), docSerial: s.docSerial + fresh.length + 1 });
      },

      saveDocument: (input) => {
        const s = get();
        const now = Date.now();
        const existing = input.id ? s.documents.find((d) => d.id === input.id) : undefined;
        if (existing) {
          const doc: SourceDocument = { ...existing, ...input, id: existing.id, updatedAt: now };
          const confirmed = existing.status === 'draft' && doc.status === 'confirmed';
          set({
            documents: s.documents.map((d) => (d.id === doc.id ? doc : d)),
            events: [...s.events, event(doc.cargoId, 'document', `${confirmed ? 'Confirmed' : 'Updated'} ${DOC_LABEL[doc.type]} ${doc.number}`)],
          });
          return doc;
        }
        const docSerial = s.docSerial + 1;
        const doc: SourceDocument = { ...input, id: `DOC-${String(docSerial).padStart(5, '0')}`, source: 'manual', createdBy: CURRENT_USER, createdAt: now, updatedAt: now };
        set({
          docSerial,
          documents: [...s.documents, doc],
          events: [...s.events, event(doc.cargoId, 'document', `Added ${DOC_LABEL[doc.type]} ${doc.number}${doc.status === 'draft' ? ' (draft)' : ''}`)],
        });
        return doc;
      },

      removeDocument: (id) => {
        const s = get();
        const doc = s.documents.find((d) => d.id === id);
        if (!doc) return;
        set({
          documents: s.documents.filter((d) => d.id !== id),
          events: [...s.events, event(doc.cargoId, 'document', `Removed ${DOC_LABEL[doc.type]} ${doc.number}`)],
        });
      },

      reset: () => set(initial(get().fill)),
    }),
    {
      name: 'docktor.inventory',
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): Saved => ({ layout: s.layout, day: s.day, fill: s.fill, cargo: s.cargo, documents: s.documents, events: s.events, cargoSerial: s.cargoSerial, docSerial: s.docSerial }),
      merge: (saved, current) => {
        const data = saved as Partial<Saved> | undefined;
        if (!data || data.layout !== LAYOUT || !Array.isArray(data.cargo)) return current;
        return { ...current, ...data };
      },
    },
  ),
);

export { DOC_LABEL };
export const docsFor = (documents: SourceDocument[], cargoId: string) => documents.filter((d) => d.cargoId === cargoId);
/** Cargo ids with at least one confirmed document (these carry a printed label). */
export const labelledCargo = (documents: SourceDocument[]) => new Set(documents.filter((d) => d.status === 'confirmed').map((d) => d.cargoId));
