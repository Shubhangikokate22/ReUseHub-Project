import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { IconContainer } from '@/components/app-icon';
import { ActionButton, cardStyle, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

type Achievement = { id: string; title: string; description: string; unlocked: boolean };
export default function AchievementsScreen() {
  const { token } = useAuth(); const [rows, setRows] = useState<Achievement[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!token) return; setLoading(true); try { const result = await apiRequest<{ achievements: Achievement[] }>('/community/achievements', { token }); setRows(result.achievements); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load achievements.'); } finally { setLoading(false); } }, [token]);
  // Refresh progress from completed transactions when this screen opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  return <PageShell title="Achievements" eyebrow="MILESTONES FROM REAL ACTIVITY" action={<ActionButton label="Refresh" tone="quiet" onPress={() => void load()} />}>
    <Text style={{ color: '#7D8B80', fontSize: 12, lineHeight: 18 }}>Achievements unlock only from completed transactions. Estimated impact milestones are clearly identified.</Text>
    {loading ? <LoadingState /> : null}{error ? <ErrorState message={error} /> : null}{!loading && !rows.length ? <EmptyState message="Achievements will appear here as you complete handoffs." /> : null}
    {rows.map((row) => <View key={row.id} style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: row.unlocked ? '#FFFFFF' : '#F0F1ED', opacity: row.unlocked ? 1 : 0.78 }]}><IconContainer icon={row.id === 'generous-contributor' ? 'donate' : row.id === 'green-contributor' ? 'impact' : row.id === 'campus-champion' ? 'achievement' : 'exchange'} size={48} background={row.unlocked ? '#E6F1E5' : '#E6E8E3'} color={row.unlocked ? '#43805B' : '#929B92'} /><View style={{ flex: 1 }}><Text style={{ color: '#304A38', fontSize: 14, fontWeight: '800' }}>{row.title}</Text><Text style={{ color: '#7A887E', fontSize: 11, lineHeight: 16, marginTop: 4 }}>{row.description}</Text></View><Text style={{ color: row.unlocked ? '#327450' : '#98A097', fontSize: 10, fontWeight: '800' }}>{row.unlocked ? 'EARNED' : 'LOCKED'}</Text></View>)}
  </PageShell>;
}
