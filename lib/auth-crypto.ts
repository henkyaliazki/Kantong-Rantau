import {randomBytes,createHash,scrypt,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {TOTP,Secret} from 'otpauth';
export const token=()=>randomBytes(32).toString('hex');
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function derive(password:string,salt:string){return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:192*1024*1024},(error,result)=>error?reject(error):resolve(result)));}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${(await derive(password,salt)).toString('hex')}`;}
export async function verifyPassword(password:string,stored:string|null){
 const [algorithm,salt,expected]=stored?.split('$')??[];
 const valid=algorithm==='scrypt'&&/^[a-f0-9]{32}$/.test(salt??'')&&/^[a-f0-9]{128}$/.test(expected??'');
 const actual=await derive(password,valid?salt:'00000000000000000000000000000000');
 return valid&&timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
function key(){const secret=process.env.AUTH_SECRET;if(!secret||!/^[a-f0-9]{64}$/i.test(secret))throw new Error('AUTH_SECRET harus berupa 32 byte hex.');return Buffer.from(secret,'hex');}
export function encrypt(value:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),data.toString('hex')].join('.');}
export function decrypt(value:string){const [iv,tag,data]=value.split('.');const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]).toString('utf8');}
export function makeTotp(secret:string,email='akun'){return new TOTP({issuer:'Kantong Rantau',label:email,algorithm:'SHA1',digits:6,period:30,secret:Secret.fromBase32(secret)});}
export function totpStep(secret:string,code:string,now=Date.now()){if(!/^\d{6}$/.test(code))return null;const delta=makeTotp(secret).validate({token:code,window:1,timestamp:now});return delta===null?null:Math.floor(now/30000)+delta;}
export const newTotpSecret=()=>new Secret({size:20}).base32;
