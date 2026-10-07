import { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActionButton, cardStyle, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { API_BASE_URL, apiRequest } from '@/lib/api';
import type { Item } from '@/types/models';

type Result = { items: Item[] };
export default function MyItemsScreen() {
  const { token } = useAuth(); const router = useRouter();
  const [items, setItems] = useState<Item[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!token) return; setError(''); try { const result = await apiRequest<Result>('/items/mine', { token }); setItems(result.items); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your listings.'); } finally { setLoading(false); } }, [token]);
  // Refresh owned listings when returning from editing or a handoff.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const remove = async (item: Item) => { if (!token) return; try { await apiRequest(`/items/${item.id}`, { method: 'DELETE', token }); setItems((all) => all.filter((entry) => entry.id !== item.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove this listing.'); } };
  const visibleItems = items.filter((item) => item.status === 'AVAILABLE' || item.status === 'REQUESTED');
  return <PageShell title="My items" eyebrow="YOUR CAMPUS LISTINGS" action={<ActionButton label="＋  Add item" onPress={() => router.push('/add')} />}>
    {loading ? <LoadingState /> : null}{error ? <ErrorState message={error} /> : null}
    {!loading && !visibleItems.length ? <EmptyState message="You have no active listings. Donated, sold, exchanged, or removed items no longer appear here." /> : null}
    {visibleItems.map((item) => <View key={item.id} style={cardStyle}>
      {item.images[0]?.url ? <Image source={{ uri: `${API_BASE_URL.replace(/\/api$/, '')}${item.images[0].url}` }} style={{ width: '100%', height: 155, borderRadius: 10, marginBottom: 12 }} resizeMode="cover" /> : null}
      <Text style={{ color: '#849087', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>{item.status}  ·  {item.exchangeType === 'DONATION' ? 'GIVE AWAY' : 'EXCHANGE'}</Text>
      <Pressable onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}><Text style={{ color: '#294735', fontSize: 16, fontWeight: '700', marginTop: 5 }}>{item.title}</Text></Pressable>
      <Text style={{ color: '#859088', fontSize: 11, marginTop: 4 }}>{item.category.name} · {item.condition.replace('_', ' ')}</Text>
      {item.status === 'AVAILABLE' ? <View style={{ flexDirection: 'row', gap: 9, marginTop: 13 }}><ActionButton label="Edit listing" tone="quiet" onPress={() => router.push({ pathname: '/add', params: { itemId: item.id } })} /><ActionButton label="Remove" tone="red" onPress={() => void remove(item)} /></View> : null}
    </View>)}
  </PageShell>;
}
