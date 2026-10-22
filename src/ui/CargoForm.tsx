import { MapPin, Package, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DESTINATIONS, lookDefaults } from '../domain/seed';
import type { CargoLook, DocumentType } from '../domain/types';
import { useUi, type RegisterDraft } from '../state/ui';
import { useInventory, type CargoInput, type DocumentInput } from '../world/inventory';
import { recommendSpot } from '../world/placement';
import { placeAt, startRegisterPlacement } from './actions';
import { Modal } from './Dialog';
import { CARGO_KINDS, DOC_TYPES, todayIso } from './documents';
import { Button, Field, inputClass, Segmented, Toggle } from './kit';

/**
 * Register a cargo unit by hand (spec §37: manager confirms ID, type,
 * destination, weight, dimensions), optionally with its source document, then
 * put it down on the map — or edit an existing unit's details.
 */

type Look = (typeof CARGO_KINDS)[number]['look'];

interface Form {
  id: string;
  look: Look;
  description: string;
  destination: string;
  weightKg: string;
  l: string;
  w: string;
  h: string;
  fragile: boolean;
  withDoc: boolean;
  docType: DocumentType;
  docNumber: string;
  docDate: string;
  shipper: string;
  consignee: string;
  docStatus: 'draft' | 'confirmed';
}

const cm = (m: number) => String(Math.round(m * 100));

function fromDefaults(id: string, look: Look): Pick<Form, 'id' | 'look' | 'weightKg' | 'l' | 'w' | 'h'> {
  const d = lookDefaults(look);
  return { id, look, weightKg: String(d.weightKg), l: cm(d.dims.l), w: cm(d.dims.w), h: cm(d.dims.h) };
}

