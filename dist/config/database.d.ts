import mysql from 'mysql2/promise';
export declare function getDb(): Promise<mysql.Pool>;
export declare function query(sql: string, params?: any[]): Promise<any>;
export declare function queryOne(sql: string, params?: any[]): Promise<any>;
//# sourceMappingURL=database.d.ts.map