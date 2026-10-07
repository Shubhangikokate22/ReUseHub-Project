import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { apiRequest, API_BASE_URL } from '@/lib/api';
import type { Item } from '@/types/models';

type ItemResponse = { item: Item };
type ItemsResponse = { items: Item[] };

export default function ExchangeRequestScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const [requested, setRequested] = useState<Item | null>(null);
  const [offers, setOffers] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token || !itemId) return;
    setLoading(true);
    setError('');
    try {
      const [wanted, mine] = await Promise.all([
        apiRequest<ItemResponse>(`/items/${itemId}`),
        apiRequest<ItemsResponse>('/items/mine', { token }),
      ]);
      setRequested(wanted.item);
      const eligible = mine.items.filter((item) => item.owner.id === user?.id && item.status === 'AVAILABLE' && item.activeExchangeRequestId == null);
      setOffers(eligible);
      setSelectedId((current) => eligible.some((item) => item.id === current) ? current : '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load exchange items.');
    } finally {
      setLoading(false);
    }
  }, [itemId, token, user?.id]);

  useEffect(() => { void load(); }, [load]);

  async function sendRequest() {
    if (!token || !requested || !selectedId) return;
    setSending(true);
    setError('');
    try {
      await apiRequest('/requests', { method: 'POST', token, body: { itemId: requested.id, offeredItemId: selectedId, ...(message.trim() ? { message: message.trim() } : {}) } });
      Alert.alert('Exchange request sent', 'The holder can review the item you offered and respond in Listing Requests.');
      router.replace('/requests?direction=sent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send this exchange request.');
    } finally {
      setSending(false);
    }
  }

  const photo = (item: Item | null) => item?.images?.[0]?.url ? `${API_BASE_URL.replace(/\/api$/, '')}${item.images[0].url}` : null;

  return <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8F3' }} edges={['top']}>
    <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 700, alignSelf: 'center', padding: 20, paddingBottom: 42 }}>
      <Pressable onPress={() => router.back()} style={{ paddingVertical: 9, alignSelf: 'flex-start' }}><Text style={{ color: '#51715D', fontWeight: '700' }}>‹  Back</Text></Pressable>
      <Text style={{ color: '#65816C', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 8 }}>ITEM-FOR-ITEM</Text>
      <Text style={{ color: '#1D3C2D', fontSize: 29, fontWeight: '700', marginTop: 6 }}>Request exchange</Text>
      <Text style={{ color: '#839087', fontSize: 12, marginTop: 5, marginBottom: 18 }}>Choose one of your available items to offer.</Text>
      {loading ? <ActivityIndicator color="#237A57" style={{ marginTop: 30 }} /> : null}
      {!loading && requested ? <>
        <Text style={labelStyle}>YOU RECEIVE</Text>
        <ItemCard item={requested} image={photo(requested)} selected={false} selectable={false} onPress={() => undefined} />
        <Text style={{ color: '#6E876F', fontSize: 11, fontWeight: '800', textAlign: 'center', marginVertical: 13 }}>IN EXCHANGE FOR</Text>
        <Text style={labelStyle}>YOU GIVE</Text>
        {offers.length ? offers.map((item) => <ItemCard key={item.id} item={item} image={photo(item)} selected={selectedId === item.id} selectable onPress={() => setSelectedId(item.id)} />) : <View style={emptyStyle}><Text style={{ color: '#52675A', fontWeight: '700' }}>No available items to offer</Text><Text style={{ color: '#839087', fontSize: 12, marginTop: 5 }}>Create or make one of your listings available first.</Text></View>}
        <TextInput value={message} onChangeText={setMessage} maxLength={1000} placeholder="Optional message to the holder" placeholderTextColor="#929C93" multiline style={{ minHeight: 76, textAlignVertical: 'top', color: '#33463A', borderRadius: 12, borderWidth: 1, borderColor: '#E0E6DF', padding: 12, fontSize: 13, marginTop: 8, backgroundColor: '#FFFFFF' }} />
      </> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: '#AC493D', fontSize: 12, marginTop: 12 }}>{error}</Text> : null}
      {!loading && requested ? <Pressable disabled={sending || !selectedId} onPress={() => void sendRequest()} style={{ minHeight: 51, borderRadius: 13, backgroundColor: !selectedId || sending ? '#9CB8A4' : '#237A57', alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
        {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Send exchange request</Text>}
      </Pressable> : null}
    </ScrollView>
  </SafeAreaView>;
}

function ItemCard({ item, image, selected, selectable, onPress }: { item: Item; image: string | null; selected: boolean; selectable: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: selected ? '#EDF5EC' : '#FFFFFF', borderWidth: selected ? 2 : 1, borderColor: selected ? '#75A982' : '#E4EAE2', borderRadius: 15, padding: 10, marginTop: 8 }}>
    {image ? <Image source={{ uri: image }} contentFit="cover" style={{ width: 68, height: 68, borderRadius: 11, backgroundColor: '#E8EEE7' }} /> : <View style={{ width: 68, height: 68, borderRadius: 11, backgroundColor: '#E8EEE7', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#5B8065', fontSize: 20 }}>□</Text></View>}
    <View style={{ flex: 1 }}><Text style={{ color: '#294735', fontSize: 14, fontWeight: '700' }}>{item.title}</Text><Text style={{ color: '#819087', fontSize: 11, marginTop: 4 }}>{item.category.name} · {item.condition.replace('_', ' ').toLowerCase()}</Text></View>
    {selectable ? <Text style={{ color: selected ? '#237A57' : '#829086', fontSize: 20 }}>{selected ? '●' : '○'}</Text> : null}
  </Pressable>;
}

const labelStyle = { color: '#506B58', fontSize: 10, fontWeight: '800' as const, letterSpacing: 1 };
const emptyStyle = { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E4EAE2', backgroundColor: '#FFFFFF', marginTop: 8 } as const;
