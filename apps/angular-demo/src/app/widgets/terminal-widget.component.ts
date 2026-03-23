import { Component, Input, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-terminal-widget',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;flex-direction:column;height:100%;font-family:Consolas,Monaco,'Courier New',monospace;font-size:12px;color:inherit">
      <div #output style="flex:1;overflow:auto;padding:8px 12px">
        @for (line of lines; track $index) {
          <div [style.line-height]="'1.6'" [style.white-space]="'pre-wrap'" [style.opacity]="line.startsWith('$') ? 1 : 0.7">
            {{ line || '\u00A0' }}
          </div>
        }
      </div>
      <div style="display:flex;align-items:center;padding:4px 12px;border-top:1px solid hsl(var(--dock-border))">
        <span style="opacity:0.5;margin-right:8px">$</span>
        <input
          [(ngModel)]="input"
          (keydown.enter)="onSubmit()"
          placeholder="Type a command..."
          style="flex:1;border:none;outline:none;background:transparent;color:inherit;font-family:inherit;font-size:inherit"
        />
      </div>
    </div>
  `,
})
export class TerminalWidgetComponent implements AfterViewChecked {
  @Input() api: any;
  @Input() panel: any;
  @ViewChild('output') outputRef?: ElementRef;

  lines: string[] = [
    '$ npm start',
    'Starting development server...',
    'Compiled successfully!',
    '',
    'Local:   http://localhost:5174/',
    '',
    'Ready.',
    '',
  ];
  input = '';
  private shouldScroll = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.outputRef) {
      this.outputRef.nativeElement.scrollTop = this.outputRef.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  onSubmit(): void {
    if (!this.input.trim()) return;
    const cmd = this.input.trim();
    this.input = '';
    this.lines = [...this.lines, `$ ${cmd}`];
    this.shouldScroll = true;

    if (cmd === 'help') {
      this.lines = [...this.lines, 'Available: help, build, clear, date, badges, attention'];
    } else if (cmd === 'build') {
      this.lines = [...this.lines, 'Building...'];
      setTimeout(() => {
        this.lines = [...this.lines, 'Build completed in 2.3s', ''];
        this.api?.setBadge?.('done');
        this.api?.setAttention?.(true);
        setTimeout(() => this.api?.setAttention?.(false), 3000);
        this.shouldScroll = true;
        this.cdr.markForCheck();
      }, 1500);
    } else if (cmd === 'clear') {
      this.lines = [];
    } else if (cmd === 'date') {
      this.lines = [...this.lines, new Date().toString()];
    } else if (cmd === 'badges') {
      this.api?.setBadge?.('3');
      this.lines = [...this.lines, 'Badge set to "3" via PanelApi.setBadge()'];
    } else if (cmd === 'attention') {
      this.api?.setAttention?.(true);
      this.lines = [...this.lines, 'Attention requested via PanelApi.setAttention()'];
      setTimeout(() => this.api?.setAttention?.(false), 3000);
    } else {
      this.lines = [...this.lines, `Unknown command: ${cmd}`, 'Type "help" for available commands'];
    }
    this.cdr.markForCheck();
  }
}
