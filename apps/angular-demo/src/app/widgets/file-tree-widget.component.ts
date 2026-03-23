import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  expanded?: boolean;
}

@Component({
  selector: 'app-file-tree-widget',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="padding:4px 0;font-size:12px;overflow:auto;height:100%;color:inherit">
      @for (node of tree; track node.name) {
        <ng-container *ngTemplateOutlet="treeNode; context: { node: node, depth: 0 }"></ng-container>
      }
    </div>

    <ng-template #treeNode let-node="node" let-depth="depth">
      <div
        (click)="node.type === 'folder' && toggle(node)"
        [style.padding-left.px]="depth * 16 + 8"
        style="display:flex;align-items:center;gap:4px;padding-top:2px;padding-bottom:2px;line-height:1.8;cursor:default"
        [style.cursor]="node.type === 'folder' ? 'pointer' : 'default'"
      >
        <span style="width:14px;text-align:center;font-size:10px;opacity:0.5">
          {{ node.type === 'folder' ? (node.expanded ? '\u25bc' : '\u25b6') : '' }}
        </span>
        <span style="font-size:12px;opacity:0.6">{{ node.type === 'folder' ? '\ud83d\udcc1' : '\ud83d\udcc4' }}</span>
        <span>{{ node.name }}</span>
      </div>
      @if (node.type === 'folder' && node.expanded && node.children) {
        @for (child of node.children; track child.name) {
          <ng-container *ngTemplateOutlet="treeNode; context: { node: child, depth: depth + 1 }"></ng-container>
        }
      }
    </ng-template>
  `,
})
export class FileTreeWidgetComponent {
  @Input() api: any;
  @Input() panel: any;

  tree: TreeNode[] = [
    {
      name: 'src', type: 'folder', expanded: true, children: [
        { name: 'index.tsx', type: 'file' },
        { name: 'App.tsx', type: 'file' },
        { name: 'styles.css', type: 'file' },
        { name: 'components', type: 'folder', children: [
          { name: 'Header.tsx', type: 'file' },
          { name: 'Footer.tsx', type: 'file' },
          { name: 'Sidebar.tsx', type: 'file' },
        ]},
        { name: 'hooks', type: 'folder', children: [
          { name: 'useTheme.ts', type: 'file' },
          { name: 'useAuth.ts', type: 'file' },
        ]},
        { name: 'utils', type: 'folder', children: [
          { name: 'format.ts', type: 'file' },
          { name: 'validate.ts', type: 'file' },
        ]},
      ]
    },
    { name: 'package.json', type: 'file' },
    { name: 'tsconfig.json', type: 'file' },
    { name: 'README.md', type: 'file' },
  ];

  toggle(node: TreeNode): void {
    node.expanded = !node.expanded;
  }
}
