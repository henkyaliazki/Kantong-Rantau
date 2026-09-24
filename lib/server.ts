import {allowedRequestOrigin} from '@/lib/request-origin';
import {getUser} from '@/lib/auth';
import {row} from '@/db';
import type {RowDataPacket} from 'mysql2';
import {z} from 'zod';
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function identity(req?:Request){const user=await getUser();if(!user)throw new HttpError(401,'Silakan masuk kembali.');if(req&&req.method!=='GET'){if(!req.headers.get('origin')||!allowedRequestOrigin(req))throw new HttpError(403,'Permintaan tidak diizinkan.');}return user;}
export class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
export function failure(e:unknown){if(e instanceof HttpError)return json({error:e.message},e.status);if(e instanceof z.ZodError)return json({error:'Periksa isian: '+e.issues[0].message},400);console.error('Request failed',e instanceof Error?e.message:'Unknown error');return json({error:'Data belum dapat diproses. Coba kembali beberapa saat lagi.'},503);}
export async function body(req:Request){const raw=await req.text();if(raw.length>30000)throw new HttpError(413,'Data terlalu besar.');try{return JSON.parse(raw);}catch{throw new HttpError(400,'Format data tidak valid.');}}
export const periodSchema=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/,'Periode tidak valid');
const money=z.number().int().min(0).max(1000000000000);
export const debtSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(40),total:money.refine(n=>n>0,'Total hutang harus lebih dari nol'),term:z.union([z.literal(1),z.literal(3),z.literal(6),z.literal(12),z.literal(24)]),startPeriod:periodSchema,paidInstallments:z.number().int().min(0).max(24)}).refine(d=>d.total>=d.term&&d.paidInstallments<=d.term,'Jumlah pembayaran atau nominal hutang tidak valid');
export const budgetSchema=z.object({period:periodSchema,sourcePeriod:periodSchema.optional(),payday:z.number().int().min(1).max(31),opening:money,expected:money,pockets:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),name:z.string().trim().min(1).max(40),kind:z.enum(['required','saving','daily','monthly','snack','debt','installment']),amount:money,debtId:z.string().uuid().optional()})).min(1).max(20),newDebts:z.array(debtSchema).max(20).default([])});
export const transactionSchema=z.object({id:z.string().uuid(),period:periodSchema,date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Tanggal tidak valid'),type:z.enum(['income','expense']),amount:money.refine(n=>n>0,'Nominal harus lebih dari nol'),pocket:z.string().max(60),note:z.string().trim().min(1).max(120)});
export async function premium(user:string){const result=await row<RowDataPacket&{expires:number|null}>("SELECT MAX(expires) AS expires FROM orders WHERE user=? AND status='paid' AND mode='production'",[user]);return {active:(result?.expires??0)>Math.floor(Date.now()/1000),expires:result?.expires??null};}
