import { beginSessionIntent, isSessionIntentCurrent } from '../services/sessionIntent';
import { useRef, useState } from 'react';
import ConfirmLeaveModal from '../components/ConfirmLeaveModal';
import { useSessionStore } from '../stores/sessionStore';
import { leaveSession } from '../services/socketBindings';
import { toast } from './useToast';

// Entry pages share one explicit boundary before replacing this tab's Session.
export function useSessionSwitch() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = useRef<() => Promise<void>>();
  function continueTo(next: () => Promise<void>, targetCode?: string) {
    const current = useSessionStore.getState();
    if (
      current.sessionCode &&
      current.sessionStatus !== 'expired' &&
      current.sessionCode !== targetCode
    ) {
      action.current = next;
      setOpen(true);
    } else void next();
  }
  return {
    continueTo,
    switchDialog: (
      <ConfirmLeaveModal
        isOpen={open}
        context="switching"
        isLoading={busy}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => {
          void (async () => {
            const intent = beginSessionIntent();
            const next = action.current;
            setBusy(true);
            try {
              const code = useSessionStore.getState().sessionCode;
              if (code) {
                const ack = await leaveSession(code, intent);
                if (!isSessionIntentCurrent(intent)) return;
                if (
                  !ack.success &&
                  !['NOT_IN_SESSION', 'SESSION_NOT_FOUND'].includes(ack.error.code)
                ) {
                  toast.error(ack.error.message);
                  return;
                }
              }
              setOpen(false);
              await next?.();
            } catch (error) {
              if (!isSessionIntentCurrent(intent)) return;
              toast.error(
                error instanceof Error ? error.message : 'Could not leave session. Try again.'
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    ),
  };
}
