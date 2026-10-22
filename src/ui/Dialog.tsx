import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useUi } from '../state/ui';
import { CargoForm } from './CargoForm';
import { DocumentForm } from './DocumentForm';
import { ConfirmPrompt } from './planner/ConfirmPrompt';
import { UrgentPicker } from './planner/UrgentPicker';
import { Card, IconButton } from './kit';

/** Modal shell: backdrop, title bar, Esc to close. */
export function Modal({ title, subtitle, onClose, children, width = 560 }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#1b2a4a]/25 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Card className="flex max-h-[min(860px,calc(100vh-32px))] w-full flex-col overflow-hidden" style={{ maxWidth: width }}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-ink">{title}</div>
            {subtitle && <div className="mt-0.5 text-[12px] text-muted">{subtitle}</div>}
          </div>
          <IconButton title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Card>
    </div>
  );
}

/** Whichever form is open. */
export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'document':
      return <DocumentForm key={`${dialog.cargoId}|${dialog.docId}`} cargoId={dialog.cargoId} docId={dialog.docId} />;
    case 'cargo':
      return <CargoForm key={dialog.cargoId ?? 'new'} cargoId={dialog.cargoId} draft={dialog.draft} />;
    case 'urgent':
      return <UrgentPicker truckId={dialog.truckId} />;
    case 'confirm':
      return <ConfirmPrompt truckId={dialog.truckId} />;
  }
}
