import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-history-slider',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="history-container">
      <div class="slider-header">
        <span class="main-title">TIME TRAVEL</span>
        <div class="actions">
          <button class="live-btn" [class.active]="isLive" (click)="setLive()">LIVE</button>
        </div>
      </div>

      <div class="slider-body">
        <div class="time-label">{{ isLive ? 'REAL-TIME DATA' : (selectedTime | date:'HH:mm · dd MMM') }}</div>
        <input 
          type="range" 
          [min]="0" 
          [max]="maxIndex" 
          [(ngModel)]="currentIndex" 
          (input)="onSliderChange()"
          class="time-slider"
        />
        <div class="ticks">
          <span>-12H</span>
          <span>-6H</span>
          <span>NOW</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .history-container {
      position: fixed; top: 310px; right: var(--ctrl-right, 24px);
      width: 210px; background: rgba(13, 30, 58, 0.4); 
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 10px 14px; border-radius: 12px; z-index: 200;
      font-family: 'Courier New', monospace;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .slider-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .main-title { font-size: 7px; font-weight: bold; letter-spacing: 0.3em; color: #4a6a8a; text-transform: uppercase; }
    
    .actions { display: flex; gap: 6px; }
    .live-btn { 
      background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); 
      color: #8ba4c8; padding: 1px 6px; font-size: 8px; cursor: pointer; border-radius: 4px; 
      text-transform: uppercase; transition: all 0.2s;
    }
    .live-btn.active { background: #00e400; color: #000; border-color: #00e400; font-weight: bold; }

    .slider-body { margin-top: 4px; }
    .time-label { font-size: 10px; color: #c8d8f0; font-weight: bold; margin-bottom: 8px; letter-spacing: 0.05em; }
    
    .time-slider {
      width: 100%; cursor: pointer; height: 2px;
      accent-color: #00e400; -webkit-appearance: none; background: rgba(255, 255, 255, 0.1); 
      outline: none; margin: 4px 0; border-radius: 1px;
    }
    .time-slider::-webkit-slider-thumb { 
      -webkit-appearance: none; width: 10px; height: 10px; background: #fff; border-radius: 50%; 
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    }

    .ticks { display: flex; justify-content: space-between; margin-top: 4px; font-size: 7px; color: #3a5a7a; letter-spacing: 0.1em; }
  `]
})
export class HistorySliderComponent implements OnInit {
  @Input() snapshots: any[] = [];
  @Output() timeSelect = new EventEmitter<string | null>();

  currentIndex = 0;
  maxIndex = 0;
  collapsed = false;
  isLive = true;

  ngOnInit() {
    this.updateMax();
  }

  ngOnChanges() {
    this.updateMax();
  }

  updateMax() {
    this.maxIndex = this.snapshots?.length || 0;
    if (this.isLive) this.currentIndex = this.maxIndex;
  }

  get selectedTime(): string | null {
    const count = this.snapshots?.length || 0;
    if (this.currentIndex >= count) return null;
    // snapshots is [newest, ..., oldest]
    // currentIndex 0 is leftmost (-12H), should be oldest (count-1)
    // currentIndex count-1 is rightmost, should be newest (0)
    return this.snapshots[count - 1 - this.currentIndex]?.timestamp || null;
  }

  onSliderChange() {
    const idx = Number(this.currentIndex);
    if (idx >= this.maxIndex) {
      this.isLive = true;
      this.timeSelect.emit(null);
    } else {
      this.isLive = false;
      this.timeSelect.emit(this.selectedTime);
    }
  }

  setLive() {
    this.isLive = true;
    this.currentIndex = this.maxIndex;
    this.timeSelect.emit(null);
  }
}
