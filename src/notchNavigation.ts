import type { PanelId } from './panelOrder';

export type WheelSample = { deltaX: number; deltaY: number; deltaMode: number; ctrlKey?: boolean };

/** A trackpad swipe (including its momentum tail) may advance only one panel. */
export class NotchWheelGesture {
  private lastEvent = -Infinity;
  private total = 0;
  private axis: 'x' | 'y' | null = null;
  private consumed = false;

  consume(event: WheelSample, now: number, eligible = true): -1 | 0 | 1 {
    if (event.ctrlKey) return 0; // Pinch-to-zoom is not panel navigation.
    if (now - this.lastEvent > 250) {
      this.total = 0;
      this.axis = null;
      this.consumed = false;
    }
    // Even tiny momentum events keep the current gesture locked.
    this.lastEvent = now;
    if (!eligible || this.consumed) return 0;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1;
    if (Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) * unit < 2) return 0;
    this.axis ??= Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 'x' : 'y';
    this.total += (this.axis === 'x' ? event.deltaX : event.deltaY) * unit;
    if (Math.abs(this.total) < 80) return 0;
    this.consumed = true;
    return this.total > 0 ? 1 : -1;
  }
}

export function panelToReopen(last: PanelId | null, available: readonly PanelId[]): PanelId {
  if (last && available.includes(last)) return last;
  return available.find(panel => panel === 'calendar')
    ?? available.find(panel => panel === 'command-center')
    ?? available[0] ?? 'status';
}
