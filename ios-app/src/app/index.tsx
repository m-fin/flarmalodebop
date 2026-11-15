import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';

export default function Index() {
  const { session } = useAuth();
  if (session) return <Redirect href="/chat" />;
  return <Redirect href="/login" />;
}
