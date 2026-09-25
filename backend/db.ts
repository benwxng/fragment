import { Pool, type PoolClient } from 'pg';
import { attachDatabasePool } from '@neon/functions';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

export async function asOwner<T>(userId: string, operation: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query('set local role refer_app');
    await db.query("select set_config('refer.user_id', $1, true)", [userId]);
    const result = await operation(db);
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}
