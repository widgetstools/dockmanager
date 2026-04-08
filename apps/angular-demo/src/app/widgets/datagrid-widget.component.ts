import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  colorSchemeDarkBlue,
} from 'ag-grid-community';

type ColDef = any;
type ValueFormatterParams = { value: any };

ModuleRegistry.registerModules([AllCommunityModule]);

const themeDark = themeQuartz.withPart(colorSchemeDarkBlue);

interface Row {
  make: string;
  model: string;
  price: number;
  electric: boolean;
  year: number;
}

@Component({
  selector: 'app-datagrid-widget',
  standalone: true,
  imports: [AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="width:100%;height:100%">
      <ag-grid-angular
        style="width:100%;height:100%"
        [theme]="theme"
        [rowData]="rowData"
        [columnDefs]="columnDefs"
        [defaultColDef]="defaultColDef"
        [rowSelection]="rowSelection"
        [pagination]="true"
        [paginationPageSize]="10">
      </ag-grid-angular>
    </div>
  `,
})
export class DataGridWidgetComponent {
  @Input() api: any;
  @Input() panel: any;

  theme = themeDark;
  rowSelection = { mode: 'multiRow' as const };

  rowData: Row[] = [
    { make: 'Tesla', model: 'Model Y', price: 64950, electric: true, year: 2024 },
    { make: 'Ford', model: 'F-150 Lightning', price: 55974, electric: true, year: 2024 },
    { make: 'Toyota', model: 'Corolla', price: 29600, electric: false, year: 2023 },
    { make: 'Mercedes', model: 'EQA', price: 48890, electric: true, year: 2024 },
    { make: 'Fiat', model: '500e', price: 32500, electric: true, year: 2024 },
    { make: 'Nissan', model: 'Leaf', price: 28040, electric: true, year: 2023 },
    { make: 'Vauxhall', model: 'Corsa', price: 18460, electric: false, year: 2022 },
    { make: 'Volvo', model: 'EX30', price: 33795, electric: true, year: 2024 },
    { make: 'Mercedes', model: 'Maybach', price: 175720, electric: false, year: 2023 },
    { make: 'Porsche', model: 'Taycan', price: 92550, electric: true, year: 2024 },
    { make: 'Jaguar', model: 'I-PACE', price: 69425, electric: true, year: 2023 },
    { make: 'BMW', model: 'i5', price: 66800, electric: true, year: 2024 },
    { make: 'Audi', model: 'Q4 e-tron', price: 52200, electric: true, year: 2024 },
    { make: 'Hyundai', model: 'Ioniq 6', price: 42715, electric: true, year: 2024 },
    { make: 'Kia', model: 'EV6', price: 42600, electric: true, year: 2023 },
  ];

  columnDefs: ColDef[] = [
    { field: 'make', headerName: 'Make', minWidth: 120 },
    { field: 'model', headerName: 'Model', minWidth: 150 },
    {
      field: 'price',
      headerName: 'Price',
      filter: 'agNumberColumnFilter',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? `$${p.value.toLocaleString()}` : '',
    },
    { field: 'year', headerName: 'Year', maxWidth: 100 },
    {
      field: 'electric',
      headerName: 'EV',
      maxWidth: 80,
      valueFormatter: (p: ValueFormatterParams) => (p.value ? '⚡' : ''),
    },
  ];

  defaultColDef: ColDef = {
    flex: 1,
    minWidth: 90,
    filter: true,
    sortable: true,
    resizable: true,
  };
}
