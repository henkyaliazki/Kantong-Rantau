import mysql, {type Pool,type PoolConnection,type ResultSetHeader,type RowDataPacket} from "mysql2/promise";
import {drizzle} from "drizzle-orm/mysql2";
import * as schema from "./schema";

declare global { var __kantongRantauPool: Pool | undefined; }
function databaseUrl(){const value=process.env.DATABASE_URL;if(!value)throw new Error('DATABASE_URL belum diatur. Salin .env.example ke .env.local lalu isi koneksi MySQL lokal.');return value;}
export function pool(){return globalThis.__kantongRantauPool ??= mysql.createPool({uri:databaseUrl(),connectionLimit:10,decimalNumbers:true,supportBigNumbers:true,bigNumberStrings:false,timezone:'Z'});}
export function getDb(){return drizzle(pool(),{schema,mode:'default'});}
export type SqlExecutor=Pool|PoolConnection;
type SqlValue=string|number|boolean|Date|Buffer|null;
export async function rows<T extends RowDataPacket>(sql:string,params:SqlValue[]=[],db:SqlExecutor=pool()){const [result]=await db.execute<T[]>(sql,params);return result;}
export async function row<T extends RowDataPacket>(sql:string,params:SqlValue[]=[],db:SqlExecutor=pool()){return (await rows<T>(sql,params,db))[0]??null;}
export async function execute(sql:string,params:SqlValue[]=[],db:SqlExecutor=pool()){const [result]=await db.execute<ResultSetHeader>(sql,params);return result;}
export async function transaction<T>(fn:(connection:PoolConnection)=>Promise<T>){const connection=await pool().getConnection();try{await connection.beginTransaction();const result=await fn(connection);await connection.commit();return result;}catch(error){await connection.rollback();throw error;}finally{connection.release();}}
export function jsonValue<T>(value:unknown):T{return (typeof value==='string'?JSON.parse(value):value) as T;}
export async function closePool(){if(globalThis.__kantongRantauPool){const current=globalThis.__kantongRantauPool;globalThis.__kantongRantauPool=undefined;await current.end();}}
