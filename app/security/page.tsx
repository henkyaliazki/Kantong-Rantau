import {redirect} from 'next/navigation';
import {session} from '@/lib/auth';
import SecurityForm from './security-form';
export const dynamic='force-dynamic';
export default async function Security(){const user=await session();if(!user)redirect('/login');return <SecurityForm initialEnabled={Boolean(user.totp_secret)}/>;}
