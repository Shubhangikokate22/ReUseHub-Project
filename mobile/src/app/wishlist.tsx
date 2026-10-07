import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ItemCard } from '@/components/item-card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';
import type { Item } from '@/types/models';

export default function WishlistScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ items: Item[] }>('/wishlist', { token });
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load saved items.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Refresh saved listings so completed items disappear when returning here.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const removeSaved = async (itemId: string) => {
    if (!token) return;
    try { await apiRequest(`/wishlist/${itemId}`, { method: 'DELETE', token }); setItems((current) => current.filter((item) => item.id !== itemId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove this saved item.'); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>YOUR SHORTLIST</Text>
        <Text style={styles.title}>Saved items</Text>
        {loading ? <ActivityIndicator style={styles.spinner} color="#237A57" /> : null}
        {error ? <View style={styles.notice}><Text style={styles.body}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.action}>Try again</Text></Pressable></View> : null}
        {!loading && !error && items.length === 0 ? <View style={styles.notice}><Text style={styles.emptyTitle}>No saved items yet</Text><Text style={styles.body}>Save an available item to find it here later.</Text></View> : null}
        <View style={styles.list}>{items.map((item) => <ItemCard key={item.id} item={item} compact saved onToggleSaved={() => void removeSaved(item.id)} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} />)}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  safe: { flex: 1, backgroundColor: '#F7F8F3' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 40 },
  kicker: { color: '#65816C', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#1D3C2D', fontSize: 29, fontWeight: '700', marginTop: 8, marginBottom: 18 },
  list: { gap: 10 },
  spinner: { marginVertical: 28 },
  notice: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E7ECE5', alignItems: 'center', marginTop: 12 },
  emptyTitle: { color: '#344A3C', fontWeight: '700', fontSize: 15 },
  body: { color: '#849087', fontSize: 12, marginTop: 6, textAlign: 'center' },
  action: { color: '#237A57', fontWeight: '700', fontSize: 12, marginTop: 10 },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
