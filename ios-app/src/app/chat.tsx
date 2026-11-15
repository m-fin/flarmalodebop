import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { LiveChat } from '@/chat/LiveChat';

export default function ChatScreen() {
  const { ready, session, me, other } = useAuth();
  if (!ready) return null;
  if (!session || !me || !other) return <Redirect href="/login" />;
  return <LiveChat me={me} other={other} />;
}
