import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File as ExpoFile } from 'expo-file-system';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { apiRequest, API_BASE_URL } from '@/lib/api';
import type { Category, Item, ItemImage } from '@/types/models';

type CategoriesResponse = { categories: Category[] };
type ItemsResponse = { items: Item[] };
type ItemResponse = { item: Item };
type ImageResponse = { image: ItemImage };
type SelectedPhoto = { uri: string; width: number; height: number; originalSize?: number | null };
const MAX_ITEM_IMAGES = 5;

const conditions = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like new' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
] as const;

export default function AddItemScreen() {
  const params = useLocalSearchParams<{ itemId?: string; type?: 'SALE'|'EXCHANGE'|'DONATION' }>();
  const router = useRouter();
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [itemId, setItemId] = useState(params.itemId ?? '');
  const [existingImages, setExistingImages] = useState<ItemImage[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<(typeof conditions)[number]['value']>('GOOD');
  const [exchangeType, setExchangeType] = useState<'EXCHANGE' | 'DONATION' | 'SALE'>(params.type ?? 'EXCHANGE');
  const [price, setPrice] = useState('');
  const [priceNegotiable, setPriceNegotiable] = useState(false);
  const [exchangePreferredCategories, setExchangePreferredCategories] = useState<string[]>([]);
  const [weight, setWeight] = useState('');
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const categoryResult = await apiRequest<CategoriesResponse>('/categories');
      setCategories(categoryResult.categories);
      if (categoryResult.categories.length && !params.itemId) setCategoryId((current) => current || categoryResult.categories[0].id);
      if (params.itemId && token) {
        const mine = await apiRequest<ItemsResponse>('/items/mine', { token });
        const item = mine.items.find((value) => value.id === params.itemId);
        if (!item) throw new Error('That listing could not be found in your items.');
        setItemId(item.id);
        setTitle(item.title);
        setDescription(item.description);
        setCategoryId(item.category.id);
        setCondition(item.condition);
        setExchangeType(item.exchangeType);
        setExchangePreferredCategories(item.exchangePreferredCategories ?? []);
        setPrice(item.price == null ? '' : String(item.price));
        setPriceNegotiable(item.priceNegotiable);
        setWeight(item.estimatedWeightKg ? String(item.estimatedWeightKg) : '');
        setExistingImages(item.images);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load listing details.');
    } finally {
      setLoading(false);
    }
  }, [params.itemId, token]);

  // Fetch listing data after mount or itemId changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  // Apply the selected center-tab action before the listing form is shown.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (params.type && !params.itemId) setExchangeType(params.type); }, [params.itemId, params.type]);

  async function choosePhoto() {
    setError('');
    const availableSlots = MAX_ITEM_IMAGES - existingImages.length - photos.length;
    if (availableSlots < 1) {
      setError(`You can add up to ${MAX_ITEM_IMAGES} photos to one listing.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: availableSlots,
      quality: 0.9,
      exif: false,
    });
    if (result.canceled) return;
    try {
      const optimized = await Promise.all(result.assets.map(async (asset) => {
        const context = ImageManipulator.manipulate(asset.uri);
        if (asset.width > 1280) context.resize({ width: 1280, height: null });
        const rendered = await context.renderAsync();
        const compressed = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.78 });
        return { uri: compressed.uri, width: compressed.width, height: compressed.height, originalSize: asset.fileSize };
      }));
      setPhotos((current) => [...current, ...optimized].slice(0, MAX_ITEM_IMAGES - existingImages.length));
    } catch {
      setError('Could not resize this photo. Please choose another image.');
    }
  }

  async function sendPhoto(savedItemId: string) {
    if (!photos.length || !token) return [];
    const uploadedImages: ItemImage[] = [];
    for (const photo of photos) {
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(photo.uri)).blob();
        form.append('image', blob, `reusehub-${Date.now()}.jpg`);
      } else {
        form.append('image', new ExpoFile(photo.uri));
      }
      const uploaded = await apiRequest<ImageResponse>(`/items/${savedItemId}/images`, { method: 'POST', token, body: form, timeoutMs: 60_000 });
      uploadedImages.push(uploaded.image);
      setExistingImages((current) => [...current, uploaded.image]);
      setPhotos((current) => current.filter((entry) => entry.uri !== photo.uri));
    }
    return uploadedImages;
  }

  async function removeExistingImage(image: ItemImage) {
    if (!itemId || !token) return;
    try {
      await apiRequest(`/items/${itemId}/images/${image.id}`, { method: 'DELETE', token });
      setExistingImages((current) => current.filter((entry) => entry.id !== image.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this photo.');
    }
  }

  async function saveItem() {
    if (!token) return;
    if (title.trim().length < 2 || !description.trim() || !categoryId) {
      setError('Add a title, description, and category before saving.');
      return;
    }
    const parsedWeight = weight.trim() ? Number(weight) : undefined;
    if (parsedWeight !== undefined && (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 1000)) {
      setError('Estimated weight must be between 0 and 1,000 kg.');
      return;
    }
    const parsedPrice = price.trim() ? Number(price) : undefined;
    if (exchangeType === 'SALE' && (parsedPrice === undefined || !Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 1_000_000)) {
      setError('Enter a sale price greater than 0 and no higher than 1,000,000.');
      return;
    }

    setSaving(true);
    setError('');
    let listingSaved = false;
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        condition,
        exchangeType,
        estimatedWeightKg: parsedWeight ?? null,
        price: exchangeType === 'SALE' ? parsedPrice : null,
        priceNegotiable: exchangeType === 'SALE' && priceNegotiable,
        exchangePreferredCategories: exchangeType === 'EXCHANGE' ? exchangePreferredCategories : [],
      };
      const result = itemId
        ? await apiRequest<ItemResponse>(`/items/${itemId}`, { method: 'PUT', token, body })
        : await apiRequest<ItemResponse>('/items', { method: 'POST', token, body });
      listingSaved = true;
      setItemId(result.item.id);
      const uploadedImages = photos.length ? await sendPhoto(result.item.id) : [];
      Alert.alert(itemId ? 'Listing updated' : 'Listing created', uploadedImages.length ? 'Your item and photos are ready to be discovered.' : photos.length ? 'Your item was saved. Some selected photos still need to be uploaded.' : 'Your item has been saved.');
      router.replace({ pathname: '/item/[id]', params: { id: result.item.id } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save this listing.';
      setError(listingSaved
        ? `Your listing was saved, but a photo could not be uploaded. ${message} Your remaining photos are still selected; tap “Save changes” to retry.`
        : message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#237A57" /></View>;

  const displayedPhoto = existingImages[0]?.url ? `${API_BASE_URL.replace(/\/api$/, '')}${existingImages[0].url}` : photos[0]?.uri ?? null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>{itemId ? 'YOUR LISTING' : 'PASS IT ALONG'}</Text>
          <Text style={styles.title}>{itemId ? 'Edit your item' : 'List something useful.'}</Text>
          <Text style={styles.intro}>A little detail helps the right person find it.</Text>

          <Text style={styles.label}>Photos (up to 5)</Text>
          <Pressable onPress={() => void choosePhoto()} style={styles.photoBox}>
            {displayedPhoto ? <Image source={{ uri: displayedPhoto }} contentFit="cover" style={styles.photo} /> : <View style={styles.photoPlaceholder}><Text style={styles.photoGlyph}>+</Text><Text style={styles.photoTitle}>Add item photos</Text><Text style={styles.photoHint}>Images are resized and compressed for upload</Text></View>}
          </Pressable>
          {photos.length ? <Text style={styles.imageSize}>{photos.length} new photo(s) selected and resized for upload</Text> : existingImages.length ? <Text style={styles.imageSize}>{existingImages.length} stored photo(s) ? {Math.round(existingImages.reduce((sum, image) => sum + (image.storageSizeBytes ?? 0), 0) / 1024)} KB total</Text> : null}
          <Pressable onPress={() => void choosePhoto()} style={styles.photoAction}><Text style={styles.photoActionText}>{existingImages.length + photos.length ? `Add photos (${existingImages.length + photos.length}/${MAX_ITEM_IMAGES})` : 'Choose photos from device'}</Text></Pressable>
          {existingImages.length + photos.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailRail}>
            {existingImages.map((image, index) => <View key={image.id} style={styles.thumbnailWrap}><Image source={{ uri: `${API_BASE_URL.replace(/\/api$/, '')}${image.url}` }} contentFit="cover" style={styles.thumbnail} /><Pressable onPress={() => void removeExistingImage(image)} style={styles.removeThumbnail}><Text style={styles.removeThumbnailText}>{String.fromCharCode(215)}</Text></Pressable>{index === 0 ? <Text style={styles.primaryImageTag}>Primary</Text> : null}</View>)}
            {photos.map((selected, index) => <View key={`${selected.uri}-${index}`} style={styles.thumbnailWrap}><Image source={{ uri: selected.uri }} contentFit="cover" style={styles.thumbnail} /><Pressable onPress={() => setPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index))} style={styles.removeThumbnail}><Text style={styles.removeThumbnailText}>{String.fromCharCode(215)}</Text></Pressable>{existingImages.length === 0 && index === 0 ? <Text style={styles.primaryImageTag}>Primary</Text> : null}</View>)}
          </ScrollView> : null}

          <Field label="Item name" value={title} onChangeText={setTitle} placeholder="e.g. First year biology textbook" maxLength={150} />
          <Field label="Description" value={description} onChangeText={setDescription} placeholder="Describe its condition and anything the next person should know" multiline maxLength={10000} />

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
            {categories.map((category) => <Option key={category.id} label={category.name} selected={category.id === categoryId} onPress={() => setCategoryId(category.id)} />)}
          </ScrollView>

          <Text style={styles.label}>Condition</Text>
          <View style={styles.options}>
            {conditions.map((entry) => <Option key={entry.value} label={entry.label} selected={condition === entry.value} onPress={() => setCondition(entry.value)} />)}
          </View>

          <Text style={styles.label}>How can someone get it?</Text>
          <View style={styles.options}>
            <Option label="Sell" selected={exchangeType === 'SALE'} onPress={() => setExchangeType('SALE')} />
            <Option label="Exchange" selected={exchangeType === 'EXCHANGE'} onPress={() => setExchangeType('EXCHANGE')} />
            <Option label="Donate" selected={exchangeType === 'DONATION'} onPress={() => setExchangeType('DONATION')} />
          </View>

          {exchangeType === 'EXCHANGE' ? <View style={{ marginBottom: 13 }}><Text style={styles.label}>Preferred exchange categories (optional)</Text><Text style={styles.helper}>These help other students find a suitable offer. You can still consider other items.</Text><View style={[styles.options, { marginTop: 9 }]}>{categories.map((category) => { const selected = exchangePreferredCategories.includes(category.id); return <Option key={category.id} label={category.name} selected={selected} onPress={() => setExchangePreferredCategories((current) => selected ? current.filter((id) => id !== category.id) : [...current, category.id])} />; })}</View></View> : null}

          {exchangeType === 'SALE' ? <>
            <Field label="Price" value={price} onChangeText={setPrice} placeholder="e.g. 500" keyboardType="decimal-pad" />
            <Pressable onPress={() => setPriceNegotiable((value) => !value)} style={styles.negotiable} accessibilityRole="checkbox" accessibilityState={{ checked: priceNegotiable }}>
              <Text style={styles.negotiableMark}>{priceNegotiable ? '✓' : '○'}</Text><Text style={styles.negotiableText}>Price is negotiable</Text>
            </Pressable>
          </> : null}

          <Field label="Estimated weight (optional, kg)" value={weight} onChangeText={setWeight} placeholder="e.g. 0.5" keyboardType="decimal-pad" />
          <Text style={styles.helper}>Weight is optional. Sustainability impact will be shown as an estimate.</Text>

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable disabled={saving} onPress={() => void saveItem()} style={[styles.saveButton, saving && styles.disabled]}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{itemId ? 'Save changes' : 'Publish listing'}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, multiline, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#96A097" style={[styles.input, multiline && styles.multiline]} multiline={multiline} autoCorrect={false} {...props} /></View>;
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.option, selected && styles.optionSelected]}><Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text></Pressable>;
}

const styles = {
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#F7F8F3' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 38, width: '100%', maxWidth: 700, alignSelf: 'center' },
  kicker: { color: '#65816C', fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#1D3C2D', fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -0.7, marginTop: 7 },
  intro: { color: '#839087', fontSize: 12, marginTop: 5, marginBottom: 23 },
  label: { color: '#3B5143', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  photoBox: { height: 190, overflow: 'hidden', borderRadius: 17, backgroundColor: '#E7EFE7', borderWidth: 1, borderColor: '#DDE7DB' },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoGlyph: { color: '#4D8A61', fontSize: 34, fontWeight: '500' },
  photoTitle: { color: '#456750', fontSize: 13, fontWeight: '700', marginTop: 5 },
  photoHint: { color: '#819487', fontSize: 10, marginTop: 4 },
  imageSize: { color: '#869289', fontSize: 10, marginTop: 7 },
  photoAction: { alignSelf: 'flex-start', paddingVertical: 9, marginBottom: 9 },
  photoActionText: { color: '#237A57', fontSize: 12, fontWeight: '700' },
  thumbnailRail: { flexDirection: 'row', gap: 9, paddingBottom: 12 },
  thumbnailWrap: { width: 76, height: 70, borderRadius: 11, overflow: 'hidden', position: 'relative' },
  thumbnail: { width: '100%', height: '100%' },
  removeThumbnail: { position: 'absolute', right: 3, top: 3, width: 23, height: 23, borderRadius: 12, backgroundColor: '#21392B', alignItems: 'center', justifyContent: 'center' },
  removeThumbnailText: { color: '#FFFFFF', fontSize: 16, lineHeight: 19 },
  primaryImageTag: { position: 'absolute', left: 3, bottom: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: '#FFFFFF', color: '#276441', fontSize: 8, fontWeight: '700' },
  field: { marginTop: 12 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#DFE6DD', backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: '#2B4033', fontSize: 13 },
  multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
  options: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  option: { borderRadius: 18, borderWidth: 1, borderColor: '#E0E6DE', backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 9 },
  optionSelected: { backgroundColor: '#E5F0E5', borderColor: '#BCD5C0' },
  optionText: { color: '#758279', fontSize: 11, fontWeight: '600' },
  optionTextSelected: { color: '#276441', fontWeight: '700' },
  helper: { color: '#89938B', fontSize: 10, marginTop: 1 },
  negotiable: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10 },
  negotiableMark: { color: '#237A57', fontSize: 18 },
  negotiableText: { color: '#52675A', fontSize: 12, fontWeight: '600' },
  error: { color: '#A3463A', fontSize: 12, lineHeight: 18, marginTop: 12 },
  saveButton: { minHeight: 52, borderRadius: 13, backgroundColor: '#237A57', alignItems: 'center', justifyContent: 'center', marginTop: 21 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F3' },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
