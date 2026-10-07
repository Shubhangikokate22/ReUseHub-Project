import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ActionButton, cardStyle, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

type Message = { id: string; body: string; senderId: string; readAt: string | null; createdAt: string; sender: { id: string; name: string } };
export default function ChatScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [completed, setCompleted] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!token || !requestId) return;
    try { const data = await apiRequest<{ messages: Message[]; request: { status: string } }>(`/chats/${requestId}/messages`, { token }); setMessages(data.messages); setCompleted(data.request.status === 'COMPLETED'); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load this conversation.'); }
    finally { setLoading(false); }
  }, [requestId, token]);
  // Fetch the authorized conversation when the request route becomes active.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    if (!token || completed || !body.trim()) return;
    setBusy(true);
    try { await apiRequest(`/chats/${requestId}/messages`, { method: 'POST', token, body: { body } }); setBody(''); await load(); }
    catch (e) { Alert.alert('Message not sent', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  };
  return <PageShell title="Transaction chat" eyebrow="HANDOVER COORDINATION">
    {loading ? <LoadingState /> : null}{error ? <ErrorState message={error} /> : null}{completed ? <View style={[cardStyle, { marginTop: 10, backgroundColor: '#F0F5EE' }]}><Text style={{ color: '#31553C', fontWeight: '700' }}>Transaction completed</Text><Text style={{ color: '#657268', fontSize: 12, marginTop: 4 }}>This chat is closed. Previous messages remain available to read.</Text></View> : null}
    {!loading && !messages.length ? <Text style={{ color: '#738176', paddingVertical: 18 }}>This is a private chat for the accepted transaction.</Text> : null}
    {messages.map((message) => <View key={message.id} style={[cardStyle, { alignSelf: message.senderId === user?.id ? 'flex-end' : 'stretch', maxWidth: '92%', marginTop: 7, backgroundColor: message.senderId === user?.id ? '#EAF3EB' : '#FFFFFF' }]}>
      <Text style={{ color: '#395644', fontSize: 11, fontWeight: '700' }}>{message.sender.name} · {new Date(message.createdAt).toLocaleString()}</Text>
      <Text style={{ color: '#354A3B', marginTop: 6, lineHeight: 20 }}>{message.body}</Text>
      {message.senderId === user?.id ? <Text style={{ color: '#718376', fontSize: 10, textAlign: 'right', marginTop: 4 }}>{message.readAt ? 'Read' : 'Sent'}</Text> : null}
    </View>)}
    {!completed ? <TextInput value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="Write a message" placeholderTextColor="#849087" style={{ backgroundColor: '#FFFFFF', borderColor: '#E2E9E1', borderWidth: 1, borderRadius: 12, minHeight: 80, padding: 12, marginTop: 14, color: '#24382B' }} /> : null}
    {!completed ? <View style={{ marginTop: 8, alignSelf: 'flex-end' }}><ActionButton label={busy ? 'Sending…' : 'Send message'} disabled={busy || !body.trim()} onPress={() => void send()} /></View> : null}
    <Pressable onPress={() => void load()} style={{ padding: 12 }}><Text style={{ textAlign: 'center', color: '#55705E', fontSize: 12 }}>Refresh messages</Text></Pressable>
  </PageShell>;
}
