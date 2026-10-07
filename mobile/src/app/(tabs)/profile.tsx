import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconContainer } from '@/components/app-icon';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, token, ready, logout } = useAuth();
  const [summary, setSummary] = useState({ listings: 0, rating: null as number | null, ratingCount: 0 });
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      const [items, reputation] = await Promise.all([
        apiRequest<{ items: unknown[] }>('/items/mine', { token }),
        apiRequest<{ averageRating: number | null; ratingCount: number }>(`/requests/reputation/${user.id}`, { token }),
      ]);
      setSummary({ listings: items.items.length, rating: reputation.averageRating, ratingCount: reputation.ratingCount });
    } finally { setLoading(false); }
  }, [token, user]);
  // Refresh the account summary after the authenticated user changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#237A57" /></View>;
  if (!user) return <Redirect href="/login" />;
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>YOUR ACCOUNT</Text>
      <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.identityText}><Text numberOfLines={1} style={styles.name}>{user.name}</Text><Text numberOfLines={1} style={styles.email}>{user.email}</Text><Text style={styles.role}>{user.role === 'ADMIN' ? 'CAMPUS ADMIN' : 'CAMPUS MEMBER'}</Text></View></View>
      <View style={styles.ratingRow}><View style={styles.ratingBadge}><AppIcon name="star" size={15} color="#BE8826" /><Text style={styles.rating}>{summary.rating ? summary.rating.toFixed(1) : 'New reputation'}</Text>{summary.ratingCount > 0 ? <Text style={styles.ratingCount}>({summary.ratingCount})</Text> : null}</View><View style={styles.listingBadge}><Text style={styles.listingNumber}>{loading ? '—' : summary.listings}</Text><Text style={styles.listingLabel}>active listings</Text></View></View>

      <Text style={styles.sectionTitle}>Your impact</Text>
      <Menu icon="impact" title="My impact" subtitle="Completed reuse and estimated savings" onPress={() => router.push('/sustainability')} />
      <Menu icon="achievement" title="Achievements" subtitle="Milestones earned through completed activity" onPress={() => router.push('/achievements')} />
      <Menu icon="goal" title="Sustainability goals" subtitle="Progress from completed transactions" onPress={() => router.push('/goals')} />

      <Text style={styles.sectionTitle}>Account</Text>
      <Menu icon="category" title="My listings" subtitle="Edit or review items you have posted" onPress={() => router.push('/my-items')} />
      <Menu icon="chat" title="My transactions" subtitle="Requests, accepted handoffs, and ratings" onPress={() => router.push('/requests')} />
      <Menu icon="edit" title="Edit profile" subtitle="Update your name or email" onPress={() => router.push('/edit-profile')} />
      {user.role === 'ADMIN' ? <Menu icon="settings" title="Campus admin" subtitle="Moderation and platform overview" onPress={() => router.push('/admin')} /> : null}
      <Pressable onPress={() => void logout()} style={styles.logout}><AppIcon name="logout" size={17} color="#A34D43" /><Text style={styles.logoutText}>Log out</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function Menu({ icon, title, subtitle, onPress }: { icon: 'impact'|'achievement'|'goal'|'category'|'chat'|'edit'|'settings'; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menu, pressed && styles.pressed]}><IconContainer icon={icon} size={37} background="#EDF4EA" /><View style={styles.menuCopy}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuSubtitle}>{subtitle}</Text></View><AppIcon name="chevron" size={15} color="#9AA49B" /></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8F3' },
  content: { padding: 18, paddingTop: 12, paddingBottom: 112, width: '100%', maxWidth: 720, alignSelf: 'center' },
  kicker: { color: '#64816C', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 15 },
  avatar: { width: 60, height: 60, borderRadius: 20, backgroundColor: '#DCEBE0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#26734F', fontSize: 25, fontWeight: '800' },
  identityText: { flex: 1, minWidth: 0 },
  name: { color: '#213B2D', fontSize: 21, fontWeight: '800' },
  email: { color: '#879188', fontSize: 12, marginTop: 4 },
  role: { color: '#63806A', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 7 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E7ECE5', padding: 12 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rating: { color: '#435A49', fontSize: 12, fontWeight: '700' },
  ratingCount: { color: '#869087', fontSize: 10 },
  listingBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  listingNumber: { color: '#2D6948', fontSize: 16, fontWeight: '800' },
  listingLabel: { color: '#849087', fontSize: 10 },
  sectionTitle: { color: '#2A4233', fontSize: 15, fontWeight: '800', marginTop: 23, marginBottom: 7 },
  menu: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8ECE5', borderRadius: 15, marginTop: 8 },
  menuCopy: { flex: 1, minWidth: 0 },
  menuTitle: { color: '#344A3C', fontSize: 13, fontWeight: '700' },
  menuSubtitle: { color: '#89938B', fontSize: 10, lineHeight: 14, marginTop: 3 },
  logout: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8E5DF', borderRadius: 13, marginTop: 18 },
  logoutText: { color: '#9E5148', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F8F3' },
});
