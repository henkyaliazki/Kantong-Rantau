import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {execute} from '@/db';
import {appOrigin,googleReady,checkOrigin,rateLimit,authFailure,AuthError,now} from '@/lib/auth';
import {token,digest,encrypt} from '@/lib/auth-crypto';
export const runtime='nodejs';
export async function POST(req:Request){try{
 checkOrigin(req);if(!googleReady())throw new AuthError(503,'Login Google belum dikonfigurasi.');
 // Use one configured callback origin so OAuth cookies and state stay on the same host.
 if(req.headers.get('origin')!==appOrigin())throw new AuthError(400,`Gunakan ${appOrigin()} untuk masuk dengan Google.`);
 await rateLimit('google-start','all',100);
 const state=token(),nonce=token(),verifier=token(),browser=token();
 await execute('INSERT INTO auth_oauth_states(state_hash,payload,expires) VALUES(?,?,?)',[digest(state),encrypt(JSON.stringify({nonce,verifier,browser:digest(browser)})),now()+600]);
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:appOrigin()+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
 const result=NextResponse.redirect(url,303);result.cookies.set('rantau-oauth',browser,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:600});result.headers.set('Cache-Control','no-store');return result;
 }catch(e){return authFailure(e);}}