export function CargoForm({ cargoId, draft }: { cargoId?: string; draft?: RegisterDraft }) {
  const close = () => useUi.getState().openDialog(null);
  const notify = useUi((s) => s.notify);
  const inv = useInventory();
  const existing = cargoId ? inv.cargo.find((c) => c.id === cargoId) : undefined;
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState<Form>(() => {
    const src = existing ?? draft?.input;
    const doc = draft?.doc;
    const look = (src?.look && src.look !== 'container' && src.look !== 'group-cartons' ? src.look : 'cartons') as Look;
    const base = src
      ? { id: src.id, look, weightKg: String(src.weightKg), l: cm(src.dims.l), w: cm(src.dims.w), h: cm(src.dims.h) }
      : fromDefaults(inv.nextCargoId(), 'cartons');
    return {
      ...base,
      description: src?.description ?? '',
      destination: src?.destination ?? 'Ankara',
      fragile: !!src?.fragile,
      withDoc: draft ? !!doc : !existing,
      docType: doc?.type ?? 'delivery_note',
      docNumber: doc?.number ?? '',
      docDate: doc?.issuedOn ?? todayIso(),
      shipper: doc?.shipper ?? '',
      consignee: doc?.consignee ?? '',
      docStatus: doc?.status ?? 'confirmed',
    };
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const dims = { l: Number(f.l) / 100, w: Number(f.w) / 100, h: Number(f.h) / 100 };
  const valid = dims.l > 0.2 && dims.w > 0.2 && dims.h > 0.1 && dims.l <= 2.5 && dims.w <= 2.5 && dims.h <= 3;
  const recommended = useMemo(() => (valid && !existing ? recommendSpot(inv.cargo, { look: f.look as CargoLook, dims }) : null), [valid, existing, inv.cargo, f.look, dims.l, dims.w, dims.h]);

  const build = (): RegisterDraft | null => {
    if (!f.id.trim()) return setError('Give the unit an ID.'), null;
    if (!existing && inv.cargo.some((c) => c.id === f.id.trim())) return setError(`${f.id} already exists in the yard.`), null;
    if (!f.description.trim()) return setError('Describe the goods (as on the document).'), null;
    if (!valid) return setError('Check the dimensions (max 250 × 250 × 300 cm).'), null;
    if (f.withDoc && !f.docNumber.trim()) return setError('Enter the document number, or untick "Add source document".'), null;
    const lookType = lookDefaults(f.look).type;
    const input: CargoInput = { id: f.id.trim(), type: lookType, look: f.look, description: f.description.trim(), destination: f.destination.trim() || '—', weightKg: Math.max(0, Number(f.weightKg) || 0), dims, ...(f.fragile ? { fragile: true } : {}) };
    const doc: DocumentInput | undefined = f.withDoc
      ? {
          cargoId: input.id,
          type: f.docType,
          number: f.docNumber.trim(),
          issuedOn: f.docDate,
          shipper: f.shipper.trim(),
          consignee: f.consignee.trim(),
          destination: input.destination,
          grossKg: input.weightKg,
          pieces: 1,
          items: `1 × ${input.description}`,
          status: f.docStatus,
        }
      : undefined;
    return { input, doc };
  };

  const saveEdit = () => {
    const d = build();
    if (!d || !existing) return;
    inv.update(existing.id, { description: d.input.description, destination: d.input.destination, weightKg: d.input.weightKg, dims: d.input.dims, look: d.input.look, type: d.input.type, fragile: f.fragile });
    notify(`${existing.id} updated`);
    close();
  };

  return (
    <Modal title={existing ? `Edit ${existing.id}` : 'Register cargo'} subtitle={existing ? existing.description : 'From the bill / delivery note · manual entry'} onClose={close} width={600}>
      <form
        className="space-y-4 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (existing) saveEdit();
          else {
            const d = build();
            if (d) startRegisterPlacement(d);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cargo ID" hint={existing ? 'fixed' : 'internal label'}>
            <input className={inputClass} value={f.id} disabled={!!existing} onChange={(e) => set('id', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Kind">
            <select
              className={inputClass}
              value={f.look}
              onChange={(e) => {
                const look = e.target.value as Look;
                setF((cur) => ({ ...cur, ...fromDefaults(cur.id, look) }));
              }}
            >
              {CARGO_KINDS.map((k) => (
                <option key={k.look} value={k.look}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Goods" className="col-span-2">
            <input autoFocus={!existing} className={inputClass} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Ceramic tiles 60×60 · 48 boxes" />
          </Field>
          <Field label="Destination">
            <input list="destinations" className={inputClass} value={f.destination} onChange={(e) => set('destination', e.target.value)} />
            <datalist id="destinations">
              {DESTINATIONS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="Weight" hint="kg">
            <input inputMode="decimal" className={inputClass} value={f.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
          </Field>
        </div>
        <Field label="Dimensions" hint="L × W × H, cm">
          <div className="grid grid-cols-3 gap-2">
            {(['l', 'w', 'h'] as const).map((k) => (
              <input key={k} inputMode="numeric" className={inputClass} value={f[k]} onChange={(e) => set(k, e.target.value)} aria-label={k} />
            ))}
          </div>
        </Field>
        <div className="rounded-xl border border-line px-2 py-1">
          <Toggle on={f.fragile} onChange={() => set('fragile', !f.fragile)} label="Fragile" hint="Nothing may be stacked on it, in the yard or in a truck" />
        </div>

        {!existing && (
          <div className="rounded-xl border border-line">
            <div className="px-2 pt-1">
              <Toggle on={f.withDoc} onChange={() => set('withDoc', !f.withDoc)} label="Add source document now" hint="Bill, CMR, delivery note… more fields after saving" />
            </div>
            {f.withDoc && (
              <div className="grid grid-cols-2 gap-3 border-t border-line px-3.5 py-3">
                <Field label="Type">
                  <select className={inputClass} value={f.docType} onChange={(e) => set('docType', e.target.value as DocumentType)}>
                    {DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Document number">
                  <input className={inputClass} value={f.docNumber} onChange={(e) => set('docNumber', e.target.value)} placeholder="as printed" />
                </Field>
                <Field label="Shipper">
                  <input className={inputClass} value={f.shipper} onChange={(e) => set('shipper', e.target.value)} />
                </Field>
                <Field label="Consignee">
                  <input className={inputClass} value={f.consignee} onChange={(e) => set('consignee', e.target.value)} />
                </Field>
                <Field label="Issue date">
                  <input type="date" className={inputClass} value={f.docDate} onChange={(e) => set('docDate', e.target.value)} />
                </Field>
                <Field label="Status">
                  <Segmented
                    value={f.docStatus}
                    onChange={(v) => set('docStatus', v)}
                    options={[
                      { value: 'draft', label: 'Draft' },
                      { value: 'confirmed', label: 'Confirmed' },
                    ]}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        {error && <div className="rounded-lg bg-[#fdecec] px-3 py-2 text-[12px] text-[#d64545]">{error}</div>}

        {!existing && (
          <div className="flex items-center gap-2 rounded-lg bg-[#f5f7fb] px-3 py-2 text-[12px] text-muted">
            <Sparkles size={14} className="shrink-0 text-brand" />
            {recommended ? (
              <span>
                Recommended spot: <b className="text-ink">{recommended.label}</b> · free floor nearest the loading strip
              </span>
            ) : (
              <span>{valid ? 'No free spot fits right now — pick one on the map (or stack).' : 'Enter the dimensions to get a recommended spot.'}</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <div className="flex-1" />
          <Button onClick={close}>Cancel</Button>
          {existing ? (
            <Button type="submit" tone="primary">
              <Package size={14} /> Save
            </Button>
          ) : (
            <>
              {recommended && (
                <Button
                  onClick={() => {
                    const d = build();
                    if (!d) return;
                    useUi.getState().setPlacing({ kind: 'register', draft: d });
                    placeAt(recommended);
                    useUi.getState().openDialog(null);
                  }}
                >
                  Use recommended
                </Button>
              )}
              <Button type="submit" tone="primary">
                <MapPin size={14} /> Place on map
              </Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
