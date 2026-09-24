import {redirect} from 'next/navigation';
import {session} from '@/lib/auth';
import AuthForm from '../auth-form';
export const dynamic='force-dynamic';
export default async function Verify(){const user=await session(true);if(!user)redirect('/login');if(user.verified)redirect('/');return <AuthForm mode="verify-2fa" googleEnabled={false} development={process.env.NODE_ENV==='development'}/>;}
