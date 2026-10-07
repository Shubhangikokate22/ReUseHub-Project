import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ItemCard } from '@/components/item-card';
import { AppIcon, BrandLockup } from '@/components/app-icon';
import { CategoryCard } from '@/components/category-card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';
import type { CampusImpact, Category, Item } from '@/types/models';

type ItemsResponse = { items: Item[] };
type CategoriesResponse = { categories: Category[] };
type ImpactResponse = { impact: CampusImpact };

export default function HomeScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [recommendations, setRecommendations] = useState<Item[]>([]);
  const [forSale, setForSale] = useState<Item[]>([]);
  const [forExchange, setForExchange] = useState<Item[]>([]);
  const [donations, setDonations] = useState<Item[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [impact, setImpact] = useState<CampusImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [itemResult, categoryResult, impactResult, recommendationResult, saleResult, exchangeResult, donationResult, wishlistResult, noticeResult] = await Promise.all([
        apiRequest<ItemsResponse>('/items?limit=8'),
        apiRequest<CategoriesResponse>('/categories'),
        apiRequest<ImpactResponse>('/sustainability/campus'),
        apiRequest<{ recommendations: { item: Item }[] }>('/items/recommended', { token }),
        apiRequest<ItemsResponse>('/items?exchangeType=SALE&limit=6'),
        apiRequest<ItemsResponse>('/items?exchangeType=EXCHANGE&limit=6'),
        apiRequest<ItemsResponse>('/items?exchangeType=DONATION&limit=6'),
        apiRequest<{ items: Item[] }>('/wishlist', { token }),
        apiRequest<{ unreadCount: number }>('/notifications?limit=1', { token }),
      ]);
      setItems(itemResult.items);
      setCategories(categoryResult.categories);
      setImpact(impactResult.impact);
      setRecommendations(recommendationResult.recommendations.map((entry) => entry.item));
      setForSale(saleResult.items); setForExchange(exchangeResult.items); setDonations(donationResult.items);
      setSavedIds(wishlistResult.items.map((item) => item.id)); setUnreadNotifications(noticeResult.unreadCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the campus feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Refresh marketplace sections whenever Home becomes visible again.
  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  const openExplore = (params: { q?: string; categoryId?: string } = {}) => {
    router.push({ pathname: '/explore', params });
  };

  const toggleSaved = async (item: Item) => {
    if (!token) return;
    const saved = savedIds.includes(item.id);
    setSavedIds((current) => saved ? current.filter((id) => id !== item.id) : [...current, item.id]);
    try { await apiRequest(`/wishlist/${item.id}`, { method: saved ? 'DELETE' : 'POST', token, body: saved ? undefined : {} }); }
    catch { setSavedIds((current) => saved ? [...current, item.id] : current.filter((id) => id !== item.id)); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#237A57" />}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <BrandLockup size={27} fontSize={18} style={styles.brandRow} />
            <Text style={styles.hello}>Hi {user?.name.split(' ')[0] ?? 'there'}, what can you find today?</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push('/wishlist')} accessibilityLabel="Saved items" style={styles.headerIcon}><AppIcon name="heart" size={19} color="#4C6553" /></Pressable>
            <Pressable onPress={() => router.push('/notifications')} accessibilityLabel="Notifications" style={styles.headerIcon}><AppIcon name="bell" size={19} color="#4C6553" />{unreadNotifications > 0 ? <View style={styles.notificationDot} /> : null}</Pressable>
            <Pressable onPress={() => router.push('/profile')} style={styles.avatar} accessibilityLabel="Open profile"><Text style={styles.avatarText}>{user?.name.slice(0, 1).toUpperCase() ?? 'U'}</Text></Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroEyebrow}>A MORE RESOURCEFUL CAMPUS</Text>
          <Text style={styles.heroTitle}>Reuse. Exchange.{ '\n' }Reduce waste.</Text>
          <Text style={styles.heroBody}>Useful things deserve more than one life.</Text>
          <Pressable style={styles.heroButton} onPress={() => openExplore()}>
            <Text style={styles.heroButtonText}>Find something useful <Text style={styles.arrow}>↗</Text></Text>
          </Pressable>
          <Text style={styles.heroDecor} accessibilityElementsHidden>↗</Text>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => openExplore({ q: search.trim() })}
            returnKeyType="search"
            placeholder="Search books, furniture, and more"
            placeholderTextColor="#89948B"
            style={styles.searchInput}
          />
          <Pressable onPress={() => openExplore({ q: search.trim() })} style={styles.searchAction} accessibilityLabel="Search items">
            <Text style={styles.searchActionText}>Go</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => openExplore({ q: search.trim() })} style={styles.beforeBuy}>
          <Text style={styles.beforeBuyTitle}>Before you buy, check for reuse</Text>
          <Text style={styles.beforeBuyBody}>Search campus listings for a useful alternative.</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Browse categories</Text><Text style={styles.sectionHint}>A good find is around the corner</Text></View>
          <Pressable onPress={() => openExplore()}><Text style={styles.seeAll}>See all</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
          {categories.map((category, index) => <CategoryCard key={category.id} category={category} index={index} onPress={() => openExplore({ categoryId: category.id })} />)}
          {!categories.length && loading && <ActivityIndicator style={styles.categoryLoading} color="#237A57" />}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Recommended for you</Text><Text style={styles.sectionHint}>Based on saved categories and completed handoffs</Text></View>
        </View>
        {loading && !recommendations.length ? <ActivityIndicator style={styles.loading} color="#237A57" /> : recommendations.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemRail}>
            {recommendations.map((item) => <ItemCard key={`recommended-${item.id}`} item={item} saved={savedIds.includes(item.id)} onToggleSaved={() => void toggleSaved(item)} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} />)}
          </ScrollView>
        ) : <View style={styles.messageCard}><Text style={styles.emptyBody}>No recommendations yet. Save an item or complete a handoff to tune this rule-based list.</Text></View>}

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Recently listed</Text><Text style={styles.sectionHint}>Shared by people on your campus</Text></View>
          <Pressable onPress={() => openExplore()}><Text style={styles.seeAll}>View all</Text></Pressable>
        </View>
        {error ? (
          <View style={styles.messageCard}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View>
        ) : loading && !items.length ? (
          <ActivityIndicator style={styles.loading} color="#237A57" />
        ) : items.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemRail}>
            {items.map((item) => <ItemCard key={item.id} item={item} saved={savedIds.includes(item.id)} onToggleSaved={() => void toggleSaved(item)} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} />)}
          </ScrollView>
        ) : (
          <View style={styles.messageCard}><Text style={styles.emptyTitle}>No listings just yet</Text><Text style={styles.emptyBody}>Check back soon or be the first to share something.</Text></View>
        )}

        <FeedSection title="For sale" hint="Good finds at student-friendly prices" items={forSale} onSeeAll={() => openExplore()} onOpen={(item) => router.push({ pathname: '/item/[id]', params: { id: item.id } })} savedIds={savedIds} onToggleSaved={toggleSaved} />
        <FeedSection title="Available to exchange" hint="Trade something useful" items={forExchange} onSeeAll={() => openExplore()} onOpen={(item) => router.push({ pathname: '/item/[id]', params: { id: item.id } })} savedIds={savedIds} onToggleSaved={toggleSaved} />
        <FeedSection title="Free donations" hint="Pass an item along to another student" items={donations} onSeeAll={() => openExplore()} onOpen={(item) => router.push({ pathname: '/item/[id]', params: { id: item.id } })} savedIds={savedIds} onToggleSaved={toggleSaved} />

        <View style={styles.impactCard}>
          <View style={styles.impactTop}><Text style={styles.impactEyebrow}>OUR CAMPUS, REUSING TOGETHER</Text><Text style={styles.impactLeaf}>✳</Text></View>
          <Text style={styles.impactTitle}>Small handoffs.{ '\n' }A lighter footprint.</Text>
          <Text style={styles.impactLabel}>Estimated environmental impact</Text>
          <View style={styles.impactStats}>
            <ImpactStat value={impact ? `${impact.reusedItems}` : '—'} label="items reused" />
            <View style={styles.statDivider} />
            <ImpactStat value={impact ? `${impact.estimatedWasteAvoidedKg.toFixed(1)} kg` : '—'} label="estimated waste avoided" />
          </View>
          <Text style={styles.impactNote}>These figures are estimates, not measured environmental savings.</Text>
        </View>

        <Pressable onPress={() => openExplore()} style={styles.bottomLink}><Text style={styles.bottomLinkText}>Made for students. Better through sharing.</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeedSection({ title, hint, items, onSeeAll, onOpen, savedIds, onToggleSaved }: { title: string; hint: string; items: Item[]; onSeeAll: () => void; onOpen: (item: Item) => void; savedIds: string[]; onToggleSaved: (item: Item) => void }) {
  if (!items.length) return null;
  return <><View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionHint}>{hint}</Text></View><Pressable onPress={onSeeAll}><Text style={styles.seeAll}>View all</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemRail}>{items.map((item) => <ItemCard key={item.id} item={item} saved={savedIds.includes(item.id)} onToggleSaved={() => onToggleSaved(item)} onPress={() => onOpen(item)} />)}</ScrollView></>;
}

