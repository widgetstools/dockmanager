import { useState } from 'react';
import type { PanelApi } from '@widgetstools/dock-manager-core';

interface TreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  expanded?: boolean;
}

const MOCK_TREE: TreeNode[] = [
  {
    name: 'src', type: 'folder', expanded: true, children: [
      { name: 'index.tsx', type: 'file' },
      { name: 'App.tsx', type: 'file' },
      { name: 'styles.css', type: 'file' },
      {
        name: 'components', type: 'folder', children: [
          { name: 'Header.tsx', type: 'file' },
          { name: 'Footer.tsx', type: 'file' },
          { name: 'Sidebar.tsx', type: 'file' },
        ]
      },
      {
        name: 'hooks', type: 'folder', children: [
          { name: 'useTheme.ts', type: 'file' },
          { name: 'useAuth.ts', type: 'file' },
        ]
      },
      {
        name: 'utils', type: 'folder', children: [
          { name: 'format.ts', type: 'file' },
          { name: 'validate.ts', type: 'file' },
        ]
      },
    ]
  },
  { name: 'package.json', type: 'file' },
  { name: 'tsconfig.json', type: 'file' },
  { name: 'README.md', type: 'file' },
];

/**
 * File tree widget — demonstrates a typical sidebar panel.
 * Clicking a file shows its path via PanelApi on the terminal.
 */
export function FileTreeWidget({ api: _api }: { api: PanelApi }) {
  const [tree, setTree] = useState(MOCK_TREE);

  const toggleFolder = (path: number[]) => {
    setTree(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let node: TreeNode = next[path[0]];
      for (let i = 1; i < path.length; i++) {
        node = node.children![path[i]];
      }
      node.expanded = !node.expanded;
      return next;
    });
  };

  return (
    <div style={{ padding: '4px 0', fontSize: 12, overflow: 'auto', height: '100%' }}>
      {tree.map((node, i) => (
        <TreeItem key={i} node={node} depth={0} path={[i]} onToggle={toggleFolder} />
      ))}
    </div>
  );
}

function TreeItem({ node, depth, path, onToggle }: {
  node: TreeNode; depth: number; path: number[];
  onToggle: (path: number[]) => void;
}) {
  const isFolder = node.type === 'folder';
  const indent = depth * 16 + 8;

  return (
    <>
      <div
        onClick={() => isFolder && onToggle(path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: `2px ${indent}px`, cursor: isFolder ? 'pointer' : 'default',
          lineHeight: 1.8,
        }}
        className="hover:dock-hover"
      >
        <span style={{ width: 14, textAlign: 'center', fontSize: 10, opacity: 0.5 }}>
          {isFolder ? (node.expanded ? '▼' : '▶') : ''}
        </span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {isFolder ? '📁' : '📄'}
        </span>
        <span>{node.name}</span>
      </div>
      {isFolder && node.expanded && node.children?.map((child, i) => (
        <TreeItem key={i} node={child} depth={depth + 1} path={[...path, i]} onToggle={onToggle} />
      ))}
    </>
  );
}
