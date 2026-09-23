import Dashboard from './dashboard';
import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
import {Wallet,ShieldCheck,ArrowUpRight} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getChatGPTUser();if(user)return <Dashboard name={user.fullName??'Perantau'}/>;return <main className="auth-card card"><div className="brand"><span className="brand-icon"><Wallet/></span><span>Kantong<span className="brand-sub">Rantau</span></span></div><h1>Jauh dari rumah.<br/>Dekat dengan rencanamu.</h1><p>Catat pengeluaran, sisihkan kebutuhan wajib, dan ketahui batas belanja sampai gajian berikutnya.</p><a className="primary" href={chatGPTSignInPath('/')} target="_top">Masuk dengan ChatGPT <ArrowUpRight size={18}/></a><div className="hint"><ShieldCheck className="inline mr-2" size={17}/>Catatan keuangan disimpan untuk akunmu sendiri.</div><p className="small">Mulai gratis · Premium Rp19.000 / 30 hari</p></main>;}
