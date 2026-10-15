import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/app-icon';
import { useAuth } from '@/context/auth-context';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import type { Category, Item } from '@/types/models';

type ItemResponse = { item: Item };
type CategoriesResponse = { categories: Category[] };
type RequestResponse = { request: { id: string } };
type LifecycleEvent = { id: string; event: string; note: string | null; createdAt: string };

export default function ItemDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, token, ready } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [item, setItem] = useState<Item | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lifecycle, setLifecycle] = useState<LifecycleEvent[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportingUser, setReportingUser] = useState(false);
  const [reportReason, setReportReason] = useState('MISLEADING_LISTING');
  const [reportDescription, setReportDescription] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const isOwner = item?.owner.id === user?.id;
  const canRequest = (item?.status === 'AVAILABLE' || item?.status === 'REQUESTED') && !item?.activeExchangeRequestId;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<ItemResponse>(`/items/${id}`);
      setItem(result.item);
      setSelectedImage(0);
      const categoryResult = await apiRequest<CategoriesResponse>('/categories');
      setCategories(categoryResult.categories);
      const history = await apiRequest<{ events: LifecycleEvent[] }>(`/items/${id}/lifecycle`);
      setLifecycle(history.events);
      if (token) {
        const saved = await apiRequest<{ items: Item[] }>('/wishlist', { token });
        setIsSaved(saved.items.some((entry) => entry.id === result.item.id));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this item.');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  // Load the selected listing when its route parameter changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#237A57" /></View>;
  if (!user) return <Redirect href="/login" />;

  async function requestItem() {
    if (!item || !token) return;
    setSubmitting(true);
    setError('');
    try {
      await apiRequest<RequestResponse>('/requests', {
        method: 'POST',
        token,
        body: { itemId: item.id, ...(message.trim() ? { message: message.trim() } : {}) },
      });
      Alert.alert('Request sent', 'The owner has been notified. You can follow your request in your profile.');
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your request.');
    } finally {
      setSubmitting(false);
    }
  }

  function beginRequest() {
    if (!item) return;
    if (item.exchangeType === 'EXCHANGE') {
      router.push({ pathname: '/exchange-request', params: { itemId: item.id } });
      return;
    }
    void requestItem();
  }

  async function toggleSaved() {
    if (!item || !token) return;
    setSubmitting(true);
    setError('');
    try {
      if (isSaved) {
        await apiRequest(`/wishlist/${item.id}`, { method: 'DELETE', token });
        setIsSaved(false);
      } else {
        await apiRequest(`/wishlist/${item.id}`, { method: 'POST', token, body: {} });
        setIsSaved(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update saved items.');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeItem() {
    if (!item || !token) return;
    setSubmitting(true);
    try {
      await apiRequest(`/items/${item.id}`, { method: 'DELETE', token });
      router.replace('/home');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the listing.');
    } finally {
      setSubmitting(false);
    }
  }

  async function recordDonation() {
    if (!item || !token) return;
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(`/donations/${item.id}/complete`, { method: 'POST', token });
      Alert.alert('Donation recorded', 'The item is now marked as donated and included in your impact.');
      router.replace('/home');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this donation.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReport() {
    if (!item || !token || !reportDescription.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest('/community/reports', { method: 'POST', token, body: reportingUser ? { targetUserId: item.owner.id, category: 'SUSPICIOUS_USER', description: reportDescription.trim() } : { itemId: item.id, category: reportReason, description: reportDescription.trim() } });
      setReportOpen(false); setReportDescription('');
      Alert.alert('Report submitted', 'A campus administrator can now review this listing.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit this report.'); }
    finally { setSubmitting(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#237A57" /></View>;
  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Back</Text></Pressable>
        <View style={styles.unavailable}><Text style={styles.title}>This listing isn’t available</Text><Text style={styles.muted}>{error || 'It may have been removed or requested.'}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, !isOwner && canRequest && styles.contentWithDock]}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Back to browsing</Text></Pressable>
        {item.images.length ? <>
          <Pressable onPress={() => setImageViewerOpen(true)} accessibilityRole="button" accessibilityLabel="View full image" style={[styles.imageFrame, { width: Math.min(screenWidth - 40, 760), height: Math.min(Math.max(screenWidth * 0.78, 250), screenHeight * 0.48, 480) }]}>
            <Image source={{ uri: `${resolveMediaUrl(item.images[Math.min(selectedImage, item.images.length - 1)].url)}` }} contentFit="contain" transition={150} style={styles.fullImage} />
            <Text style={styles.imageCount}>{selectedImage + 1} / {item.images.length} ? Tap to view full screen</Text>
          </Pressable>
          {item.images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageThumbRail}>{item.images.map((image, index) => <Pressable key={image.id} onPress={() => setSelectedImage(index)} accessibilityRole="button" accessibilityLabel={`Show photo ${index + 1}`} style={[styles.imageThumbWrap, selectedImage === index && styles.imageThumbSelected]}><Image source={{ uri: `${resolveMediaUrl(image.url)}` }} contentFit="cover" style={styles.imageThumb} /></Pressable>)}</ScrollView> : null}
          <Modal visible={imageViewerOpen} animationType="fade" onRequestClose={() => setImageViewerOpen(false)} statusBarTranslucent>
            <View style={styles.viewer}><Pressable onPress={() => setImageViewerOpen(false)} style={styles.viewerClose}><Text style={styles.viewerCloseText}>Close</Text></Pressable><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: selectedImage * screenWidth, y: 0 }} onMomentumScrollEnd={(event) => setSelectedImage(Math.round(event.nativeEvent.contentOffset.x / screenWidth))}>{item.images.map((image) => <View key={image.id} style={{ width: screenWidth, height: screenHeight, alignItems: 'center', justifyContent: 'center' }}><Image source={{ uri: `${resolveMediaUrl(image.url)}` }} contentFit="contain" style={{ width: screenWidth, height: screenHeight * 0.86 }} /></View>)}</ScrollView><Text style={styles.viewerCount}>{selectedImage + 1} / {item.images.length}</Text></View>
          </Modal>
        </> : <View style={[styles.image, styles.placeholder]}><Text style={styles.placeholderMark}>?</Text><Text style={styles.muted}>Ready for a new chapter</Text></View>}

        <View style={styles.chips}>
          <View style={styles.categoryTag}><AppIcon name="category" size={14} color="#708078" /><Text style={styles.category}>{item.category.name}</Text></View>
          <View style={[styles.exchangeChip, item.exchangeType === 'DONATION' && styles.donationChip]}><AppIcon name={item.exchangeType === 'DONATION' ? 'donate' : item.exchangeType === 'SALE' ? 'sell' : 'exchange'} size={12} color={item.exchangeType === 'DONATION' ? '#8A6132' : '#286343'} /><Text style={[styles.typeLabel, item.exchangeType === 'DONATION' && styles.donationLabel]}>{item.exchangeType === 'DONATION' ? 'DONATION' : item.exchangeType === 'SALE' ? 'FOR SALE' : 'EXCHANGE'}</Text></View>
          {item.exchangeType === 'SALE' && item.price != null ? <Text style={styles.price}>Rs {Number(item.price).toFixed(2)}{item.priceNegotiable ? ' · negotiable' : ''}</Text> : null}
        </View>
        <Text style={styles.title}>{item.title}</Text>
        {item.exchangeType === 'EXCHANGE' && item.exchangePreferredCategories?.length ? <View style={{ marginTop: 12 }}><Text style={styles.factLabel}>PREFERRED EXCHANGE CATEGORIES</Text><View style={styles.preferenceRail}>{item.exchangePreferredCategories.map((categoryId) => categories.find((category) => category.id === categoryId)?.name).filter((name): name is string => Boolean(name)).map((name) => <Text key={name} style={styles.preferenceChip}>{name}</Text>)}</View></View> : null}
        {item.sustainabilityScore ? <View style={styles.scoreCard}><Text style={styles.scoreTitle}>Sustainability score · estimated</Text><Text style={styles.scoreValue}>{item.sustainabilityScore.score} / 100</Text><Text style={styles.muted}>{item.sustainabilityScore.label}. This is a rule-based reuse-potential estimate, not a certified measurement.</Text></View> : null}
        <Text style={styles.byline}>Shared by {item.owner.name} · {new Date(item.createdAt).toLocaleDateString()}</Text>
        {item.activeExchangeRequestId ? <Text style={styles.muted}>An active transaction is in progress for this item.</Text> : null}

        <View style={styles.facts}>
          <Fact label="Condition" value={item.condition.replace('_', ' ')} />
          <View style={styles.factDivider} />
          <Fact label="Estimated weight" value={item.estimatedWeightKg ? `${item.estimatedWeightKg} kg` : 'Not provided'} />
        </View>

        <Text style={styles.sectionTitle}>About this item</Text>
        <Text style={styles.description}>{item.description}</Text>
        {lifecycle.length ? <View style={{ marginTop: 20 }}><Text style={styles.sectionTitle}>Item journey</Text>{lifecycle.map((event) => <View key={event.id} style={{ borderLeftWidth: 2, borderLeftColor: '#B7D1B9', paddingLeft: 12, paddingBottom: 12, marginTop: 8 }}><Text style={{ color: '#345744', fontSize: 13, fontWeight: '700' }}>{event.event.replaceAll('_', ' ')}</Text><Text style={{ color: '#849087', fontSize: 11, marginTop: 3 }}>{new Date(event.createdAt).toLocaleString()}</Text>{event.note ? <Text style={{ color: '#657268', fontSize: 11, marginTop: 3 }}>{event.note}</Text> : null}</View>)}</View> : null}

        {!isOwner && item.status === 'AVAILABLE' ? <Pressable disabled={submitting} onPress={() => void toggleSaved()} style={styles.saveItem}><Text style={styles.saveItemText}>{isSaved ? '♥  Saved · Remove from saved' : '♡  Save this item'}</Text></Pressable> : null}
        {!isOwner ? <View style={{ marginTop: 12 }}><View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => { setReportingUser(false); setReportReason('MISLEADING_LISTING'); setReportOpen(true); }} style={styles.saveItem}><Text style={styles.saveItemText}>Report listing</Text></Pressable><Pressable onPress={() => { setReportingUser(true); setReportOpen(true); }} style={styles.saveItem}><Text style={styles.saveItemText}>Report owner</Text></Pressable></View>{reportOpen ? <View style={styles.requestBox}><Text style={styles.requestTitle}>{reportingUser ? 'Report this user to campus administrators' : 'Why are you reporting this listing?'}</Text>{!reportingUser ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{['INAPPROPRIATE_ITEM','MISLEADING_LISTING','SPAM','PROHIBITED_ITEM','OTHER'].map((reason) => <Pressable key={reason} onPress={() => setReportReason(reason)} style={{ backgroundColor: reportReason === reason ? '#237A57' : '#EDF2EC', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9 }}><Text style={{ color: reportReason === reason ? '#FFFFFF' : '#3E614B', fontSize: 10, fontWeight: '700' }}>{reason.replaceAll('_', ' ')}</Text></Pressable>)}</View> : null}<TextInput value={reportDescription} onChangeText={setReportDescription} maxLength={1500} multiline placeholder="Describe the issue" placeholderTextColor="#929C93" style={styles.messageInput} /><Pressable disabled={submitting || !reportDescription.trim()} onPress={() => void submitReport()} style={[styles.primaryButton, (submitting || !reportDescription.trim()) && styles.disabled]}><Text style={styles.primaryText}>{submitting ? 'Sending…' : 'Send report'}</Text></Pressable></View> : null}</View> : null}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {isOwner ? (
          <View style={styles.actions}>
            <Pressable onPress={() => router.push({ pathname: '/add', params: { itemId: item.id } })} style={styles.primaryButton}><Text style={styles.primaryText}>Edit listing</Text></Pressable>
            <Pressable onPress={() => router.push({ pathname: '/requests', params: { direction: 'received' } })} style={styles.secondaryButton}><Text style={styles.secondaryText}>Incoming requests</Text></Pressable>
            {item.exchangeType === 'DONATION' && item.status === 'AVAILABLE' ? <Pressable disabled={submitting} onPress={() => void recordDonation()} style={styles.secondaryButton}><Text style={styles.secondaryText}>{submitting ? 'Saving…' : 'Record completed donation'}</Text></Pressable> : null}
            {item.status === 'AVAILABLE' ? <Pressable disabled={submitting} onPress={() => void removeItem()} style={styles.secondaryButton}><Text style={styles.secondaryText}>{submitting ? 'Removing…' : 'Remove listing'}</Text></Pressable> : null}
          </View>
        ) : canRequest ? item.exchangeType === 'EXCHANGE' ? (
          <View style={styles.requestBox}>
            <Text style={styles.requestTitle}>Request an item-for-item exchange</Text>
            <Text style={styles.requestHint}>Choose one of your available listings to offer. The holder can review the item before deciding.</Text>
          </View>
        ) : (
          <View style={styles.requestBox}>
            <Text style={styles.requestTitle}>{item.exchangeType === 'DONATION' ? 'Would this help you?' : item.exchangeType === 'SALE' ? 'Interested in buying?' : 'Interested in an exchange?'}</Text>
            <Text style={styles.requestHint}>A short message can help the owner get back to you.</Text>
            <TextInput value={message} onChangeText={setMessage} placeholder="Add an optional message" placeholderTextColor="#929C93" multiline maxLength={1000} style={styles.messageInput} />
          </View>
        ) : <Text style={styles.muted}>This item is {item.status.toLowerCase().replace('_', ' ')} and cannot be requested right now.</Text>}
      </ScrollView>
      {!isOwner && canRequest ? <View style={styles.stickyDock}>
        <Pressable disabled={submitting} onPress={() => void toggleSaved()} style={styles.dockSave} accessibilityLabel={isSaved ? 'Remove from saved items' : 'Save this item'}><Text style={styles.dockSaveText}>{isSaved ? '♥' : '♡'}</Text></Pressable>
        <Pressable disabled={submitting} onPress={beginRequest} style={[styles.dockRequest, submitting && styles.disabled]}>
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{item.exchangeType === 'DONATION' ? 'Request donation' : item.exchangeType === 'SALE' ? 'Request to buy' : 'Choose item to offer'}</Text>}
        </Pressable>
      </View> : null}
    </SafeAreaView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>;
}

