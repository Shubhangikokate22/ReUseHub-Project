import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Alert, Text, TextInput, View } from 'react-native';
import { ActionButton, cardStyle, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest, API_BASE_URL } from '@/lib/api';

type Campaign = { id: string; title: string; description: string; neededItems: string; acceptedCategories: string | null; location: string | null; instructions: string | null; coordinator: string | null; imageUrl: string | null; startDate: string | null; endDate: string | null; _count: { donations: number } };
type CampaignSubmission = { id: string; itemDetails: string; category: string; status: string; submittedAt: string; campaign: { title: string; location: string | null } };
type Goal = { id: string; title: string; metric: string; target: string; progress: number; completed: boolean };
type Achievement = { id: string; title: string; description: string; unlocked: boolean };
export default function CommunityScreen() {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]); const [submissions, setSubmissions] = useState<CampaignSubmission[]>([]); const [itemDetails, setItemDetails] = useState<Record<string, string>>({}); const [categories, setCategories] = useState<Record<string, string>>({}); const [goals, setGoals] = useState<Goal[]>([]); const [achievements, setAchievements] = useState<Achievement[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [campaignData, submissionData, goalData, achievementData] = await Promise.all([
        apiRequest<{ campaigns: Campaign[] }>('/community/campaigns'),
        apiRequest<{ donations: CampaignSubmission[] }>('/community/campaign-donations/mine', { token }),
        apiRequest<{ goals: Goal[] }>('/community/goals', { token }),
        apiRequest<{ achievements: Achievement[] }>('/community/achievements', { token }),
      ]);
      setCampaigns(campaignData.campaigns); setSubmissions(submissionData.donations); setGoals(goalData.goals); setAchievements(achievementData.achievements);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load community features.'); }
    finally { setLoading(false); }
  }, [token]);
  // Refresh after authentication is ready.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const createGoal = async (metric: 'REUSE'|'DONATION'|'CO2E', target: number) => {
    if (!token) return; setBusy(true);
    try { await apiRequest('/community/goals', { method: 'POST', token, body: { title: metric === 'REUSE' ? `Reuse ${target} items` : metric === 'DONATION' ? `Donate ${target} items` : `Avoid ${target} kg CO2e`, metric, target } }); await load(); }
    catch (e) { Alert.alert('Goal', e instanceof Error ? e.message : 'Could not create goal.'); }
    finally { setBusy(false); }
  };
  const submitCampaignDonation = async (campaign: Campaign) => {
    if (!token) return; setBusy(true);
    try { await apiRequest(`/community/campaigns/${campaign.id}/donations`, { method: 'POST', token, body: { itemDetails: itemDetails[campaign.id] ?? '', category: categories[campaign.id] ?? '' } }); setItemDetails((state) => ({ ...state, [campaign.id]: '' })); await load(); Alert.alert('Donation submitted', `Your submission was sent to ${campaign.title}. Bring it to the official campaign location.`); }
    catch (e) { Alert.alert('Donation', e instanceof Error ? e.message : 'Could not submit this campaign donation.'); }
    finally { setBusy(false); }
  };
  return <PageShell title="Campus community" eyebrow="CAMPAIGNS AND PERSONAL GOALS">
    {loading ? <LoadingState /> : null}{error ? <ErrorState message={error} /> : null}
    <Text style={{ color: '#294735', fontSize: 17, fontWeight: '700', marginTop: 10 }}>Donation campaigns</Text>
    {!loading && !campaigns.length ? <EmptyState message="No active campus campaigns right now." /> : null}
    {campaigns.map((campaign) => <View key={campaign.id} style={cardStyle}>{campaign.imageUrl ? <Image source={{ uri: campaign.imageUrl.startsWith('/uploads/') ? `${API_BASE_URL.replace(/\/api$/, '')}${campaign.imageUrl}` : campaign.imageUrl }} contentFit="cover" style={{ width: '100%', height: 150, borderRadius: 13, marginBottom: 11 }} /> : null}<Text style={{ color: '#294735', fontSize: 15, fontWeight: '700' }}>{campaign.title}</Text><Text style={{ color: '#657268', marginTop: 6, lineHeight: 19 }}>{campaign.description}</Text><Text style={{ color: '#557361', fontSize: 12, marginTop: 8 }}>Accepted items · {campaign.neededItems}</Text><Text style={{ color: '#557361', fontSize: 12, marginTop: 7, fontWeight: '700' }}>Donation location · {campaign.location ?? 'Contact the campaign coordinator'}</Text><Text style={{ color: '#849087', fontSize: 11, marginTop: 5 }}>{campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'Now'} – {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'Until announced'} · {campaign._count.donations} submissions</Text>{campaign.instructions ? <Text style={{ color: '#657268', fontSize: 12, marginTop: 7 }}>{campaign.instructions}</Text> : null}{campaign.coordinator ? <Text style={{ color: '#657268', fontSize: 11, marginTop: 5 }}>Coordinator · {campaign.coordinator}</Text> : null}<TextInput value={categories[campaign.id] ?? ''} onChangeText={(value) => setCategories((state) => ({ ...state, [campaign.id]: value.slice(0, 100) }))} placeholder={campaign.acceptedCategories || 'Donation category'} placeholderTextColor="#849087" style={{ backgroundColor: '#F7F9F6', borderWidth: 1, borderColor: '#DFE7DE', borderRadius: 11, padding: 10, marginTop: 12, color: '#294735' }} /><TextInput value={itemDetails[campaign.id] ?? ''} onChangeText={(value) => setItemDetails((state) => ({ ...state, [campaign.id]: value.slice(0, 500) }))} placeholder="Describe what you would like to donate" placeholderTextColor="#849087" multiline style={{ backgroundColor: '#F7F9F6', borderWidth: 1, borderColor: '#DFE7DE', borderRadius: 11, padding: 10, marginTop: 8, color: '#294735', minHeight: 60 }} /><View style={{ alignSelf: 'flex-start', marginTop: 8 }}><ActionButton label={campaign.startDate && new Date(campaign.startDate) > new Date() ? `Opens ${new Date(campaign.startDate).toLocaleDateString()}` : 'Submit donation'} disabled={busy || Boolean(campaign.startDate && new Date(campaign.startDate) > new Date()) || !(categories[campaign.id] ?? '').trim() || !(itemDetails[campaign.id] ?? '').trim()} onPress={() => void submitCampaignDonation(campaign)} /></View></View>)}
    {submissions.length ? <><Text style={{ color: '#294735', fontSize: 17, fontWeight: '700', marginTop: 20 }}>My campaign donations</Text>{submissions.map((submission) => <View key={submission.id} style={cardStyle}><Text style={{ color: '#294735', fontWeight: '700' }}>{submission.campaign.title} · {submission.status}</Text><Text style={{ color: '#657268', fontSize: 12, marginTop: 4 }}>{submission.category}: {submission.itemDetails}</Text><Text style={{ color: '#557361', fontSize: 11, marginTop: 4 }}>Deliver to · {submission.campaign.location ?? 'Campaign location not set'}</Text></View>)}</> : null}
    <Text style={{ color: '#294735', fontSize: 17, fontWeight: '700', marginTop: 24 }}>My sustainability goals</Text>
    {goals.map((goal) => <View key={goal.id} style={cardStyle}><Text style={{ color: '#294735', fontWeight: '700' }}>{goal.title}</Text><Text style={{ color: '#657268', marginTop: 6 }}>{goal.progress} / {Number(goal.target)} · {goal.completed ? 'Completed' : 'From completed activity'}</Text></View>)}
    <Text style={{ color: '#657268', fontSize: 12, marginTop: 14 }}>Create a goal based on future completed reuse activity:</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}><ActionButton label="Reuse 5 items" disabled={busy} onPress={() => void createGoal('REUSE', 5)} /><ActionButton label="Donate 5 items" tone="quiet" disabled={busy} onPress={() => void createGoal('DONATION', 5)} /><ActionButton label="Avoid 10 kg CO2e" tone="quiet" disabled={busy} onPress={() => void createGoal('CO2E', 10)} /></View>
    <Text style={{ color: '#294735', fontSize: 17, fontWeight: '700', marginTop: 24 }}>Achievements</Text>
    {achievements.map((achievement) => <View key={achievement.id} style={[cardStyle, { opacity: achievement.unlocked ? 1 : 0.66 }]}><Text style={{ color: '#294735', fontWeight: '700' }}>{achievement.unlocked ? '✓ ' : '○ '}{achievement.title}</Text><Text style={{ color: '#657268', fontSize: 12, marginTop: 5 }}>{achievement.description}</Text></View>)}
  </PageShell>;
}
