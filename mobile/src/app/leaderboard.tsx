import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { cardStyle, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { apiRequest } from '@/lib/api';

type Leader = { rank: number; userId: string; name: string; points: number };

export default function LeaderboardScreen() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ leaderboard: Leader[] }>('/sustainability/leaderboard');
      setLeaders(result.leaderboard);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the leaderboard.');
    } finally {
      setLoading(false);
    }
  }, []);
  // Load completed activity rankings when this screen opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  return <PageShell title="Campus reuse leaderboard" eyebrow="COMPLETED ACTIVITY">
    <Text style={{ color: '#78867C', fontSize: 12, lineHeight: 18 }}>Points come from completed exchanges, donations, and sales. Creating listings does not earn points. There are no department rankings.</Text>
    {loading ? <LoadingState /> : null}
    {error ? <ErrorState message={error} /> : null}
    {!loading && !error && !leaders.length ? <View style={[cardStyle, { alignItems: 'center', padding: 22 }]}><Text style={{ color: '#344A3C', fontSize: 14, fontWeight: '700' }}>No completed transactions yet</Text><Text style={{ color: '#849087', fontSize: 11, textAlign: 'center', marginTop: 6 }}>Complete a handoff to appear on the campus leaderboard.</Text></View> : null}
    <ScrollView style={{ maxHeight: 620 }}>
      {leaders.map((leader) => <View key={leader.userId} style={[cardStyle, { flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 14 }]}>
        <Text style={{ width: 34, color: '#46835C', fontSize: 16, fontWeight: '800' }}>{leader.rank}</Text>
        <Text numberOfLines={1} style={{ flex: 1, color: '#344A3C', fontSize: 13, fontWeight: '700' }}>{leader.name}</Text>
        <Text style={{ color: '#69806F', fontSize: 11 }}>{leader.points} pts</Text>
      </View>)}
    </ScrollView>
    {!loading && error ? <Pressable onPress={() => void load()} style={{ padding: 12 }}><Text style={{ color: '#237A57', fontWeight: '700' }}>Try again</Text></Pressable> : null}
  </PageShell>;
}
