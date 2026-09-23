import {database,json,identity,failure,body,budgetSchema,transactionSchema,periodSchema,HttpError,premium} from '@/lib/server';
import {periodRange,isSpending,isDebtPocket,debtSummary,type Budget,type Debt,todayJakarta} from '@/lib/finance';
import {paymentConfig} from '@/lib/payments';
export const dynamic='force-dynamic';

export async function GET(req:Request){
 try{
  const user=await identity();const period=periodSchema.parse(new URL(req.url).searchParams.get('period'));const db=database();
  const [b,tx,plan,orders,debtRows]=await Promise.all([
   db.prepare('SELECT data FROM budgets WHERE user=? AND period=?').bind(user.userId,period).first<{data:string}>(),
   db.prepare('SELECT id,period,date,type,amount,pocket,note,debt_id FROM transactions WHERE user=? AND period=? ORDER BY date DESC,id DESC').bind(user.userId,period).all(),
   premium(user.userId),db.prepare('SELECT id,amount,status,created,expires,mode,url FROM orders WHERE user=? ORDER BY created DESC LIMIT 10').bind(user.userId).all(),
   db.prepare("SELECT d.data,COALESCE(SUM(t.amount),0) paid FROM debts d LEFT JOIN transactions t ON t.debt_id=d.id AND t.user=d.user AND t.type='expense' WHERE d.user=? GROUP BY d.id").bind(user.userId).all<{data:string;paid:number}>()
  ]);
  const cfg=paymentConfig();return json({user:{name:user.displayName,email:user.email},budget:b?JSON.parse(b.data):null,transactions:tx.results,plan,orders:orders.results,debts:debtRows.results.map(d=>({...JSON.parse(d.data),paid:d.paid})),paymentReady:!!cfg.key,paymentMode:cfg.mode});
 }catch(e){return failure(e);}
}

export async function PUT(req:Request){
 try{
  const user=await identity(req);const {sourcePeriod,newDebts,...b}=budgetSchema.parse(await body(req));const db=database();
  const [plan,existing,owned]=await Promise.all([premium(user.userId),db.prepare('SELECT data FROM budgets WHERE user=? AND period=?').bind(user.userId,b.period).first<{data:string}>(),db.prepare('SELECT id,data FROM debts WHERE user=?').bind(user.userId).all<{id:string;data:string}>()]);
  if(sourcePeriod&&sourcePeriod!==b.period&&existing)throw new HttpError(409,'Bulan tujuan sudah mempunyai budget. Pilih bulan itu di ringkasan untuk mengeditnya; budget lama tidak ditimpa.');
  // Expired Premium users can maintain existing pockets without adding new ones above the free limit.
  const old=existing?JSON.parse(existing.data) as Budget:null;
  if(!plan.active&&b.pockets.length>10&&(!old||b.pockets.some(p=>!old.pockets.some(o=>o.id===p.id))))throw new HttpError(403,'Paket Gratis maksimal 10 kantong. Gunakan Premium untuk menambah hingga 20 kantong.');
  if(new Set(b.pockets.map(p=>p.id)).size!==b.pockets.length)throw new HttpError(400,'Kantong harus memiliki identitas unik.');
  if(!b.pockets.some(isSpending))throw new HttpError(400,'Tambahkan setidaknya satu kantong belanja bulanan atau budget jajan.');
  if(b.pockets.reduce((s,p)=>s+p.amount,0)>b.opening+b.expected)throw new HttpError(400,'Total alokasi melebihi saldo awal dan rencana pemasukan.');
  const debtMap=new Map(owned.results.map(d=>[d.id,JSON.parse(d.data) as Debt]));
  const statements:D1PreparedStatement[]=[];
  if(new Set(newDebts.map(d=>d.id)).size!==newDebts.length)throw new HttpError(400,'Hutang baru tidak boleh ganda.');
  for(const d of newDebts){
   if(!b.pockets.some(p=>isDebtPocket(p)&&p.debtId===d.id))throw new HttpError(400,'Hutang harus terhubung ke kantong.');
   const saved=debtMap.get(d.id);
   if(saved&&JSON.stringify(saved)!==JSON.stringify(d))throw new HttpError(409,'Rincian hutang yang sudah disimpan tidak boleh diganti melalui budget. Gunakan catatan hutang yang sudah ada.');
   if(!saved){const conflict=await db.prepare('SELECT id FROM debts WHERE id=?').bind(d.id).first();if(conflict)throw new HttpError(409,'Identitas hutang tidak tersedia. Buat ulang kantong hutang.');statements.push(db.prepare('INSERT INTO debts(id,user,data) VALUES(?,?,?)').bind(d.id,user.userId,JSON.stringify(d)));}
   debtMap.set(d.id,d);
  }
  const linked=new Set<string>();
  for(const p of b.pockets){
   if(isDebtPocket(p)){
    const d=p.debtId?debtMap.get(p.debtId):null;
    if(!d)throw new HttpError(400,'Lengkapi rincian atau pilih hutang yang sudah ada.');
    if(linked.has(d.id))throw new HttpError(400,'Satu hutang hanya dapat memakai satu kantong dalam periode yang sama.');
    if((p.kind==='debt'&&d.term!==1)||(p.kind==='installment'&&d.term===1))throw new HttpError(400,'Jenis kantong tidak sesuai tenor hutang.');
    if(b.period<d.startPeriod)throw new HttpError(400,'Periode budget tidak boleh sebelum bulan mulai hutang.');
    if(p.amount>d.total)throw new HttpError(400,'Alokasi pembayaran tidak boleh melebihi total hutang.');
    linked.add(d.id);
   }else if(p.debtId)throw new HttpError(400,'Hanya kantong hutang/cicilan yang dapat terhubung ke hutang.');
  }
  const tx=await db.prepare('SELECT pocket,date,type,debt_id FROM transactions WHERE user=? AND period=?').bind(user.userId,b.period).all<{pocket:string;date:string;type:string;debt_id:string|null}>();
  const range=periodRange(b.period,b.payday);
  if(tx.results.some(t=>t.date<range.start||t.date>range.end||(t.type==='expense'&&!b.pockets.some(p=>p.id===t.pocket&&(p.debtId??null)===(t.debt_id??null)))))throw new HttpError(400,'Tanggal, kantong, atau hubungan hutang masih digunakan transaksi. Edit transaksinya terlebih dahulu.');
  const others=await db.prepare('SELECT data FROM budgets WHERE user=? AND period<>?').bind(user.userId,b.period).all<{data:string}>();
  if(others.results.some(row=>{const o=JSON.parse(row.data) as Budget;const r=periodRange(o.period,o.payday);return range.start<=r.end&&range.end>=r.start;}))throw new HttpError(400,'Tanggal periode bertumpang tindih dengan budget lain. Samakan tanggal gajian.');
  const copying=sourcePeriod&&sourcePeriod!==b.period;
  statements.push(db.prepare('INSERT INTO budgets(user,period,data) VALUES(?,?,?)'+(copying?'':' ON CONFLICT(user,period) DO UPDATE SET data=excluded.data')).bind(user.userId,b.period,JSON.stringify(b)));
  await db.batch(statements);return json({ok:true,period:b.period});
 }catch(e){return failure(e);}
}

