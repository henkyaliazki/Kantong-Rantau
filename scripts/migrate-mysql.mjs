import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL belum diatur. Isi .env.local, lalu muat variabelnya di PowerShell sebelum menjalankan migrasi.');
const connection=await mysql.createConnection(process.env.DATABASE_URL);
try{
 await connection.execute('CREATE TABLE IF NOT EXISTS app_migrations (name varchar(255) PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
 const files=(await readdir('drizzle-mysql')).filter(name=>name.endsWith('.sql')).sort();
 for(const name of files){
  const sql=await readFile(`drizzle-mysql/${name}`,'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const [[applied]]=await connection.execute('SELECT checksum FROM app_migrations WHERE name=?',[name]);
  if(applied){if(applied.checksum!==checksum)throw new Error(`Migrasi yang sudah diterapkan berubah: ${name}`);continue;}
  for(const statement of sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))await connection.query(statement);
  await connection.execute('INSERT INTO app_migrations(name,checksum) VALUES(?,?)',[name,checksum]);
  console.log(`Applied ${name}`);
 }
 console.log('MySQL migrations are up to date.');
}finally{await connection.end();}
