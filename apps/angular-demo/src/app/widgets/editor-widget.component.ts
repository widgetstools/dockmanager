import { Component, Input, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import type { PanelConfig } from '@widgetstools/dock-manager-core';

const SAMPLE_CODE: Record<string, string> = {
  doc1: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\nconst root = createRoot(document.getElementById('root')!);\nroot.render(<App />);",
  doc2: "import React from 'react';\n\nfunction App() {\n  return (\n    <div className=\"app\">\n      <h1>Hello World</h1>\n    </div>\n  );\n}\n\nexport default App;",
  doc3: ".app {\n  display: flex;\n  flex-direction: column;\n  min-height: 100vh;\n}\n\nh1 {\n  color: #333;\n  font-size: 24px;\n}",
  doc4: "export function formatDate(date: Date): string {\n  return date.toISOString().split('T')[0];\n}\n\nexport function capitalize(str: string): string {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}",
  doc5: "import { useState, useCallback } from 'react';\n\nexport function useToggle(initial = false) {\n  const [value, setValue] = useState(initial);\n  const toggle = useCallback(() => setValue(v => !v), []);\n  return [value, toggle] as const;\n}",
  doc6: "declare module '*.css' {\n  const content: Record<string, string>;\n  export default content;\n}",
  doc7: '{\n  "name": "demo-app",\n  "version": "1.0.0",\n  "private": true,\n  "dependencies": {\n    "react": "^19.0.0"\n  }\n}',
};

@Component({
  selector: 'app-editor-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;flex-direction:column;height:100%;color:inherit">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;font-size:11px;border-bottom:1px solid var(--dock-border, #ddd);background:hsl(var(--dock-surface-alt))">
        <span style="opacity:0.5">{{ lang }} {{ modified ? '(modified)' : '' }}</span>
        @if (modified) {
          <button (click)="save()" style="font-size:10px;padding:2px 8px;border:1px solid hsl(var(--dock-border));border-radius:3px;background:hsl(var(--dock-primary));color:white;cursor:pointer">Save</button>
        }
      </div>
      <textarea
        [value]="content"
        (input)="onEdit($event)"
        spellcheck="false"
        style="flex:1;resize:none;border:none;outline:none;padding:12px;font-family:Consolas,Monaco,'Courier New',monospace;font-size:12px;line-height:1.5;background:transparent;color:inherit"
      ></textarea>
    </div>
  `,
})
export class EditorWidgetComponent implements OnInit {
  @Input() api: any;
  @Input() panel!: PanelConfig;

  lang = 'text';
  content = '';
  modified = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.lang = ((this.panel?.widgetProps?.['language'] as string) || 'text').toUpperCase();
    this.content = SAMPLE_CODE[this.panel?.id] || `// ${this.lang} file content\n// Panel: ${this.panel?.id}`;
    this.modified = this.panel?.widgetProps?.['unsaved'] === true;
    if (this.modified) {
      this.api?.setBadge?.('\u25cf');
    }
  }

  onEdit(event: Event): void {
    this.content = (event.target as HTMLTextAreaElement).value;
    if (!this.modified) {
      this.modified = true;
      this.api?.setBadge?.('\u25cf');
      this.api?.setTitle?.(`${this.panel.title} \u25cf`);
      this.cdr.markForCheck();
    }
  }

  save(): void {
    this.modified = false;
    this.api?.setBadge?.(null);
    this.api?.setTitle?.(this.panel.title);
    this.cdr.markForCheck();
  }
}