const styles = {
  safe: { flex: 1, backgroundColor: '#F7F8F3' },
  content: { paddingHorizontal: 20, paddingTop: 7, paddingBottom: 36, width: '100%', maxWidth: 760, alignSelf: 'center' },
  contentWithDock: { paddingBottom: 30 },
  back: { alignSelf: 'flex-start', paddingVertical: 9 },
  backText: { color: '#51715D', fontSize: 13, fontWeight: '600' },
  image: { width: '100%', height: 290, borderRadius: 21, marginTop: 8, backgroundColor: '#E7EFE7' },
  imageFrame: { alignSelf: 'center', marginTop: 9, borderRadius: 21, overflow: 'hidden', backgroundColor: '#E7EFE7', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  imageCount: { position: 'absolute', right: 10, bottom: 9, color: '#FFFFFF', backgroundColor: '#1C3529B8', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, fontSize: 10, fontWeight: '700' },
  imageThumbRail: { flexDirection: 'row', gap: 9, paddingTop: 10, paddingBottom: 2 },
  imageThumbWrap: { width: 62, height: 62, borderRadius: 11, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  imageThumbSelected: { borderColor: '#34825B' },
  imageThumb: { width: '100%', height: '100%' },
  viewer: { flex: 1, backgroundColor: '#101512', justifyContent: 'center' },
  viewerClose: { position: 'absolute', zIndex: 2, top: 48, right: 20, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: '#FFFFFF25' },
  viewerCloseText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  viewerCount: { position: 'absolute', bottom: 30, alignSelf: 'center', color: '#FFFFFF', fontSize: 12 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderMark: { color: '#70A17C', fontSize: 50, fontWeight: '700', marginBottom: 3 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 22 },
  category: { color: '#708078', fontSize: 12, fontWeight: '600' },
  categoryTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exchangeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E4F0E5', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  typeLabel: { color: '#286343', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  donationLabel: { color: '#8A6132' },
  donationChip: { color: '#8A6132', backgroundColor: '#F7EEDC' },
  price: { color: '#32704C', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#EEF4E9', borderRadius: 8 },
  preferenceRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  preferenceChip: { color: '#286343', backgroundColor: '#E4F0E5', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, fontSize: 10, fontWeight: '700' },
  title: { color: '#1D3C2D', fontSize: 29, lineHeight: 35, fontWeight: '700', letterSpacing: -0.7, marginTop: 9 },
  byline: { color: '#869188', fontSize: 12, marginTop: 7 },
  scoreCard: { backgroundColor: '#E7EFE3', padding: 15, borderRadius: 15, marginTop: 15 },
  scoreTitle: { color: '#617968', fontSize: 10, fontWeight: '700' },
  scoreValue: { color: '#22573C', fontSize: 22, fontWeight: '800', marginTop: 5 },
  facts: { backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: '#E7ECE5', padding: 15, marginTop: 19 },
  fact: { flex: 1 },
  factLabel: { color: '#89948B', fontSize: 10 },
  factValue: { color: '#344A3C', fontSize: 13, fontWeight: '700', marginTop: 5 },
  factDivider: { width: 1, height: 34, backgroundColor: '#E5EAE3', marginHorizontal: 14 },
  sectionTitle: { color: '#2B4234', fontSize: 16, fontWeight: '700', marginTop: 23 },
  description: { color: '#6F7C72', fontSize: 14, lineHeight: 21, marginTop: 8 },
  saveItem: { alignSelf: 'flex-start', marginTop: 16, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#FFFFFF', borderColor: '#D9E5D9', borderWidth: 1, borderRadius: 11 },
  saveItemText: { color: '#34724F', fontSize: 12, fontWeight: '700' },
  requestBox: { marginTop: 23, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#E6EBE3', borderRadius: 18 },
  requestTitle: { color: '#2B4234', fontSize: 16, fontWeight: '700' },
  requestHint: { color: '#849087', fontSize: 11, marginTop: 5 },
  messageInput: { minHeight: 78, textAlignVertical: 'top', color: '#33463A', borderRadius: 12, borderWidth: 1, borderColor: '#E0E6DF', padding: 12, fontSize: 13, marginTop: 13 },
  actions: { gap: 9, marginTop: 23 },
  stickyDock: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E6EBE3' },
  dockSave: { width: 50, height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D9E5D9', alignItems: 'center', justifyContent: 'center' },
  dockSaveText: { color: '#34724F', fontSize: 25, lineHeight: 29 },
  dockRequest: { flex: 1, minHeight: 50, borderRadius: 13, backgroundColor: '#237A57', alignItems: 'center', justifyContent: 'center' },
  primaryButton: { minHeight: 51, borderRadius: 13, backgroundColor: '#237A57', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: '#D9E3D9', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#617367', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  error: { color: '#AC493D', fontSize: 12, marginTop: 12 },
  muted: { color: '#859188', fontSize: 13, lineHeight: 19, marginTop: 8 },
  loading: { flex: 1, backgroundColor: '#F7F8F3', alignItems: 'center', justifyContent: 'center' },
  unavailable: { flex: 1, justifyContent: 'center', padding: 24 },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
