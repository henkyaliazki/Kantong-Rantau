import {execute,jsonValue,row,rows,transaction} from '@/db';
import type {RowDataPacket} from 'mysql2';
import {json,identity,failure,body,budgetSchema,transactionSchema,periodSchema,HttpError,premium} from '@/lib/server';
import {periodRange,isSpending,isDebtPocket,debtSummary,type Budget,type Debt,todayJakarta} from '@/lib/finance';
import {paymentConfig} from '@/lib/payments';
export const dynamic='force-dynamic';

type BudgetRow=RowDataPacket&{data:unknown};
type DebtRow=RowDataPacket&{id:string;data:unknown};

export async function GET(req:Request){
 try{
  const user=await identity();const period=periodSchema.parse(new URL(req.url).searchParams.get('period'));
  const [b,tx,plan,orders,debtRows]=await Promise.all([
   row<BudgetRow>('SELECT data FROM budgets WHERE user=? AND period=?',[user.userId,period]),
   rows<RowDataPacket&Record<string,string|number|null>>('SELECT id,period,date,type,amount,pocket,note,debt_id FROM transactions WHERE user=? AND period=? ORDER BY date DESC,id DESC',[user.userId,period]),
   premium(user.userId),rows<RowDataPacket&Record<string,string|number|null>>('SELECT id,amount,status,created,expires,mode,url FROM orders WHERE user=? ORDER BY created DESC LIMIT 10',[user.userId]),
   rows<RowDataPacket&{data:unknown;paid:number}>("SELECT d.data,COALESCE(SUM(t.amount),0) paid FROM debts d LEFT JOIN transactions t ON t.debt_id=d.id AND t.user=d.user AND t.type='expense' WHERE d.user=? GROUP BY d.id,d.data",[user.userId])
  ]);
  const cfg=paymentConfig();return json({user:{name:user.displayName,email:user.email},budget:b?jsonValue(b.data):null,transactions:tx,plan,orders,debts:debtRows.map(d=>({...jsonValue<Debt>(d.data),paid:Number(d.paid)})),paymentReady:!!cfg.key,paymentMode:cfg.mode});
 }catch(e){return failure(e);}
}

export async function PUT(req:Request){
 try{
  const user=await identity(req);const {sourcePeriod,newDebts,...b}=budgetSchema.parse(await body(req));
  const plan=await premium(user.userId);
  await transaction(async db=>{
   const existing=await row<BudgetRow>('SELECT data FROM budgets WHERE user=? AND period=? FOR UPDATE',[user.userId,b.period],db);
   if(sourcePeriod&&sourcePeriod!==b.period&&existing)throw new HttpError(409,'Bulan tujuan sudah mempunyai budget. Pilih bulan itu di ringkasan untuk mengeditnya; budget lama tidak ditimpa.');
   const owned=await rows<DebtRow>('SELECT id,data FROM debts WHERE user=? FOR UPDATE',[user.userId],db);
   const old=existing?jsonValue<Budget>(existing.data):null;
   if(!plan.active&&b.pockets.length>10&&(!old||b.pockets.some(p=>!old.pockets.some(o=>o.id===p.id))))throw new HttpError(403,'Paket Gratis maksimal 10 kantong. Gunakan Premium untuk menambah hingga 20 kantong.');
   if(new Set(b.pockets.map(p=>p.id)).size!==b.pockets.length)throw new HttpError(400,'Kantong harus memiliki identitas unik.');
   if(!b.pockets.some(isSpending))throw new HttpError(400,'Tambahkan setidaknya satu kantong belanja bulanan atau budget jajan.');
   if(b.pockets.reduce((s,p)=>s+p.amount,0)>b.opening+b.expected)throw new HttpError(400,'Total alokasi melebihi saldo awal dan rencana pemasukan.');
   const debtMap=new Map(owned.map(d=>[d.id,jsonValue<Debt>(d.data)]));
   if(new Set(newDebts.map(d=>d.id)).size!==newDebts.length)throw new HttpError(400,'Hutang baru tidak boleh ganda.');
   for(const d of newDebts){
    if(!b.pockets.some(p=>isDebtPocket(p)&&p.debtId===d.id))throw new HttpError(400,'Hutang harus terhubung ke kantong.');
    const saved=debtMap.get(d.id);
    if(saved&&JSON.stringify(saved)!==JSON.stringify(d))throw new HttpError(409,'Rincian hutang yang sudah disimpan tidak boleh diganti melalui budget. Gunakan catatan hutang yang sudah ada.');
    if(!saved){try{await execute('INSERT INTO debts(id,user,data) VALUES(?,?,?)',[d.id,user.userId,JSON.stringify(d)],db);}catch(error){if((error as {code?:string}).code==='ER_DUP_ENTRY')throw new HttpError(409,'Identitas hutang tidak tersedia. Buat ulang kantong hutang.');throw error;}}
    debtMap.set(d.id,d);
   }
   const linked=new Set<string>();
   for(const p of b.pockets){if(isDebtPocket(p)){const d=p.debtId?debtMap.get(p.debtId):null;if(!d)throw new HttpError(400,'Lengkapi rincian atau pilih hutang yang sudah ada.');if(linked.has(d.id))throw new HttpError(400,'Satu hutang hanya dapat memakai satu kantong dalam periode yang sama.');if((p.kind==='debt'&&d.term!==1)||(p.kind==='installment'&&d.term===1))throw new HttpError(400,'Jenis kantong tidak sesuai tenor hutang.');if(b.period<d.startPeriod)throw new HttpError(400,'Periode budget tidak boleh sebelum bulan mulai hutang.');if(p.amount>d.total)throw new HttpError(400,'Alokasi pembayaran tidak boleh melebihi total hutang.');linked.add(d.id);}else if(p.debtId)throw new HttpError(400,'Hanya kantong hutang/cicilan yang dapat terhubung ke hutang.');}
   const tx=await rows<RowDataPacket&{pocket:string;date:string;type:string;debt_id:string|null}>('SELECT pocket,date,type,debt_id FROM transactions WHERE user=? AND period=?',[user.userId,b.period],db);const range=periodRange(b.period,b.payday);
   if(tx.some(t=>t.date<range.start||t.date>range.end||(t.type==='expense'&&!b.pockets.some(p=>p.id===t.pocket&&(p.debtId??null)===(t.debt_id??null)))))throw new HttpError(400,'Tanggal, kantong, atau hubungan hutang masih digunakan transaksi. Edit transaksinya terlebih dahulu.');
   const others=await rows<BudgetRow>('SELECT data FROM budgets WHERE user=? AND period<>?',[user.userId,b.period],db);
   if(others.some(item=>{const o=jsonValue<Budget>(item.data);const r=periodRange(o.period,o.payday);return range.start<=r.end&&range.end>=r.start;}))throw new HttpError(400,'Tanggal periode bertumpang tindih dengan budget lain. Samakan tanggal gajian.');
   if(sourcePeriod&&sourcePeriod!==b.period)await execute('INSERT INTO budgets(user,period,data) VALUES(?,?,?)',[user.userId,b.period,JSON.stringify(b)],db);
   else await execute('INSERT INTO budgets(user,period,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',[user.userId,b.period,JSON.stringify(b)],db);
  });return json({ok:true,period:b.period});
 }catch(e){return failure(e);}
}

