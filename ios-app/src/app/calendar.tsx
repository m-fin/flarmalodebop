import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { CalendarView } from '@/components/CalendarView';

export default function CalendarScreen() {
  const { ready, session, me, other } = useAuth();
  if (!ready) return null;
  if (!session || !me || !other) return <Redirect href="/login" />;
  return <CalendarView me={me} other={other} />;
}
