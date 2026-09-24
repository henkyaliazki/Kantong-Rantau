import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';

const [file]=process.argv.slice(2);
if(!file)throw new Error('Usage: node scripts/migrate-json-to-mysql.mjs <export.json>');
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL in this terminal before importing.');
const data=JSON.parse(await readFile(file,'utf8'));
for(const name of ['budgets','debts','orders','transactions'])if(!Array.isArray(data[name]))throw new Error(`Missing array: ${name}`);
const connection=await mysql.createConnection(process.env.DATABASE_URL);
try{
 await connection.beginTransaction();
 for(const item of data.budgets)await connection.execute('INSERT INTO budgets(user,period,data) VALUES(?,?,?)',[item.user,item.period,typeof item.data==='string'?item.data:JSON.stringify(item.data)]);
 for(const item of data.debts)await connection.execute('INSERT INTO debts(id,user,data) VALUES(?,?,?)',[item.id,item.user,typeof item.data==='string'?item.data:JSON.stringify(item.data)]);
 for(const item of data.orders)await connection.execute('INSERT INTO orders(id,user,amount,status,url,created,expires,mode) VALUES(?,?,?,?,?,?,?,?)',[item.id,item.user,item.amount,item.status,item.url??null,item.created,item.expires??null,item.mode]);
 for(const item of data.transactions)await connection.execute('INSERT INTO transactions(id,user,period,date,type,amount,pocket,note,debt_id) VALUES(?,?,?,?,?,?,?,?,?)',[item.id,item.user,item.period,item.date,item.type,item.amount,item.pocket,item.note,item.debt_id??null]);
 await connection.commit();
 console.log(`Imported ${data.budgets.length} budgets, ${data.debts.length} debts, ${data.orders.length} orders, and ${data.transactions.length} transactions.`);
}catch(error){await connection.rollback();throw error;}finally{await connection.end();}
