import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AppIcon } from '@/components/app-icon';
import { ActionButton, cardStyle, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

type Goal = { id: string; title: string; metric: 'REUSE'|'DONATION'|'CO2E'; target: string; progress: number; completed: boolean; deadline: string | null };
const presets = [{ metric: 'REUSE' as const, target: 5, title: 'Reuse 5 items' }, { metric: 'DONATION' as const, target: 5, title: 'Donate 5 items' }, { metric: 'CO2E' as const, target: 10, title: 'Avoid 10 kg CO2e' }];
export default function GoalsScreen() {
  const { token } = useAuth(); const [goals, setGoals] = useState<Goal[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!token) return; setLoading(true); try { const result = await apiRequest<{ goals: Goal[] }>('/community/goals', { token }); setGoals(result.goals); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your goals.'); } finally { setLoading(false); } }, [token]);
  // Refresh goal progress when completed activity changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const add = async (preset: typeof presets[number]) => { if (!token) return; setBusy(true); try { await apiRequest('/community/goals', { method: 'POST', token, body: preset }); await load(); } catch (e) { Alert.alert('Goal', e instanceof Error ? e.message : 'Could not create goal.'); } finally { setBusy(false); } };
  const remove = async (goal: Goal) => { if (!token) return; try { await apiRequest(`/community/goals/${goal.id}`, { method: 'DELETE', token }); setGoals((current) => current.filter((entry) => entry.id !== goal.id)); } catch (e) { Alert.alert('Goal', e instanceof Error ? e.message : 'Could not remove goal.'); } };
  return <PageShell title="Sustainability goals" eyebrow="YOUR CAMPUS REUSE TARGETS" action={<ActionButton label="Refresh" tone="quiet" onPress={() => void load()} />}>
    <Text style={{ color: '#7D8B80', fontSize: 12, lineHeight: 18 }}>Progress counts completed exchanges, donations, and sales. Listings and pending requests do not add progress.</Text>
    {loading ? <LoadingState /> : null}{error ? <ErrorState message={error} /> : null}{!loading && !goals.length ? <EmptyState message="Set a small goal and build progress through completed handoffs." /> : null}
    {goals.map((goal) => { const target = Number(goal.target); const percent = Math.min(100, target > 0 ? goal.progress / target * 100 : 0); return <View key={goal.id} style={cardStyle}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#E9F2E7', alignItems: 'center', justifyContent: 'center' }}><AppIcon name="goal" size={18} color="#417653" /></View><Text style={{ flex: 1, color: '#304A38', fontSize: 13, fontWeight: '800' }}>{goal.title}</Text><Pressable accessibilityLabel="Delete goal" onPress={() => void remove(goal)}><AppIcon name="close" size={17} color="#929C93" /></Pressable></View><View style={{ height: 7, borderRadius: 4, backgroundColor: '#E8EEE6', marginTop: 14, overflow: 'hidden' }}><View style={{ height: 7, width: `${percent}%`, backgroundColor: goal.completed ? '#6D9C72' : '#31805A', borderRadius: 4 }} /></View><Text style={{ color: '#758379', fontSize: 11, marginTop: 7 }}>{goal.progress.toFixed(goal.metric === 'CO2E' ? 1 : 0)} / {target} {goal.metric === 'CO2E' ? 'kg CO2e · estimated' : 'items'}{goal.completed ? ' · Complete' : ''}</Text></View>; })}
    <Text style={{ color: '#304A38', fontSize: 15, fontWeight: '800', marginTop: 24 }}>Choose a goal</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{presets.map((preset) => <ActionButton key={preset.metric} label={preset.title} tone="quiet" disabled={busy} onPress={() => void add(preset)} />)}</View>
  </PageShell>;
}
