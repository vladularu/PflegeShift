const HORIZONTAL_MARGIN = 14;
const POPOVER_MAX_WIDTH = 360;
const POPOVER_HEIGHT = 132;
const POINTER_SIZE = 18;
const ANCHOR_GAP = 18;
const VERTICAL_MARGIN = 18;

export interface QuickEntryLayout {
  readonly cardHeight: number;
  readonly cardLeft: number;
  readonly cardTop: number;
  readonly cardWidth: number;
  readonly pointerLeft: number;
  readonly pointerTop: number;
  readonly showAbove: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateQuickEntryLayout(
  viewportWidth: number,
  viewportHeight: number,
  anchorX: number,
  anchorY: number,
): QuickEntryLayout {
  const cardWidth = Math.min(POPOVER_MAX_WIDTH, viewportWidth - HORIZONTAL_MARGIN * 2);
  const cardLeft = clamp(
    anchorX - cardWidth / 2,
    HORIZONTAL_MARGIN,
    viewportWidth - cardWidth - HORIZONTAL_MARGIN,
  );
  const showAbove = anchorY + ANCHOR_GAP + POPOVER_HEIGHT > viewportHeight - VERTICAL_MARGIN;
  const preferredTop = showAbove
    ? anchorY - ANCHOR_GAP - POPOVER_HEIGHT
    : anchorY + ANCHOR_GAP;
  const cardTop = clamp(
    preferredTop,
    VERTICAL_MARGIN,
    viewportHeight - POPOVER_HEIGHT - VERTICAL_MARGIN,
  );
  const pointerLeft = clamp(
    anchorX - POINTER_SIZE / 2,
    cardLeft + 24,
    cardLeft + cardWidth - POINTER_SIZE - 24,
  );
  const pointerTop = showAbove
    ? cardTop + POPOVER_HEIGHT - POINTER_SIZE / 2
    : cardTop - POINTER_SIZE / 2;

  return {
    cardHeight: POPOVER_HEIGHT,
    cardLeft,
    cardTop,
    cardWidth,
    pointerLeft,
    pointerTop,
    showAbove,
  };
}
