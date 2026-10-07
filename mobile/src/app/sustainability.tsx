import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { AppIcon, IconContainer, type AppIconName } from '@/components/app-icon';
import { cardStyle, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';
import type { CampusImpact } from '@/types/models';

type ImpactResult = { impact: CampusImpact };

function Stat({ label, value, icon }: { label: string; value: string; icon: AppIconName }) {
  return <View style={{ flex: 1, minWidth: 135, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7ECE5', borderRadius: 14, padding: 14, margin: 4 }}><IconContainer icon={icon} size={32} background="#EDF4EA" /><Text style={{ color: '#23583D', fontSize: 18, fontWeight: '700', marginTop: 9 }}>{value}</Text><Text style={{ color: '#728078', fontSize: 10, marginTop: 5 }}>{label}</Text></View>;
}

function ImpactBlock({ title, impact }: { title: string; impact: CampusImpact | null }) {
  if (!impact) return null;
  const co2Available = (impact.co2eCalculationsAvailable ?? 0) > 0;
  return <View style={{ marginTop: 13 }}>
    <Text style={{ color: '#345342', fontSize: 15, fontWeight: '700', marginBottom: 4 }}>{title}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      <Stat icon="exchange" label="Items reused" value={String(impact.itemsReused ?? impact.reusedItems)} />
      <Stat icon="donate" label="Items donated" value={String(impact.itemsDonated)} />
      <Stat icon="sell" label="Items sold" value={String(impact.itemsSold ?? 0)} />
      <Stat icon="waste" label="Estimated waste avoided" value={`${impact.estimatedWasteAvoidedKg.toFixed(1)} kg`} />
      <Stat icon="co2" label="Estimated net avoided emissions" value={co2Available ? `${impact.estimatedCo2eAvoidedKg.toFixed(1)} kg CO2e` : 'Insufficient reference data'} />
      {impact.confidenceLevel ? <Stat icon="achievement" label="Estimate confidence" value={impact.confidenceLevel} /> : null}
    </View>
  </View>;
}

export default function SustainabilityScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [personal, setPersonal] = useState<CampusImpact | null>(null);
  const [campus, setCampus] = useState<CampusImpact | null>(null);
  const [methodology, setMethodology] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [mine, all, method] = await Promise.all([
        apiRequest<ImpactResult>('/sustainability/me', { token }),
        apiRequest<ImpactResult>('/sustainability/campus'),
        apiRequest<{ assumptions: string }>('/sustainability/methodology'),
      ]);
      setPersonal(mine.impact);
      setCampus(all.impact);
      setMethodology(method.assumptions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sustainability impact.');
    } finally {
      setLoading(false);
    }
  }, [token]);
  // Load personal and public totals after authentication is ready.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  return <PageShell title="Small things add up." eyebrow="YOUR REUSE IMPACT">
    <Text style={{ color: '#78867C', fontSize: 12, lineHeight: 18 }}>Completed transactions count toward activity. Environmental figures are estimates and are not measured savings.</Text>
    {loading ? <LoadingState /> : null}
    {error ? <ErrorState message={error} /> : null}
    <ImpactBlock title="Your contributions" impact={personal} />
    <ImpactBlock title="Campus community" impact={campus} />
    <Pressable onPress={() => router.push('/leaderboard')} style={[cardStyle, { marginTop: 14, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }]}><IconContainer icon="achievement" size={36} background="#EDF4EA" /><Text style={{ color: '#2C6644', fontSize: 13, fontWeight: '700' }}>View campus reuse leaderboard</Text><AppIcon name="chevron" size={15} color="#9AA49B" /></Pressable>
    {methodology ? <View style={[cardStyle, { backgroundColor: '#EEF3E9', marginTop: 13 }]}>
      <Text style={{ color: '#526D5A', fontSize: 11, fontWeight: '700' }}>View calculation methodology</Text>
      <Text style={{ color: '#7D8A80', fontSize: 10, lineHeight: 16, marginTop: 6 }}>{methodology}</Text>
      <Text style={{ color: '#7D8A80', fontSize: 10, lineHeight: 16, marginTop: 6 }}>Reference data is stored with each calculation. Calculator listings show impact as unavailable when no product-specific factor is available.</Text>
    </View> : null}
  </PageShell>;
}
