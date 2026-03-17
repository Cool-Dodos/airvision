import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-share-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="share-overlay" (click)="close.emit()">
      <div class="share-modal" (click)="$event.stopPropagation()">
        <span class="close-btn" (click)="close.emit()">✕</span>
        
        <div class="card-frame" #cardEl>
          <div class="card-header">
            <div class="brand">AirVision Global</div>
            <div class="date">{{ now | date:'dd MMM yyyy' }}</div>
          </div>
          
          <div class="card-body">
            <div class="location-box">
              <div class="city">{{ data.city || '' }}</div>
              <div class="country">{{ data.name }}</div>
            </div>
            
            <div class="aqi-main">
              <div class="aqi-val" [style.color]="data.col">{{ data.aqi }}</div>
              <div class="aqi-meta">
                <div class="aqi-cat" [style.color]="data.col">{{ data.cat }}</div>
                <div class="aqi-label">Air Quality Index</div>
              </div>
            </div>
            
            <div class="health-summary">
              <div class="health-label">HEALTH ADVISORY</div>
              <div class="health-val">Safe Outdoors: <span>{{ data.safe }}</span></div>
            </div>
          </div>
          
          <div class="card-footer">
            <div class="tagline">Live Pollution Monitoring · 8-bit Accuracy</div>
            <div class="url">airvision-global.web.app</div>
          </div>
        </div>

        <div class="modal-actions">
           <div class="hint-text">Right click → Save Image to share</div>
           <button class="action-btn primary" (click)="onCopy()">Copy Text</button>
           <button class="action-btn" (click)="close.emit()">Close</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .share-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
    .share-modal { width: 440px; position: relative; }
    .close-btn { position: absolute; top: -30px; right: 0; color: #fff; cursor: pointer; font-size: 20px; }
    
    .card-frame { 
      background: #020510; border: 1px solid #1e3a5a; padding: 30px; 
      font-family: 'Courier New', monospace; color: #8ba4c8;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      background-image: radial-gradient(circle at 2px 2px, rgba(29, 78, 216, 0.05) 1px, transparent 0);
      background-size: 24px 24px;
    }
    
    .card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 40px; border-bottom: 1px solid #0d2a4a; padding-bottom: 10px; }
    .brand { font-size: 10px; font-weight: bold; letter-spacing: 0.3em; color: #3a5a7a; text-transform: uppercase; }
    .date { font-size: 10px; color: #2a4a6a; }
    
    .city { font-size: 14px; letter-spacing: 0.1em; color: #5a7a9a; margin-bottom: 4px; }
    .country { font-size: 32px; font-weight: bold; color: #c8d8f0; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 30px; line-height: 1; }
    
    .aqi-main { display: flex; align-items: center; gap: 24px; margin-bottom: 40px; }
    .aqi-val { font-size: 94px; font-weight: bold; line-height: 0.8; }
    .aqi-meta { display: flex; flex-direction: column; gap: 4px; }
    .aqi-cat { font-size: 14px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; }
    .aqi-label { font-size: 10px; color: #2a4a6a; letter-spacing: 0.1em; }
    
    .health-summary { border-top: 1px solid #0d2a4a; padding-top: 20px; }
    .health-label { font-size: 10px; letter-spacing: 0.3em; color: #3a5a7a; text-transform: uppercase; margin-bottom: 8px; }
    .health-val { font-size: 13px; color: #8ba4c8; }
    .health-val span { color: #c8d8f0; font-weight: bold; }
    
    .card-footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 8px; color: #1a3a5a; text-transform: uppercase; letter-spacing: 0.1em; }
    
    .modal-actions { margin-top: 24px; display: flex; gap: 12px; align-items: center; justify-content: center; }
    .hint-text { font-size: 10px; color: #3a5a7a; margin-right: auto; }
    .action-btn { background: #0d2a4a; border: none; color: #c8d8f0; padding: 8px 16px; font-family: inherit; font-size: 11px; cursor: pointer; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.1em; }
    .action-btn:hover { background: #1a3a5a; }
    .action-btn.primary { background: #2a5a8a; }
  `]
})
export class ShareCardComponent implements OnInit {
  @Input() data: any;
  @Output() close = new EventEmitter<void>();
  now = new Date();

  ngOnInit() {
    console.log('ShareCardComponent initialized with data:', this.data);
  }

  onCopy() {
    const text = `Air Quality Insight for ${this.data.city ? this.data.city + ', ' : ''}${this.data.name}: ${this.data.aqi} (${this.data.cat}). Safe outdoors: ${this.data.safe}. Check live at AirVision Global.`;
    navigator.clipboard.writeText(text);
    alert('Summary copied to clipboard!');
  }
}