export async function POST(req:Request){
 try{
  const user=await identity(req);const t=transactionSchema.parse(await body(req));
  await transaction(async db=>{
   const budgetRow=await row<BudgetRow>('SELECT data FROM budgets WHERE user=? AND period=?',[user.userId,t.period],db);if(!budgetRow)throw new HttpError(400,'Atur budget periode ini terlebih dahulu.');
   const b=jsonValue<Budget>(budgetRow.data);const range=periodRange(b.period,b.payday);if(t.date<range.start||t.date>range.end||t.date>todayJakarta())throw new HttpError(400,'Tanggal harus berada dalam periode dan tidak boleh di masa depan.');
   const pocket=b.pockets.find(p=>p.id===t.pocket);if(t.type==='expense'&&!pocket)throw new HttpError(400,'Pilih kantong yang tersedia.');
   const debtId=t.type==='expense'&&pocket&&isDebtPocket(pocket)?pocket.debtId??null:null;
   const current=await row<RowDataPacket&{user:string;period:string;debt_id:string|null}>('SELECT user,period,debt_id FROM transactions WHERE id=? FOR UPDATE',[t.id],db);
   if(current&&(current.user!==user.userId||current.period!==t.period))throw new HttpError(409,'Transaksi tidak dapat diperbarui. Muat ulang data.');
   const lockIds=[...new Set([current?.debt_id,debtId].filter((id):id is string=>!!id))].sort();
   for(const id of lockIds)await row<RowDataPacket&{id:string}>('SELECT id FROM debts WHERE id=? FOR UPDATE',[id],db);
   if(debtId){const saved=await row<DebtRow>('SELECT id,data FROM debts WHERE id=? AND user=?',[debtId,user.userId],db);if(!saved)throw new HttpError(400,'Hutang tidak ditemukan.');const debt=jsonValue<Debt>(saved.data);const capacity=debt.total-debtSummary(debt).initial;const paid=await row<RowDataPacket&{total:number}>("SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE user=? AND debt_id=? AND type='expense' AND id<>?",[user.userId,debtId,t.id],db);if(Number(paid?.total??0)+t.amount>capacity)throw new HttpError(409,'Pembayaran melebihi sisa hutang atau transaksi tidak dapat diperbarui. Muat ulang data.');}
   await execute(`INSERT INTO transactions(id,user,period,date,type,amount,pocket,note,debt_id) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE date=VALUES(date),type=VALUES(type),amount=VALUES(amount),pocket=VALUES(pocket),note=VALUES(note),debt_id=VALUES(debt_id)`,[t.id,user.userId,t.period,t.date,t.type,t.amount,t.type==='income'?'':t.pocket,t.note,debtId],db);
  });return json({ok:true});
 }catch(e){return failure(e);}
}

export async function DELETE(req:Request){try{const user=await identity(req);const input=await body(req);if(typeof input.id!=='string')throw new HttpError(400,'Transaksi tidak valid.');await transaction(async db=>{const current=await row<RowDataPacket&{debt_id:string|null}>('SELECT debt_id FROM transactions WHERE id=? AND user=? FOR UPDATE',[input.id,user.userId],db);if(current?.debt_id)await row<RowDataPacket&{id:string}>('SELECT id FROM debts WHERE id=? FOR UPDATE',[current.debt_id],db);await execute('DELETE FROM transactions WHERE id=? AND user=?',[input.id,user.userId],db);});return json({ok:true});}catch(e){return failure(e);}}
