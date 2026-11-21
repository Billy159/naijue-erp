/** Shared native modal lifecycle. Callers own portal/container cleanup and close guards. */
export function showNativeModal(dialog: HTMLDialogElement) {
  if (!dialog.open) dialog.showModal();
}

export function closeNativeModal(dialog: HTMLDialogElement) {
  if (dialog.open) dialog.close();
}

export function restoreModalTrigger(trigger: Element | null) {
  if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
}
