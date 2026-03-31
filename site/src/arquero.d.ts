declare module 'arquero' {
  export function from(data: object[]): ColumnTable
  export const op: Record<string, (...args: any[]) => any>

  export interface ColumnTable {
    filter(expr: (d: any) => boolean): ColumnTable
    derive(defs: Record<string, (d: any) => any>): ColumnTable
    groupby(...keys: string[]): ColumnTable
    rollup(defs: Record<string, (d: any) => any>): ColumnTable
    orderby(...keys: (string | { [key: string]: string })[]): ColumnTable
    slice(start: number, end?: number): ColumnTable
    select(...columns: string[]): ColumnTable
    columnNames(): string[]
    numRows(): number
    objects(): Record<string, any>[]
    array(column: string): any[]
    get(column: string, row: number): any
  }
}
