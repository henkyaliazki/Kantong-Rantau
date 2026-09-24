import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {TOTP,Secret} from 'otpauth';
const configured=process.env.TEST_DATABASE_URL;if(!configured)throw new Error('Set TEST_DATABASE_URL to a local test database URL.');
const url=new URL(configured);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.pathname.includes('test'))throw new Error('Only a local TEST_DATABASE_URL containing test is accepted.');
const database='kantong_auth_test_'+randomBytes(6).toString('hex');
const adminURL=new URL(url);adminURL.pathname='/';const admin=await mysql.createConnection(adminURL.toString());
const port=3107,base='http://127.0.0.1:'+port;let server,db;let logs='';
const cookieOf=r=>r.headers.get('set-cookie')?.split(';')[0];
async function request(path,method='GET',body,cookie,origin=base){const r=await fetch(base+path,{method,redirect:'manual',headers:{...(cookie?{cookie}:{}),...(method==='GET'?{}:{origin,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});let data=null;if((r.headers.get('content-type')||'').includes('json'))data=await r.json();return {status:r.status,data,cookie:cookieOf(r),headers:r.headers};}
try{
 await admin.query('CREATE DATABASE `'+database+'`');url.pathname='/'+database;db=await mysql.createConnection(url.toString());
 for(const file of (await readdir('drizzle-mysql')).filter(x=>x.endsWith('.sql')).sort()){for(const sql of (await readFile('drizzle-mysql/'+file,'utf8')).split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.query(sql);}
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NODE_ENV:'development',AUTH_INTEGRATION_TEST:'1',DATABASE_URL:url.toString(),AUTH_SECRET:randomBytes(32).toString('hex'),APP_URL:base,GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 for(const stream of [server.stdout,server.stderr])stream.on('data',d=>{logs=(logs+d.toString()).slice(-6000);});
 let ready=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error('Test server exited.');try{const r=await fetch(base+'/api/auth/status');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,'Test server did not start');
 assert.equal((await request('/api/finance?period=2026-09')).status,401);
 const forged=await fetch(base+'/api/finance?period=2026-09',{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged@example.test'}});assert.equal(forged.status,401);
 const credentials={email:'alice@example.test',name:'Alice Test',password:'testing-only-password-123'};
 let a=await request('/api/auth/register','POST',credentials);assert.equal(a.status,200);let alice=a.cookie;assert.ok(alice);assert.match(a.headers.get('set-cookie'),/HttpOnly/i);assert.match(a.headers.get('set-cookie'),/SameSite=lax/i);
 const bob=(await request('/api/auth/register','POST',{...credentials,email:'bob@example.test'})).cookie;
 const dashboard=await fetch(base+'/',{headers:{cookie:alice}});assert.equal(dashboard.headers.get('referrer-policy'),'strict-origin-when-cross-origin');const html=await dashboard.text();assert.ok(html.includes('Buka menu akun'));assert.ok(!html.includes('>Development</span>'));
 for(const origin of ['null','https://evil.example']){const denied=await fetch(base+'/api/auth/logout',{method:'POST',headers:{origin,cookie:alice,accept:'application/json'}});assert.equal(denied.status,403);}
 assert.equal((await request('/api/auth/status','GET',undefined,alice)).data.authenticated,true,'Rejected logout preserves session');
 const budget={period:'2026-09',payday:1,opening:1000000,expected:0,pockets:[{id:'daily',name:'Belanja',kind:'monthly',amount:1000000}]};
 assert.equal((await request('/api/finance','PUT',budget,alice)).status,200);
 assert.equal((await request('/api/finance?period=2026-09','GET',undefined,bob)).data.budget,null);
 const jsonLogout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{origin:base,cookie:bob,accept:'application/json'}});assert.equal(jsonLogout.status,200);assert.equal((await jsonLogout.json()).next,'/login');assert.match(jsonLogout.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await request('/api/auth/status','GET',undefined,bob)).data.authenticated,false);
 assert.equal((await request('/api/finance','PUT',budget,alice,'https://evil.example')).status,403);
 assert.equal((await request('/api/auth/register','POST',credentials)).status,400);
 assert.equal((await request('/api/auth/login','POST',{...credentials,password:'incorrect-password-123'})).status,401);
 assert.equal((await request('/api/auth/logout','POST',{},alice)).status,303);
 assert.equal((await request('/api/finance?period=2026-09','GET',undefined,alice)).status,401);
 alice=(await request('/api/auth/login','POST',credentials)).cookie;
 const setup=await request('/api/auth/mfa-setup','POST',{},alice);assert.equal(setup.status,200);const secret=setup.data.secret;
 const otp=new TOTP({secret:Secret.fromBase32(secret),digits:6,period:30});
 const enable=await request('/api/auth/mfa-enable','POST',{code:otp.generate()},alice);assert.equal(enable.status,200);assert.equal(enable.data.codes.length,10);
 assert.equal((await request('/api/auth/status','GET',undefined,alice)).data.authenticated,false,'Old session revoked after enabling MFA');alice=enable.cookie;
 await request('/api/auth/logout','POST',{},alice);
 const login=await request('/api/auth/login','POST',credentials);assert.equal(login.data.next,'/verify-2fa');let pending=login.cookie;
 assert.equal((await request('/api/finance?period=2026-09','GET',undefined,pending)).status,401);
 assert.equal((await request('/api/auth/verify-2fa','POST',{code:'invalid'},pending)).status,401);
 let verify=await request('/api/auth/verify-2fa','POST',{code:enable.data.codes[0]},pending);assert.equal(verify.status,200);alice=verify.cookie;
 assert.equal((await request('/api/auth/status','GET',undefined,pending)).data.authenticated,false);
 pending=(await request('/api/auth/login','POST',credentials)).cookie;
 assert.equal((await request('/api/auth/verify-2fa','POST',{code:enable.data.codes[0]},pending)).status,401,'Recovery code cannot be reused');
 const futureCode=otp.generate({timestamp:Date.now()+30000});verify=await request('/api/auth/verify-2fa','POST',{code:futureCode},pending);assert.equal(verify.status,200);alice=verify.cookie;
 pending=(await request('/api/auth/login','POST',credentials)).cookie;
 assert.equal((await request('/api/auth/verify-2fa','POST',{code:futureCode},pending)).status,401,'Authenticator code cannot be replayed');
 const disabled=await request('/api/auth/mfa-disable','POST',{code:enable.data.codes[1]},alice);assert.equal(disabled.status,200);alice=disabled.cookie;
 assert.equal((await request('/api/auth/status','GET',undefined,alice)).data.mfaEnabled,false);
 assert.equal((await request('/api/auth/status','GET',undefined,pending)).data.pendingMfa,false);
 const [[user]]=await db.execute('SELECT password_hash,totp_secret FROM auth_users WHERE email=?',[credentials.email]);assert.match(user.password_hash,/^scrypt\$/);assert.notEqual(user.password_hash,credentials.password);
 const hash=createHash('sha256').update(alice.split('=')[1]).digest('hex');await db.execute('UPDATE auth_sessions SET expires=1 WHERE token_hash=?',[hash]);assert.equal((await request('/api/auth/status','GET',undefined,alice)).data.authenticated,false);
 for(let i=0;i<10;i++)assert.equal((await request('/api/auth/login','POST',{email:'missing@example.test',password:credentials.password})).status,401);
 assert.equal((await request('/api/auth/login','POST',{email:'missing@example.test',password:credentials.password})).status,429);
 assert.equal((await request('/api/auth/google','POST',{})).status,503,'Google clearly disabled without credentials');
 assert.equal((await request('/api/local-auth','POST',{})).status,410,'No legacy auto-login');
 console.log('MySQL/HTTP auth checks passed: register/login/logout, header spoofing, ownership, CSRF, 2FA, recovery, replay, expiry, rate limit and Google configuration guard.');
}catch(error){console.error('Authentication integration failed:',error.message);console.error(logs);throw error;}
finally{if(server){if(process.platform==='win32'){await new Promise(resolve=>{const p=spawn('taskkill',['/pid',String(server.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});p.on('exit',resolve);p.on('error',resolve);});}else server.kill();server.stdout.destroy();server.stderr.destroy();server.unref();}if(db)await db.end();if(/^kantong_auth_test_[a-f0-9]{12}$/.test(database))await admin.query('DROP DATABASE `'+database+'`');await admin.end();}
