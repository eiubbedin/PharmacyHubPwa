declare module "sql.js" {
  type SqlJsConfig = {
    locateFile?: (file: string) => string;
  };

  type ExecResult = {
    columns: string[];
    values: any[][];
  };

  type Database = {
    exec: (sql: string) => ExecResult[];
  };

  type SqlJsStatic = {
    Database: new (data?: Uint8Array) => Database;
  };

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
