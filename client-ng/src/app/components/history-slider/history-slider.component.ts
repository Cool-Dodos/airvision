import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SnapshotEntry { timestamp: string; }

@Component({
  selector: 'app-history-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history-slider.component.html',
  styleUrls: ['./history-slider.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorySliderComponent implements OnChanges {
  @Input()  snapshots: SnapshotEntry[] = [];
  @Output() snapshotChange = new EventEmitter<SnapshotEntry | null>();

  /** Slider position: 0 = oldest, max = newest (latest/live) */
  currentIndex = 0;

  /** The ISO timestamp the user has actively selected */
  private pinnedTimestamp: string | null = null;

  /** True when the slider is at the rightmost (live) position */
  get isLive(): boolean {
    return this.currentIndex === this.snapshots.length - 1;
  }

  get selectedSnapshot(): SnapshotEntry | null {
    if (!this.snapshots.length) return null;
    return this.snapshots[this.currentIndex] ?? null;
  }

  get tickLabels(): string[] {
    const n = this.snapshots.length;
    if (n < 2) return [];
    // Derive relative labels from actual timestamps
    const newest = new Date(this.snapshots[n - 1].timestamp).getTime();
    return this.snapshots.map(s => {
      const diffMin = Math.round((newest - new Date(s.timestamp).getTime()) / 60000);
      if (diffMin === 0) return 'NOW';
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      return h > 0 ? (m === 0 ? `-${h}H` : `-${h}H${m}m`) : `-${m}m`;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['snapshots']) return;
    const snaps = this.snapshots;
    if (!snaps?.length) { this.currentIndex = 0; return; }

    if (this.pinnedTimestamp === null) {
      // First load or no active selection — jump to live (newest)
      this.currentIndex = snaps.length - 1;
    } else {
      // New snapshots arrived: find the previously-selected timestamp
      const idx = snaps.findIndex(s => s.timestamp === this.pinnedTimestamp);
      if (idx !== -1) {
        // Keep the same logical moment — index may shift if a new entry was prepended
        this.currentIndex = idx;
      } else {
        // Pinned entry was pruned (>24h old) — stay at live
        this.currentIndex = snaps.length - 1;
        this.pinnedTimestamp = null;
      }
    }
  }

  onSliderInput(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.currentIndex    = val;
    const snap = this.snapshots[val] ?? null;
    this.pinnedTimestamp = snap?.timestamp ?? null;
    this.snapshotChange.emit(snap);
  }

  jumpToLive(): void {
    this.currentIndex    = this.snapshots.length - 1;
    this.pinnedTimestamp = null;
    this.snapshotChange.emit(null); // null = "use live data"
  }

  formatLabel(ts: string): string {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
