import {OAuth2Client} from 'google-auth-library';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {row,execute,transaction} from '@/db';
import type {RowDataPacket} from 'mysql2';
import {appOrigin,googleReady,now,AuthError,issueSession,type AuthUser} from '@/lib/auth';
import {digest,decrypt} from '@/lib/auth-crypto';
export const runtime='nodejs';
export async function GET(req:Request){
 try{
  if(!googleReady())throw new AuthError(503,'Google belum dikonfigurasi.');
  const query=new URL(req.url).searchParams;const state=query.get('state'),code=query.get('code'),browser=(await cookies()).get('rantau-oauth')?.value;
  if(!state||!code||!browser||!/^[a-f0-9]{64}$/.test(state))throw new AuthError(400,'OAuth tidak valid.');
  const flow=await transaction(async db=>{const entry=await row<RowDataPacket&{payload:string;expires:number}>('SELECT payload,expires FROM auth_oauth_states WHERE state_hash=? FOR UPDATE',[digest(state)],db);if(!entry||entry.expires<now())throw new AuthError(400,'OAuth kedaluwarsa.');const payload=JSON.parse(decrypt(entry.payload)) as {nonce:string;verifier:string;browser:string};if(payload.browser!==digest(browser))throw new AuthError(403,'Browser OAuth tidak sesuai.');await execute('DELETE FROM auth_oauth_states WHERE state_hash=?',[digest(state)],db);return payload;});
  const client=new OAuth2Client(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,appOrigin()+'/api/auth/google/callback');
  const {tokens}=await client.getToken({code,codeVerifier:flow.verifier});if(!tokens.id_token)throw new AuthError(401,'Google tidak mengembalikan identitas.');
  const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:process.env.GOOGLE_CLIENT_ID});const profile=ticket.getPayload();
  if(!profile||!profile.email||!profile.email_verified||!profile.sub||(profile as unknown as {nonce:string}).nonce!==flow.nonce)throw new AuthError(401,'Identitas Google tidak valid.');
  return await transaction(async db=>{
   let user=await row<AuthUser>('SELECT * FROM auth_users WHERE google_sub=? FOR UPDATE',[profile.sub],db);
   if(!user){const email=profile.email!.trim().toLowerCase();const existing=await row('SELECT id FROM auth_users WHERE email=?',[email],db);if(existing)throw new AuthError(409,'email-exists');const id=randomUUID();await execute('INSERT INTO auth_users(id,email,name,google_sub,created) VALUES(?,?,?,?,?)',[id,email,(profile.name||email).slice(0,80),profile.sub,now()],db);user=(await row<AuthUser>('SELECT * FROM auth_users WHERE id=?',[id],db))!;}
   const verified=!user.totp_secret;const result=NextResponse.redirect(new URL(verified?'/':'/verify-2fa',appOrigin()));result.cookies.delete('rantau-oauth');return issueSession(user,verified,result,db);
  });
 }catch(error){const reason=error instanceof AuthError&&error.message==='email-exists'?'email-exists':'google-failed';const result=NextResponse.redirect(new URL('/login?error='+reason,appOrigin()));result.cookies.delete('rantau-oauth');return result;}
}
