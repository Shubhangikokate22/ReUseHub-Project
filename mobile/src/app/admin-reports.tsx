import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ActionButton, cardStyle, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

type Report = { id: string; category: string; description: string; status: string; createdAt: string; itemId: string | null; targetUserId: string | null; reporter: { name: string }; item: { title: string; status: string } | null };
export default function AdminReportsScreen() {
  const { token } = useAuth(); const [reports, setReports] = useState<Report[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(async () => { if (!token) return; setLoading(true); try { const result = await apiRequest<{ reports: Report[] }>('/admin/reports?limit=50', { token }); setReports(result.reports); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reports.'); } finally { setLoading(false); } }, [token]);
  // Load the moderation queue on entry.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const update = async (report: Report, status: 'REVIEWING'|'RESOLVED'|'DISMISSED', removeItem = false) => { if (!token) return; setBusy(report.id); try { await apiRequest(`/admin/reports/${report.id}`, { method: 'PATCH', token, body: { status, removeItem, resolution: removeItem ? 'Listing removed after admin review.' : undefined } }); await load(); } catch (e) { Alert.alert('Moderation update', e instanceof Error ? e.message : 'Could not update report.'); } finally { setBusy(''); } };
  return <PageShell title="Report moderation" eyebrow="ADMIN REVIEW QUEUE" action={<ActionButton label="Refresh" tone="quiet" onPress={() => void load()} />}>
    {loading ? <LoadingState /> : null}{error ? <ErrorState message={error} /> : null}{!loading && !reports.length ? <EmptyState message="No reports have been submitted." /> : null}
    {reports.map((report) => <View key={report.id} style={cardStyle}><Text style={{ color: '#839087', fontSize: 10, fontWeight: '700' }}>{report.status} · {report.category.replaceAll('_', ' ')} · {new Date(report.createdAt).toLocaleDateString()}</Text><Text style={{ color: '#2C4937', fontWeight: '700', marginTop: 7 }}>{report.item?.title ?? `Reported user ${report.targetUserId ?? ''}`}</Text><Text style={{ color: '#6C7A70', fontSize: 12, marginTop: 5 }}>From {report.reporter.name}: {report.description}</Text>{report.status !== 'RESOLVED' && report.status !== 'DISMISSED' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}><ActionButton label="Mark reviewing" tone="quiet" disabled={busy === report.id} onPress={() => void update(report, 'REVIEWING')} />{report.itemId && report.item?.status !== 'REMOVED' ? <ActionButton label="Remove listing and resolve" tone="red" disabled={busy === report.id} onPress={() => void update(report, 'RESOLVED', true)} /> : null}<ActionButton label="Dismiss report" disabled={busy === report.id} onPress={() => void update(report, 'DISMISSED')} /></View> : null}</View>)}
  </PageShell>;
}
