/**
 * Focus bookkeeping for two-step confirmations (Phase 6.3 keyboard sweep).
 *
 * Every destructive control in the owner dashboard — delete item, delete
 * category, unpublish site, remove domain — swaps itself out for a
 * Confirm/Keep pair when activated. The swap unmounts the focused trigger,
 * so the browser hands focus to `<body>`: the keyboard user's next Tab
 * restarts at the top of the page, and the Cancel option they need is
 * forty controls away in the other direction. The sweep measured it both
 * ways — focus was `<body>` immediately after opening the confirm *and*
 * after cancelling it.
 *
 * So focus is moved deliberately, on both edges:
 *   open  → the **safe** choice (`Keep …`). The APG puts focus on the
 *           least destructive action, and a stray Enter on a destructive
 *           button is the one accident this interaction must never have.
 *   close → back to the trigger, where the user was.
 *
 * Client-only (state + effect); every call site is already a client
 * component. Pass the two refs to the buttons that swap.
 */
import { useEffect, useRef, type RefObject } from "react";

export interface ConfirmFocus {
  /** The control that opens the confirmation ("Delete item…"). */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** The control that cancels it ("Keep item"). */
  cancelRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Focus follows the confirmation swap instead of being dropped with the
 * element that was focused. A confirmation that opens already open — the
 * initial render — moves nothing: this bookkeeping must never steal focus
 * from wherever the page put it on load.
 */
export function useConfirmFocus(confirming: boolean): ConfirmFocus {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(confirming);

  useEffect(() => {
    const opened = confirming && !wasConfirming.current;
    const closed = !confirming && wasConfirming.current;
    wasConfirming.current = confirming;
    if (opened) {
      cancelRef.current?.focus();
    } else if (closed) {
      triggerRef.current?.focus();
    }
  }, [confirming]);

  return { triggerRef, cancelRef };
}
