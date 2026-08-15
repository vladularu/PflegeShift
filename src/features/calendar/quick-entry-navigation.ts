let closePopupOnReturn = false;

export function beginShiftSelectionNavigation(): void {
  closePopupOnReturn = false;
}

export function completeShiftSelectionNavigation(): void {
  closePopupOnReturn = true;
}

export function consumeShiftSelectionPopupRestore(): boolean {
  const shouldRestore = !closePopupOnReturn;
  closePopupOnReturn = false;
  return shouldRestore;
}
