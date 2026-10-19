import { Camera, FileText, ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DocumentType, SourceDocument } from '../domain/types';
import { useUi } from '../state/ui';
import { useInventory, type DocumentInput } from '../world/inventory';
import { Modal } from './Dialog';
import { DOC_TYPES, photoDataUrl, todayIso } from './documents';
import { Button, Field, inputClass, Segmented } from './kit';

/**
 * Manual entry of a source document (spec §10: the fallback when there is no
 * OCR draft): bill / CMR / delivery note number and details, an optional
 * photo of the paper, saved as a draft or confirmed.
 */

type Form = Omit<DocumentInput, 'pieces' | 'grossKg' | 'value'> & { pieces: string; grossKg: string; value: string };

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));

export function DocumentForm({ cargoId, docId }: { cargoId: string; docId?: string }) {
  const close = () => useUi.getState().openDialog(null);
  const notify = useUi((s) => s.notify);
  const cargo = useInventory((s) => s.cargo.find((c) => c.id === cargoId));
  const documents = useInventory((s) => s.documents);
  const saveDocument = useInventory((s) => s.saveDocument);
  const removeDocument = useInventory((s) => s.removeDocument);
  const existing = docId ? documents.find((d) => d.id === docId) : undefined;
  const fileInput = useRef<HTMLInputElement>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState<Form>(() => {
    const d: Partial<SourceDocument> = existing ?? {};
    return {
      cargoId,
      type: d.type ?? 'delivery_note',
      number: d.number ?? '',
      issuedOn: d.issuedOn ?? todayIso(),
      shipper: d.shipper ?? '',
      consignee: d.consignee ?? '',
      carrier: d.carrier ?? '',
      origin: d.origin ?? '',
      destination: d.destination ?? cargo?.destination ?? '',
      pieces: d.pieces !== undefined ? String(d.pieces) : '1',
      grossKg: d.grossKg !== undefined ? String(d.grossKg) : cargo ? String(cargo.weightKg) : '',
      value: d.value !== undefined ? String(d.value) : '',
      currency: d.currency ?? 'TRY',
      items: d.items ?? (cargo ? `1 × ${cargo.description}` : ''),
      notes: d.notes ?? '',
      photo: d.photo,
      status: d.status ?? 'confirmed',
    };
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const duplicate = f.number.trim() ? documents.find((d) => d.id !== docId && d.number.trim().toLowerCase() === f.number.trim().toLowerCase()) : undefined;

  const save = (status: SourceDocument['status']) => {
    if (!f.number.trim()) {
      setError('Enter the number printed on the document.');
      return;
    }
    const input: DocumentInput = {
      ...f,
      id: existing?.id,
      number: f.number.trim(),
      shipper: f.shipper.trim(),
      consignee: f.consignee.trim(),
      pieces: num(f.pieces),
      grossKg: num(f.grossKg),
      value: num(f.value),
      status,
    };
    const doc = saveDocument(input);
    notify(`${doc.number} ${existing ? 'updated' : 'added'} to ${cargoId}${status === 'draft' ? ' (draft)' : ''}`);
    close();
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      set('photo', await photoDataUrl(file));
    } catch {
      setError('Could not read that image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={existing ? `Edit ${existing.number}` : 'Add source document'} subtitle={`${cargoId}${cargo ? ` · ${cargo.description}` : ''} · entered by hand`} onClose={close} width={640}>
      <form
        className="space-y-4 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(f.status);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Document type">
            <select className={inputClass} value={f.type} onChange={(e) => set('type', e.target.value as DocumentType)}>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                  {t.hint ? ` · ${t.hint}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Document / bill number" hint="as printed">
            <input autoFocus className={inputClass} value={f.number} onChange={(e) => set('number', e.target.value)} placeholder="e.g. DN-2026-004512" />
          </Field>
          <Field label="Issue date">
            <input type="date" className={inputClass} value={f.issuedOn} onChange={(e) => set('issuedOn', e.target.value)} />
          </Field>
          <Field label="Status">
            <Segmented
              value={f.status}
              onChange={(v) => set('status', v)}
              options={[
                { value: 'draft', label: 'Draft · to check' },
                { value: 'confirmed', label: 'Confirmed' },
              ]}
            />
          </Field>
        </div>
        {duplicate && (
          <div className="rounded-lg bg-[#fff1df] px-3 py-2 text-[12px] text-[#c4640a]">
            Another document already has this number ({duplicate.id} on {duplicate.cargoId}). Saving is allowed — check it is not entered twice.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Shipper / sender">
            <input className={inputClass} value={f.shipper} onChange={(e) => set('shipper', e.target.value)} placeholder="Company that sent the goods" />
          </Field>
          <Field label="Consignee / receiver">
            <input className={inputClass} value={f.consignee} onChange={(e) => set('consignee', e.target.value)} placeholder="Company receiving the goods" />
          </Field>
          <Field label="Carrier">
            <input className={inputClass} value={f.carrier} onChange={(e) => set('carrier', e.target.value)} placeholder="Transport company" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <input className={inputClass} value={f.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Origin" />
            </Field>
            <Field label="To">
              <input className={inputClass} value={f.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Destination" />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Field label="Pieces">
            <input inputMode="numeric" className={inputClass} value={f.pieces} onChange={(e) => set('pieces', e.target.value)} />
          </Field>
          <Field label="Gross weight" hint="kg">
            <input inputMode="decimal" className={inputClass} value={f.grossKg} onChange={(e) => set('grossKg', e.target.value)} />
          </Field>
          <Field label="Value">
            <input inputMode="decimal" className={inputClass} value={f.value} onChange={(e) => set('value', e.target.value)} placeholder="—" />
          </Field>
          <Field label="Currency">
            <select className={inputClass} value={f.currency} onChange={(e) => set('currency', e.target.value)}>
              {['TRY', 'EUR', 'USD', 'GBP'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Items on the document" hint="one per line">
          <textarea rows={3} className={`${inputClass} h-auto py-2`} value={f.items} onChange={(e) => set('items', e.target.value)} placeholder={'2 × Ceramic tiles 60×60, 48 boxes\n1 × Spare parts'} />
        </Field>
        <Field label="Notes">
          <textarea rows={2} className={`${inputClass} h-auto py-2`} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Damage, missing pieces, seal number…" />
        </Field>

        <div>
          <div className="mb-1 text-[11.5px] font-semibold text-muted">Photo of the paper document</div>
          {f.photo ? (
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => setEnlarged((v) => !v)} className={`overflow-hidden rounded-lg ring-1 ring-line ${enlarged ? 'w-full' : 'w-32'}`} title={enlarged ? 'Shrink' : 'Enlarge'}>
                <img src={f.photo} alt="Document" className="block w-full" />
              </button>
              {!enlarged && (
                <div className="flex flex-col gap-2">
                  <Button onClick={() => fileInput.current?.click()}>
                    <ImagePlus size={14} /> Replace
                  </Button>
                  <Button tone="ghost" onClick={() => set('photo', undefined)}>
                    Remove photo
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void attach(e.dataTransfer.files[0]);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[#c9d3ea] bg-[#f7f9fc] px-4 py-3 text-left hover:border-brand/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8eefe] text-brand">
                <Camera size={17} />
              </span>
              <span className="leading-tight">
                <span className="block text-[12.5px] font-semibold text-ink">{busy ? 'Reading photo…' : 'Take or upload a photo'}</span>
                <span className="block text-[11px] text-muted">Optional · kept with the record for checking (OCR comes later)</span>
              </span>
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void attach(e.target.files?.[0])} />
        </div>

        {error && <div className="rounded-lg bg-[#fdecec] px-3 py-2 text-[12px] text-[#d64545]">{error}</div>}

        <div className="flex items-center gap-2 border-t border-line pt-4">
          {existing && (
            <Button
              tone="danger"
              onClick={() => {
                if (!window.confirm(`Remove ${existing.number} from ${cargoId}?`)) return;
                removeDocument(existing.id);
                notify(`${existing.number} removed`);
                close();
              }}
            >
              <Trash2 size={14} /> Remove
            </Button>
          )}
          <div className="flex-1" />
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" tone="primary">
            <FileText size={14} /> {f.status === 'draft' ? 'Save draft' : existing?.status === 'draft' ? 'Confirm document' : 'Save document'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
