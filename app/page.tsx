import {redirect} from 'next/navigation';
import {getUser} from '@/lib/auth';
import Dashboard from './dashboard';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getUser();if(!user)redirect('/login');return <Dashboard name={user.fullName}/>;}
