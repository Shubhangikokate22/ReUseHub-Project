import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Modal } from 'react-native';
import { ItemCard } from '@/components/item-card';
import { AppIcon } from '@/components/app-icon';
import { CategoryCard } from '@/components/category-card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';
import type { Category, Item } from '@/types/models';

type ItemsResponse = { items: Item[]; pagination: { page: number; totalPages: number; total: number } };
type CategoriesResponse = { categories: Category[] };
const conditions = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;
const exchangeTypes = [
  { value: 'EXCHANGE', label: 'Exchange', icon: 'exchange' },
  { value: 'DONATION', label: 'Donate', icon: 'donate' },
  { value: 'SALE', label: 'Sale', icon: 'sell' },
] as const;
const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'lowestPrice', label: 'Lowest price' },
  { value: 'highestPrice', label: 'Highest price' },
] as const;

export default function ExploreScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ q?: string; categoryId?: string }>();
  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [appliedSearch, setAppliedSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(typeof params.categoryId === 'string' ? params.categoryId : '');
  const [condition, setCondition] = useState('');
  const [exchangeType, setExchangeType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [sort, setSort] = useState('newest');
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const query = useMemo(() => {
    const values = new URLSearchParams({ page: '1', limit: '20' });
    if (appliedSearch.trim()) values.set('q', appliedSearch.trim());
    if (categoryId) values.set('categoryId', categoryId);
    if (condition) values.set('condition', condition);
    if (exchangeType) values.set('exchangeType', exchangeType);
    if (exchangeType === 'SALE' && minPrice.trim()) values.set('minPrice', minPrice.trim());
    if (exchangeType === 'SALE' && maxPrice.trim()) values.set('maxPrice', maxPrice.trim());
    if (exchangeType === 'SALE' && negotiable) values.set('negotiable', 'true');
    values.set('sort', sort);
    return values.toString();
  }, [appliedSearch, categoryId, condition, exchangeType, maxPrice, minPrice, negotiable, sort]);

  const loadFirst = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [result, categoryResult] = await Promise.all([
        apiRequest<ItemsResponse>(`/items?${query}`),
        apiRequest<CategoriesResponse>('/categories'),
      ]);
      setItems(result.items);
      setPage(1);
      setTotal(result.pagination.total);
      setCategories(categoryResult.categories);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load items.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  // Keep category tiles from Home in sync when Explore is already in the tab stack.
  useEffect(() => {
    // Route parameters can change while this tab is already mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof params.categoryId === 'string') setCategoryId(params.categoryId);
    if (typeof params.q === 'string') { setSearch(params.q); setAppliedSearch(params.q); }
  }, [params.categoryId, params.q]);

  const loadSaved = useCallback(async () => {
    if (!token) return;
    try { const result = await apiRequest<{ items: Item[] }>('/wishlist', { token }); setSavedIds(result.items.map((item) => item.id)); } catch { /* Browse remains available if saved items are offline. */ }
  }, [token]);
  // Refresh search results and saved state whenever Explore becomes visible.
  useFocusEffect(useCallback(() => {
    void loadFirst(true);
    void loadSaved();
  }, [loadFirst, loadSaved]));

  const toggleSaved = async (item: Item) => {
    if (!token) return;
    const saved = savedIds.includes(item.id);
    setSavedIds((current) => saved ? current.filter((id) => id !== item.id) : [...current, item.id]);
    try { await apiRequest(`/wishlist/${item.id}`, { method: saved ? 'DELETE' : 'POST', token, body: saved ? undefined : {} }); }
    catch { setSavedIds((current) => saved ? [...current, item.id] : current.filter((id) => id !== item.id)); }
  };

  const filterCount = Number(Boolean(condition)) + Number(Boolean(exchangeType)) + Number(Boolean(categoryId)) + Number(Boolean(minPrice || maxPrice)) + Number(negotiable);

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await apiRequest<ItemsResponse>(`/items?${query.replace('page=1', `page=${nextPage}`)}`);
      setItems((current) => [...current, ...result.items]);
      setPage(nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more items.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFirst(true)} tintColor="#237A57" />}>
        <View style={styles.pageHeading}><View><Text style={styles.kicker}>CAMPUS MARKETPLACE</Text><Text style={styles.title}>Explore</Text></View><Pressable accessibilityLabel="Saved items" onPress={() => router.push('/wishlist')} style={styles.savedButton}><AppIcon name="heart" size={19} color="#45614D" /></Pressable></View>
        <View style={styles.searchBox}>
          <AppIcon name="search" size={19} color="#78857B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setAppliedSearch(search)}
            returnKeyType="search"
            placeholder="Search items"
            placeholderTextColor="#89948B"
            style={styles.searchInput}
          />
          <Pressable accessibilityLabel="Submit search" onPress={() => setAppliedSearch(search)} style={styles.searchButton}><AppIcon name="search" size={18} color="#FFFFFF" /></Pressable>
        </View>

        <View style={styles.toolbar}><Pressable onPress={() => setFiltersVisible(true)} style={styles.toolButton}><AppIcon name="filter" size={17} color="#42624D" /><Text style={styles.toolText}>Filters{filterCount ? ` · ${filterCount}` : ''}</Text></Pressable><Pressable onPress={() => setFiltersVisible(true)} style={styles.toolButton}><AppIcon name="sort" size={16} color="#42624D" /><Text style={styles.toolText}>{sortOptions.find((option) => option.value === sort)?.label}</Text></Pressable></View>

        <FilterHeading label="Category" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
          <FilterChip label="All" selected={!categoryId} onPress={() => setCategoryId('')} />
          {categories.map((category, index) => <CategoryCard key={category.id} category={category} index={index} active={category.id === categoryId} onPress={() => setCategoryId(category.id)} />)}
        </ScrollView>

        <View style={styles.resultsHeader}>
          <View><Text style={styles.sectionTitle}>Available items</Text><Text style={styles.resultsHint}>{loading ? 'Looking around campus…' : `${total} ${total === 1 ? 'item' : 'items'} to discover`}</Text></View>
          <Text style={styles.resultsMark}>↗</Text>
        </View>
        {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void loadFirst()}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
        {loading && !items.length ? <ActivityIndicator style={styles.spinner} color="#237A57" /> : null}
        {!loading && !items.length && !error ? <View style={styles.empty}><Text style={styles.emptyTitle}>Nothing here yet</Text><Text style={styles.emptyText}>Try another search or clear a filter.</Text></View> : null}
        <View style={styles.list}>
          {items.map((item) => <ItemCard key={item.id} item={item} compact saved={savedIds.includes(item.id)} onToggleSaved={() => void toggleSaved(item)} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} />)}
        </View>
        {items.length < total && <Pressable disabled={loadingMore} onPress={() => void loadMore()} style={styles.moreButton}>{loadingMore ? <ActivityIndicator color="#237A57" /> : <Text style={styles.moreText}>Load more items</Text>}</Pressable>}
      </ScrollView>
      <Modal visible={filtersVisible} transparent animationType="slide" onRequestClose={() => setFiltersVisible(false)}>
        <View style={styles.modalRoot}><Pressable accessibilityLabel="Close filters" style={styles.backdrop} onPress={() => setFiltersVisible(false)} /><View style={styles.sheet}>
          <View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Filters and sort</Text><Text style={styles.sheetHint}>Narrow down available campus listings</Text></View><Pressable onPress={() => setFiltersVisible(false)} style={styles.closeButton}><AppIcon name="close" size={18} color="#55705E" /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 18 }}>
            <FilterHeading label="Condition" /><View style={styles.chipRail}><FilterChip label="Any" selected={!condition} onPress={() => setCondition('')} />{conditions.map((value) => <FilterChip key={value} label={value.replace('_', ' ')} selected={condition === value} onPress={() => setCondition(condition === value ? '' : value)} />)}</View>
            <FilterHeading label="Listed for" /><View style={styles.chipRail}><FilterChip label="Any" selected={!exchangeType} onPress={() => setExchangeType('')} />{exchangeTypes.map((entry) => <FilterChip key={entry.value} label={entry.label} icon={entry.icon} selected={exchangeType === entry.value} onPress={() => setExchangeType(exchangeType === entry.value ? '' : entry.value)} />)}</View>
            {exchangeType === 'SALE' ? <><FilterHeading label="Price range" /><View style={styles.priceFields}><TextInput value={minPrice} onChangeText={setMinPrice} keyboardType="decimal-pad" placeholder="Minimum" placeholderTextColor="#89948B" style={styles.priceInput} /><Text style={styles.to}>to</Text><TextInput value={maxPrice} onChangeText={setMaxPrice} keyboardType="decimal-pad" placeholder="Maximum" placeholderTextColor="#89948B" style={styles.priceInput} /></View><FilterChip label={negotiable ? 'Negotiable only · on' : 'Negotiable only · off'} selected={negotiable} onPress={() => setNegotiable((value) => !value)} /></> : null}
            <FilterHeading label="Availability" /><View style={styles.availableLine}><AppIcon name="category" size={16} color="#547660" /><Text style={styles.availableText}>Available items only</Text><Text style={styles.availableOn}>ON</Text></View>
            <FilterHeading label="Sort by" /><View style={styles.chipRail}>{sortOptions.map((option) => <FilterChip key={option.value} label={option.label} selected={sort === option.value} onPress={() => setSort(option.value)} />)}</View>
          </ScrollView>
          <View style={styles.sheetActions}><Pressable onPress={() => { setCondition(''); setExchangeType(''); setMinPrice(''); setMaxPrice(''); setNegotiable(false); setSort('newest'); }} style={styles.clearButton}><Text style={styles.clearText}>Clear all</Text></Pressable><Pressable onPress={() => setFiltersVisible(false)} style={styles.applyButton}><Text style={styles.applyText}>Show {total} results</Text></Pressable></View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

