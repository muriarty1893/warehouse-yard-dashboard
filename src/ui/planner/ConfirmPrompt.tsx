import { useState } from 'react';
import { useLoading } from '../../loading/store';
import { useUi } from '../../state/ui';
import { useView } from '../../state/view';
import { Modal } from '../Dialog';
import { Button, Field, inputClass } from '../kit';

/** Confirming a plan that breaks a rule needs the manager's reason (spec §2.1, Docktor rule 2). */
export function ConfirmPrompt({ truckId }: { truckId: string }) {
  const close = () => useUi.getState().openDialog(null);
  const issues = useLoading((s) => s.trucks[truckId]?.recommended?.checks.issues ?? []);
  const [reason, setReason] = useState('');
  const confirm = () => {
    const r = useLoading.getState().confirm(truckId, { overrideReason: reason });
    useUi.getState().notify(r.ok ? `Plan for ${truckId} confirmed despite: ${issues[0] ?? 'a failed check'}` : r.reason, r.ok ? 'ok' : 'error');
    if (r.ok) {
      close();
      useView.getState().closePlanner();
    }
  };
  return (
    <Modal title="Confirm anyway?" subtitle="This plan breaks a loading rule. It is kept with your reason." onClose={close} width={480}>
      <div className="space-y-3 p-5">
        <ul className="space-y-1 rounded-xl bg-[#fdecec] px-3 py-2 text-[12px] text-[#d64545]">
          {issues.map((i) => (
            <li key={i}>· {i}</li>
          ))}
        </ul>
        <Field label="Reason">
          <input autoFocus className={inputClass} value={reason} placeholder="e.g. driver drops stop 1 last" onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reason.trim() && confirm()} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button tone="danger" disabled={!reason.trim()} onClick={confirm}>
            Confirm anyway
          </Button>
        </div>
      </div>
    </Modal>
  );
}
