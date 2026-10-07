import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cardStyle, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

type GreenIt = {
  measured: {
    imagesUploaded: number;
    imagesWithRecordedSize: number;
    imageStorageBytes: number;
    averageImageBytes: number | null;
    api: { apiRequests: number; paginatedQueryResponses: number; responsesWithMeasuredContentLength: number; responseBytes: number; averageResponseBytes: number | null };
    itemLifecycle: { available: number; requested: number; exchanged: number; sold: number; donated: number; removed: number };
  };
  estimatedStorageReductionPercent: number | null;
  notes: string[];
};

export default function AdminGreenItScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<GreenIt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try { setData(await apiRequest<GreenIt>('/admin/green-it', { token })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Green IT metrics.'); }
    finally { setLoading(false); }
  }, [token]);
  // Refresh measured technical metrics when the screen opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const metric = (title: string, description: string) => <View style={cardStyle}><Text style={{ color: '#315440', fontSize: 13, fontWeight: '700' }}>{title}</Text><Text style={{ color: '#718078', fontSize: 11, lineHeight: 17, marginTop: 6 }}>{description}</Text></View>;
  const m = data?.measured;
  return <PageShell title="Green IT metrics" eyebrow="MEASURED SOFTWARE EFFICIENCY" action={<Pressable onPress={() => void load()}><Text style={{ color: '#237A57', fontWeight: '700' }}>Refresh</Text></Pressable>}>
    {loading ? <LoadingState /> : null}
    {error ? <ErrorState message={error} /> : null}
    {m ? <>
      {metric('Image storage', `${m.imagesUploaded} uploaded · ${(m.imageStorageBytes / 1024).toFixed(1)} KB recorded · ${m.imagesWithRecordedSize} with measured size · average ${m.averageImageBytes === null ? 'unavailable' : `${(m.averageImageBytes / 1024).toFixed(1)} KB`}.`)}
      {metric('API payload sizes', `${m.api.apiRequests} measured requests since backend process start · ${(m.api.responseBytes / 1024).toFixed(1)} KB of response content-length · average ${m.api.averageResponseBytes === null ? 'unavailable' : `${m.api.averageResponseBytes} bytes`}.`)}
      {metric('Pagination', `${m.api.paginatedQueryResponses} API responses included explicit page or limit parameters. Paginated responses transfer a bounded set of rows.`)}
      {metric('Data lifecycle', `Available ${m.itemLifecycle.available} · Requested ${m.itemLifecycle.requested} · Exchanged ${m.itemLifecycle.exchanged} · Sold ${m.itemLifecycle.sold} · Donated ${m.itemLifecycle.donated} · Removed ${m.itemLifecycle.removed}.`)}
      {data?.notes.map((note, index) => <Text key={index} style={{ color: '#849087', fontSize: 10, lineHeight: 15, marginTop: 4 }}>• {note}</Text>)}
    </> : null}
  </PageShell>;
}