function ImpactStat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = {
  safe: { flex: 1, backgroundColor: '#F7F8F3' },
  content: { paddingHorizontal: 20, paddingTop: 9, paddingBottom: 32, maxWidth: 780, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 19 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6EBE4', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationDot: { position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: '#B94F59' },
  hello: { color: '#79857B', fontSize: 12, marginTop: 4 },
  avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#DDEBE0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#237A57', fontSize: 16, fontWeight: '800' },
  hero: { minHeight: 234, borderRadius: 23, backgroundColor: '#1E553D', padding: 23, overflow: 'hidden', justifyContent: 'center' },
  heroGlow: { position: 'absolute', width: 185, height: 185, borderRadius: 100, right: -44, top: -69, backgroundColor: '#3D7958', opacity: 0.55 },
  heroEyebrow: { color: '#B8D7C2', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  heroTitle: { color: '#FFFFFF', fontSize: 33, lineHeight: 37, fontWeight: '700', letterSpacing: -0.7, marginTop: 11 },
  heroBody: { color: '#D2E3D6', fontSize: 13, marginTop: 7 },
  heroButton: { alignSelf: 'flex-start', backgroundColor: '#F5F4E9', paddingVertical: 11, paddingHorizontal: 14, borderRadius: 11, marginTop: 17 },
  heroButtonText: { color: '#224735', fontSize: 12, fontWeight: '700' },
  arrow: { fontSize: 15 },
  heroDecor: { position: 'absolute', right: 24, bottom: 35, color: '#A7C6AE', fontSize: 53, transform: [{ rotate: '-20deg' }] },
  searchBox: { height: 53, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E8E0', borderRadius: 15, paddingHorizontal: 13, marginTop: 16 },
  searchIcon: { color: '#718077', fontSize: 25, marginRight: 8 },
  searchInput: { flex: 1, color: '#26382E', fontSize: 13, paddingVertical: 0 },
  searchAction: { backgroundColor: '#E8F2E9', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  searchActionText: { color: '#237A57', fontSize: 12, fontWeight: '800' },
  beforeBuy: { marginTop: 9, padding: 13, borderRadius: 13, backgroundColor: '#EDF4E9' },
  beforeBuyTitle: { color: '#315E41', fontSize: 12, fontWeight: '700' },
  beforeBuyBody: { color: '#748478', fontSize: 10, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 27, marginBottom: 13 },
  sectionTitle: { color: '#20382B', fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  sectionHint: { color: '#8A948B', fontSize: 11, marginTop: 4 },
  seeAll: { color: '#237A57', fontSize: 12, fontWeight: '700' },
  categoryRail: { gap: 10, paddingBottom: 2 },
  categoryLoading: { margin: 17 },
  itemRail: { gap: 12, paddingBottom: 2 },
  loading: { marginVertical: 30 },
  messageCard: { backgroundColor: '#FFFFFF', borderColor: '#E7ECE5', borderWidth: 1, borderRadius: 16, padding: 18 },
  error: { color: '#A3463A', fontSize: 13, lineHeight: 19 },
  retry: { color: '#237A57', fontWeight: '700', marginTop: 10 },
  emptyTitle: { color: '#344A3C', fontWeight: '700', fontSize: 14 },
  emptyBody: { color: '#849087', fontSize: 12, lineHeight: 18, marginTop: 5 },
  impactCard: { borderRadius: 21, padding: 21, marginTop: 28, backgroundColor: '#E7EFE3' },
  impactTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  impactEyebrow: { color: '#617968', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  impactLeaf: { color: '#57906C', fontSize: 19 },
  impactTitle: { color: '#234335', fontSize: 25, lineHeight: 29, fontWeight: '700', letterSpacing: -0.5, marginTop: 13 },
  impactLabel: { color: '#718078', fontSize: 10, marginTop: 6 },
  impactStats: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  stat: { flex: 1 },
  statValue: { color: '#1E563D', fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { color: '#6D7F72', fontSize: 10, marginTop: 3 },
  statDivider: { width: 1, height: 36, backgroundColor: '#C8D6C8', marginHorizontal: 15 },
  impactNote: { color: '#7E8A80', fontSize: 9, lineHeight: 13, marginTop: 17 },
  bottomLink: { alignItems: 'center', paddingTop: 21, paddingBottom: 5 },
  bottomLinkText: { color: '#99A299', fontSize: 10 },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
