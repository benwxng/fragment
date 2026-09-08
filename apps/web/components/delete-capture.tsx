'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { deleteCapture } from '@/app/actions';
import { CloseIcon } from '@/components/icons';
import { initialFormState } from '@/lib/form-state';

function DeleteSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-danger" type="submit" disabled={pending}>
      {pending ? 'Deleting…' : 'Delete reference'}
    </button>
  );
}

export function DeleteCapture({ captureId, disabled = false }: { captureId: string; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const action = deleteCapture.bind(null, captureId);
  const [state, formAction] = useActionState(action, initialFormState);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  if (disabled) {
    return <button className="button button-delete" type="button" disabled title="Demo references cannot be deleted">Delete reference</button>;
  }

  return (
    <>
      <button ref={trigger} className="button button-delete" type="button" onClick={() => setOpen(true)}>
        Delete reference
      </button>
      <dialog
        className="confirm-dialog"
        ref={dialog}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClick={(event) => { if (event.target === dialog.current) close(); }}
      >
        <form action={formAction} className="confirm-content">
          <button className="icon-button dialog-close" type="button" onClick={close} aria-label="Close delete confirmation">
            <CloseIcon />
          </button>
          <p className="eyebrow">Permanent action</p>
          <h2>Delete this reference?</h2>
          <p>The screenshot and captured design properties will be removed. This cannot be undone.</p>
          <p className="form-message error" aria-live="polite">{state.message}</p>
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={close}>Cancel</button>
            <DeleteSubmit />
          </div>
        </form>
      </dialog>
    </>
  );
}
