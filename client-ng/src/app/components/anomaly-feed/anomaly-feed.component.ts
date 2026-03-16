import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AqiService } from '../../services/aqi.service';
import { aqiInfo } from '../../utils/aqi';
import { ANOMALY_SEVERITY, SOURCE_TAGS } from '../../utils/health';

@Component({
  selector: 'app-anomaly-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './anomaly-feed.component.html',
  styleUrls: ['./anomaly-feed.component.css'],
})
export class AnomalyFeedComponent implements OnInit, OnDestroy {
  @Output() countryClick = new EventEmitter<string>();
  @Output() zoomTo = new EventEmitter<string>();

  anomalies: any[] = [];
  open = false;
  loading = false;
  hoveredCode: string | null = null;

  readonly ANOMALY_SEVERITY = ANOMALY_SEVERITY;
  readonly SOURCE_TAGS = SOURCE_TAGS;

  private intervalId: any;

  constructor(private aqi: AqiService) {}

  ngOnInit(): void {
    this.load();
    this.intervalId = setInterval(() => this.load(), 15 * 60 * 1000);
  }

  ngOnDestroy(): void { clearInterval(this.intervalId); }

  load(): void {
    this.loading = true;
    this.aqi.getAnomalies().subscribe({
      next: (j) => { this.anomalies = j.anomalies || []; this.loading = false; },
      error: ()  => { this.loading = false; }
    });
  }

  get count() { return this.anomalies.length; }
  get hasCritical() { return this.anomalies.some(a => a.severity === 'extreme'); }

  sev(a: any) { return this.ANOMALY_SEVERITY[a.severity] || this.ANOMALY_SEVERITY['elevated']; }
  info(a: any) { return aqiInfo(a.currentAqi); }
  src(a: any)  { return a.dominentpol && this.SOURCE_TAGS[a.dominentpol]; }

  select(code: string): void {
    this.countryClick.emit(code);
    this.zoomTo.emit(code);
    this.open = false;
  }
}