function FilterHeading({ label }: { label: string }) {
  return <Text style={styles.filterHeading}>{label}</Text>;
}

function FilterChip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: 'sell'|'exchange'|'donate' }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>{icon ? <AppIcon name={icon} size={14} color={selected ? '#237A57' : '#728076'} /> : null}<Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

const styles = {
  safe: { flex: 1, backgroundColor: '#F7F8F3' },
  content: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 36, width: '100%', maxWidth: 780, alignSelf: 'center' },
  pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savedButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5EAE3' },
  kicker: { color: '#62816C', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#1D3C2D', fontSize: 31, lineHeight: 35, fontWeight: '700', letterSpacing: -0.7, marginTop: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 51, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8E0', backgroundColor: '#FFFFFF', padding: 5, paddingLeft: 14, marginTop: 15 },
  searchInput: { flex: 1, color: '#26382E', fontSize: 14, paddingVertical: 0 },
  searchButton: { width: 40, height: 40, backgroundColor: '#237A57', alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  searchButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  filterHeading: { color: '#44574A', fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  toolbar: { flexDirection: 'row', gap: 8, marginTop: 11 },
  toolButton: { height: 39, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E9E2', flexDirection: 'row', alignItems: 'center', gap: 7 },
  toolText: { color: '#47624F', fontSize: 11, fontWeight: '700' },
  chipRail: { flexDirection: 'row', gap: 7, paddingRight: 10 },
  priceFields: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  priceInput: { flex: 1, height: 42, borderRadius: 11, borderWidth: 1, borderColor: '#E1E7DF', backgroundColor: '#FFFFFF', paddingHorizontal: 12, color: '#26382E', fontSize: 12 },
  to: { color: '#839087', fontSize: 11 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: '#E1E7DF', backgroundColor: '#FFFFFF' },
  chipSelected: { backgroundColor: '#E4F0E5', borderColor: '#BDD6C2' },
  chipText: { color: '#718076', fontSize: 11, fontWeight: '600' },
  chipTextSelected: { color: '#286343', fontWeight: '700' },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 29, marginBottom: 13 },
  sectionTitle: { color: '#20382B', fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  resultsHint: { color: '#8A948B', fontSize: 11, marginTop: 4 },
  resultsMark: { color: '#76A283', fontSize: 23 },
  list: { gap: 11 },
  spinner: { marginVertical: 30 },
  empty: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#E7ECE5' },
  emptyTitle: { color: '#344A3C', fontWeight: '700', fontSize: 15 },
  emptyText: { color: '#849087', fontSize: 12, marginTop: 6 },
  errorCard: { borderRadius: 15, padding: 15, backgroundColor: '#FFF4F0', marginBottom: 12 },
  errorText: { color: '#A3463A', fontSize: 12 },
  retry: { color: '#237A57', fontWeight: '700', fontSize: 12, marginTop: 8 },
  moreButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: '#D8E3D8', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  moreText: { color: '#237A57', fontSize: 13, fontWeight: '700' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,39,29,0.38)' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { maxHeight: '84%', backgroundColor: '#F8F9F5', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 19, paddingTop: 9, paddingBottom: 19, width: '100%', maxWidth: 700, alignSelf: 'center' },
  sheetHandle: { width: 37, height: 4, borderRadius: 3, backgroundColor: '#D5DDD4', alignSelf: 'center', marginBottom: 15 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  sheetTitle: { color: '#20382B', fontSize: 20, fontWeight: '800' },
  sheetHint: { color: '#829087', fontSize: 11, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#E9EFE8', alignItems: 'center', justifyContent: 'center' },
  availableLine: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5EAE3', padding: 11 },
  availableText: { color: '#52675A', fontSize: 12, flex: 1 },
  availableOn: { color: '#28714B', fontSize: 10, fontWeight: '800' },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: '#E6EAE4', paddingTop: 12 },
  clearButton: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center' },
  clearText: { color: '#5A7060', fontSize: 12, fontWeight: '700' },
  applyButton: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: '#237A57', alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
