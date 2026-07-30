import mysql from 'mysql2/promise';
import { config } from './index';

let pool: mysql.Pool;

export async function getDb(): Promise<mysql.Pool> {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query(sql: string, params?: any[]): Promise<any> {
  const db = await getDb();
  const [rows] = await db.execute(sql, params);
  return rows;
}

export async function queryOne(sql: string, params?: any[]): Promise<any> {
  const rows = await query(sql, params);
  return (rows as any[])[0] || null;
}
