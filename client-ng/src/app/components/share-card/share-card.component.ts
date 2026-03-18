import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShareData } from '../../models/share-data.model';

@Component({
  selector: 'app-share-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './share-card.component.html',
  styleUrls: ['./share-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareCardComponent {
  @Input() data: ShareData | null = null;
  @Output() close = new EventEmitter<void>();

  toastVisible  = false;
  toastMessage  = '';
  toastType: 'success' | 'error' = 'success';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private cd: ChangeDetectorRef) {}

  get shareText(): string {
    if (!this.data) return '';
    return `🌍 Air quality in ${this.data.name}: AQI ${this.data.aqi} (${this.data.cat}) — checked via AirVision Global https://airvision-seven.vercel.app`;
  }

  async copyLink(): Promise<void> {
    const text = this.shareText;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.showToast('Copied to clipboard ✓', 'success');
      } else {
        // Fallback for older browsers
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity  = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        this.showToast('Copied to clipboard ✓', 'success');
      }
    } catch {
      this.showToast('Could not copy — please copy manually', 'error');
    }
  }

  shareNative(): void {
    if (navigator.share && this.data) {
      navigator.share({ title: `AirVision — ${this.data.name}`, text: this.shareText })
        .catch(() => { /* user dismissed */ });
    } else {
      this.copyLink();
    }
  }

  shareTwitter(): void {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(this.shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  shareWhatsApp(): void {
    const url = `https://wa.me/?text=${encodeURIComponent(this.shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage = msg;
    this.toastType    = type;
    this.toastVisible = true;
    this.cd.markForCheck();
    this.toastTimer = setTimeout(() => {
      this.toastVisible = false;
      this.cd.markForCheck();
    }, 2800);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}
