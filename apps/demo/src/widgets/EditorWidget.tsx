import React, { useState, useEffect, useCallback } from 'react';
import type { PanelApi } from '@widgetstools/dock-manager-core';
import type { PanelConfig } from '@widgetstools/dock-manager-core';

/**
 * Simple code editor placeholder — demonstrates PanelApi.setBadge() for unsaved state.
 * Shows a dot badge when content is modified, clears it on "save".
 */
export function EditorWidget({ api, panel }: { api: PanelApi; panel: PanelConfig }) {
  const lang = (panel.widgetProps?.language as string) || 'text';
  const initiallyUnsaved = panel.widgetProps?.unsaved === true;
  const [content, setContent] = useState(getDefaultContent(panel.id, lang));
  const [modified, setModified] = useState(initiallyUnsaved);

  useEffect(() => {
    if (initiallyUnsaved) {
      api.setBadge('●');
    }
  }, [api, initiallyUnsaved]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (!modified) {
      setModified(true);
      api.setBadge('●');
      api.setTitle(`${panel.title} ●`);
    }
  }, [api, modified, panel.title]);

  const handleSave = useCallback(() => {
    setModified(false);
    api.setBadge(null);
    api.setTitle(panel.title);
  }, [api, panel.title]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px', fontSize: 11, borderBottom: '1px solid var(--dock-border, #ddd)',
        background: 'hsl(var(--dock-surface-alt))',
      }}>
        <span style={{ opacity: 0.5 }}>{lang.toUpperCase()} {modified ? '(modified)' : ''}</span>
        {modified && (
          <button
            onClick={handleSave}
            style={{
              fontSize: 10, padding: '2px 8px', border: '1px solid hsl(var(--dock-border))',
              borderRadius: 3, background: 'hsl(var(--dock-primary))', color: 'white', cursor: 'pointer',
            }}
          >
            Save
          </button>
        )}
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        spellCheck={false}
        style={{
          flex: 1, resize: 'none', border: 'none', outline: 'none', padding: 12,
          fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: 12, lineHeight: 1.5,
          background: 'transparent', color: 'inherit',
        }}
      />
    </div>
  );
}

function getDefaultContent(panelId: string, lang: string): string {
  const samples: Record<string, string> = {
    doc1: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\nconst root = createRoot(document.getElementById('root')!);\nroot.render(<App />);`,
    doc2: `import React from 'react';\n\nfunction App() {\n  return (\n    <div className="app">\n      <h1>Hello World</h1>\n    </div>\n  );\n}\n\nexport default App;`,
    doc3: `.app {\n  display: flex;\n  flex-direction: column;\n  min-height: 100vh;\n}\n\nh1 {\n  color: #333;\n  font-size: 24px;\n}`,
    doc4: `export function formatDate(date: Date): string {\n  return date.toISOString().split('T')[0];\n}\n\nexport function capitalize(str: string): string {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}`,
    doc5: `import { useState, useCallback } from 'react';\n\nexport function useToggle(initial = false) {\n  const [value, setValue] = useState(initial);\n  const toggle = useCallback(() => setValue(v => !v), []);\n  return [value, toggle] as const;\n}`,
    doc6: `declare module '*.css' {\n  const content: Record<string, string>;\n  export default content;\n}`,
    doc7: `{\n  "name": "demo-app",\n  "version": "1.0.0",\n  "private": true,\n  "dependencies": {\n    "react": "^19.0.0"\n  }\n}`,
  };
  return samples[panelId] || `// ${lang} file content\n// Panel: ${panelId}`;
}
