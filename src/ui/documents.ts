import type { CargoLook, DocumentType, SourceDocument } from '../domain/types';
import type { Tone } from './kit';

/** Labels and helpers for source documents and cargo kinds in forms and lists. */

export const DOC_TYPES: { value: DocumentType; label: string; hint: string }[] = [
  { value: 'delivery_note', label: 'Delivery note', hint: 'İrsaliye' },
  { value: 'cmr', label: 'CMR waybill', hint: 'Road consignment note' },
  { value: 'bill_of_lading', label: 'Bill of lading', hint: 'Konşimento' },
  { value: 'invoice', label: 'Invoice', hint: 'Fatura' },
  { value: 'packing_list', label: 'Packing list', hint: 'Çeki listesi' },
  { value: 'customs', label: 'Customs declaration', hint: 'Gümrük beyannamesi' },
  { value: 'other', label: 'Other document', hint: '' },
];

export const docTypeLabel = (t: DocumentType) => DOC_TYPES.find((d) => d.value === t)?.label ?? 'Document';

export const DOC_SHORT: Record<DocumentType, string> = {
  delivery_note: 'DN',
  cmr: 'CMR',
  bill_of_lading: 'B/L',
  invoice: 'INV',
  packing_list: 'PL',
  customs: 'CUS',
  other: 'DOC',
};

export const docStatusTone = (d: SourceDocument): Tone => (d.status === 'confirmed' ? 'green' : 'amber');

/** What a unit looks like / is, for the register form. */
export const CARGO_KINDS: { look: Exclude<CargoLook, 'container' | 'group-cartons'>; label: string }[] = [
  { look: 'cartons', label: 'Pallet · cartons' },
  { look: 'wrap-blue', label: 'Pallet · stretch-wrapped' },
  { look: 'wrap-white', label: 'Pallet · cold chain' },
  { look: 'bag', label: 'Bulk bag (big bag)' },
  { look: 'crate', label: 'Wooden crate' },
  { look: 'drum', label: 'Cable drum / reel' },
  { look: 'machine', label: 'Machine' },
  { look: 'pipes', label: 'Pipes / long freight' },
];

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Downscale a photo of a paper document to a JPEG data URL (≈ 100–250 kB). */
export async function photoDataUrl(file: File, max = 1400): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}

/** Download text as a file (CSV / JSON exports). */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function documentsCsv(docs: SourceDocument[]) {
  const cols: (keyof SourceDocument)[] = ['id', 'cargoId', 'type', 'number', 'issuedOn', 'status', 'shipper', 'consignee', 'carrier', 'origin', 'destination', 'pieces', 'grossKg', 'value', 'currency', 'items', 'notes', 'source', 'createdBy'];
  return [cols.join(','), ...docs.map((d) => cols.map((c) => csvCell(d[c])).join(','))].join('\n');
}
