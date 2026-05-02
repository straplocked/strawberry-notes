import { redirect } from 'next/navigation';
import { getEffectiveSession } from '@/lib/auth/require';
import { Providers } from '@/components/app/Providers';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getEffectiveSession();
  if (!session?.user) redirect('/login');
  return <Providers>{children}</Providers>;
}