export async function POST(req:Request){
 try{
  const user=await identity(req);const t=transactionSchema.parse(await body(req));const db=database();
  const row=await db.prepare('SELECT data FROM budgets WHERE user=? AND period=?').bind(user.userId,t.period).first<{data:string}>();
  if(!row)throw new HttpError(400,'Atur budget periode ini terlebih dahulu.');
  const b=JSON.parse(row.data) as Budget;const range=periodRange(b.period,b.payday);
  if(t.date<range.start||t.date>range.end||t.date>todayJakarta())throw new HttpError(400,'Tanggal harus berada dalam periode dan tidak boleh di masa depan.');
  const pocket=b.pockets.find(p=>p.id===t.pocket);
  if(t.type==='expense'&&!pocket)throw new HttpError(400,'Pilih kantong yang tersedia.');
  const debtId=t.type==='expense'&&pocket&&isDebtPocket(pocket)?pocket.debtId??null:null;
  let debtCapacity=0;
  if(debtId){const saved=await db.prepare('SELECT data FROM debts WHERE id=? AND user=?').bind(debtId,user.userId).first<{data:string}>();if(!saved)throw new HttpError(400,'Hutang tidak ditemukan.');const d=JSON.parse(saved.data) as Debt;debtCapacity=d.total-debtSummary(d).initial;}
  // The remaining-debt predicate is part of the write so concurrent payments cannot overpay.
  const result=await db.prepare(`INSERT INTO transactions(id,user,period,date,type,amount,pocket,note,debt_id)
   SELECT ?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR ? <= ?-COALESCE((SELECT SUM(amount) FROM transactions WHERE user=? AND debt_id=? AND type='expense' AND id<>?),0)
   ON CONFLICT(id) DO UPDATE SET date=excluded.date,type=excluded.type,amount=excluded.amount,pocket=excluded.pocket,note=excluded.note,debt_id=excluded.debt_id
   WHERE transactions.user=excluded.user AND transactions.period=excluded.period`)
   .bind(t.id,user.userId,t.period,t.date,t.type,t.amount,t.type==='income'?'':t.pocket,t.note,debtId,debtId,t.amount,debtCapacity,user.userId,debtId,t.id).run();
  if(!result.meta.changes)throw new HttpError(409,'Pembayaran melebihi sisa hutang atau transaksi tidak dapat diperbarui. Muat ulang data.');
  return json({ok:true});
 }catch(e){return failure(e);}
}
export async function DELETE(req:Request){try{const user=await identity(req);const input=await body(req);if(typeof input.id!=='string')throw new HttpError(400,'Transaksi tidak valid.');await database().prepare('DELETE FROM transactions WHERE id=? AND user=?').bind(input.id,user.userId).run();return json({ok:true});}catch(e){return failure(e);}}
