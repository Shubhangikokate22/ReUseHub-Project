import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File as ExpoFile } from 'expo-file-system';
import { Image } from 'expo-image';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { Redirect } from 'expo-router';
import { Alert, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ActionButton, cardStyle, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest, ApiError, resolveMediaUrl } from '@/lib/api';

type Category = { id: string; name: string; slug: string };
type Campaign = { id: string; title: string; description: string; neededItems: string; acceptedCategories: string | null; location: string | null; instructions: string | null; coordinator: string | null; imageUrl: string | null; startDate: string | null; endDate: string | null; status: string; _count: { donations: number } };
type CampaignDonation = { id: string; user: { id: string; name: string; email: string }; category: string; itemDetails: string; status: string; submittedAt: string };
type Form = { title: string; description: string; location: string; instructions: string; coordinator: string; imageUrl: string; startDate: string; startTime: string; endDate: string; endTime: string; categoryIds: string[] };
type PickerTarget = 'startDate' | 'startTime' | 'endDate' | 'endTime';

const emptyForm: Form = { title: '', description: '', location: '', instructions: '', coordinator: '', imageUrl: '', startDate: '', startTime: '', endDate: '', endTime: '', categoryIds: [] };
const inputStyle = { backgroundColor: '#FFFFFF', borderColor: '#E2E9E1', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#24382B', marginTop: 9 } as const;
const labelStyle = { color: '#526A59', fontSize: 12, fontWeight: '700' as const, marginTop: 14 };
const fieldStyle = { minHeight: 46, justifyContent: 'center' as const, borderColor: '#E2E9E1', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 7, backgroundColor: '#fff' };
const weekdayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const dateText = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';
const todayInKolkata = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const timeInKolkata = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const fromDate = (value?: string, time?: string) => {
  const [year, month, day] = (value || todayInKolkata()).split('-').map(Number);
  const [hour, minute] = (time || timeInKolkata()).split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
};
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const timeKey = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
const formatDate = (value: string) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date';
const formatTime = (value: string) => { if (!value) return 'Select time'; const [hour, minute] = value.split(':').map(Number); return new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString('en-IN', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }); };
const parseSchedule = (date: string, time: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) return null;
  const [, year, month, day] = match.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return Date.UTC(year, month - 1, day, hour, minute) - 330 * 60_000;
};

export default function AdminCampaignsScreen() {
  const { user, token, ready } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [imageUri, setImageUri] = useState('');
  const [editing, setEditing] = useState('');
  const [selected, setSelected] = useState('');
  const [donations, setDonations] = useState<CampaignDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [validation, setValidation] = useState('');
  const [picker, setPicker] = useState<PickerTarget | ''>('');
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = fromDate(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [webTimeValue, setWebTimeValue] = useState('');

  const load = useCallback(async () => {
    if (!token || user?.role !== 'ADMIN') return;
    setLoading(true);
    try {
      const [result, categoryResult] = await Promise.all([
        apiRequest<{ campaigns: Campaign[] }>('/admin/campaigns', { token }),
        apiRequest<{ categories: Category[] }>('/categories'),
      ]);
      setCampaigns(result.campaigns);
      setCategories(categoryResult.categories);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load donation campaigns.'); }
    finally { setLoading(false); }
  }, [token, user?.role]);
  // Load admin campaigns only after auth has confirmed the server-backed role.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (ready && user?.role === 'ADMIN') void load(); else if (ready) setLoading(false); }, [ready, user?.role, load]);

  const change = (key: keyof Form, value: string) => setForm((state) => ({ ...state, [key]: value }));
  const scheduleError = useMemo(() => {
    if (!form.startDate || !form.startTime || !form.endDate || !form.endTime) return '';
    const start = parseSchedule(form.startDate, form.startTime);
    const end = parseSchedule(form.endDate, form.endTime);
    if (start === null || end === null) return 'Choose valid campaign dates and times.';
    if (start <= Date.now()) return 'Start time has already passed. Choose a future time in Asia/Kolkata.';
    if (end <= start) return 'End time must be after the start time.';
    return '';
  }, [form.startDate, form.startTime, form.endDate, form.endTime]);

  const validateForm = () => {
    if (form.title.trim().length < 3) return 'Campaign name must be at least 3 characters.';
    if (!form.description.trim()) return 'Campaign description is required.';
    if (!form.categoryIds.length) return 'Please select at least one category.';
    if (!form.startDate || !form.startTime || !form.endDate || !form.endTime) return 'Choose a start date, start time, end date, and end time.';
    const start = parseSchedule(form.startDate, form.startTime);
    const end = parseSchedule(form.endDate, form.endTime);
    if (start === null || end === null) return 'Choose valid campaign dates and times.';
    if (start <= Date.now()) return 'Start time has already passed. Choose a future time in Asia/Kolkata.';
    if (end <= start) return 'End time must be after the start time.';
    if (!form.location.trim()) return 'Donation location is required.';
    return '';
  };

  const selectDate = (target: 'startDate' | 'endDate', date: Date) => {
    const picked = dateKey(date);
    setForm((current) => {
      const next = { ...current, [target]: picked };
      if (target === 'startDate' && next.endDate && next.endDate < picked) { next.endDate = picked; next.endTime = current.startTime || '23:00'; }
      return next;
    });
    setValidation('');
    setPicker('');
  };
  const openDate = (target: 'startDate' | 'endDate') => {
    const selectedDate = form[target] || (target === 'endDate' ? form.startDate : '') || todayInKolkata();
    const [year, month] = selectedDate.split('-').map(Number);
    setCalendarMonth(new Date(year, month - 1, 1));
    setPicker(target);
  };
  const minimumForDate = (target: 'startDate' | 'endDate') => {
    const minimum = target === 'endDate' && form.startDate ? form.startDate : todayInKolkata();
    return fromDate(minimum, '00:00');
  };
  const openTime = (target: 'startTime' | 'endTime') => {
    const current = form[target] || (target === 'endTime' ? form.startTime : '') || timeInKolkata();
    setWebTimeValue(current);
    setPicker(target);
  };
  const setTime = (target: 'startTime' | 'endTime', date: Date) => {
    const nextTime = timeKey(date);
    if (target === 'startTime') {
      const scheduleDate = form.startDate || todayInKolkata();
      const start = parseSchedule(scheduleDate, nextTime);
      if (start !== null && start <= Date.now()) { setValidation('Start time has already passed. Choose a future time in Asia/Kolkata.'); setPicker(''); return; }
    } else {
      const scheduleDate = form.endDate || form.startDate || todayInKolkata();
      const end = parseSchedule(scheduleDate, nextTime);
      const start = parseSchedule(form.startDate, form.startTime);
      if (end !== null && start !== null && end <= start) { setValidation('End time must be after the start time.'); setPicker(''); return; }
    }
    setForm((current) => {
      const next = { ...current, [target]: nextTime };
      if (target === 'startTime' && current.startDate === current.endDate && current.endTime && current.endTime <= nextTime) next.endTime = '';
      return next;
    });
    setValidation('');
    setPicker('');
  };

  const chooseImage = async () => { try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85, exif: false }); if (result.canceled) return; const context = ImageManipulator.manipulate(result.assets[0].uri); if (result.assets[0].width > 1280) context.resize({ width: 1280, height: null }); const rendered = await context.renderAsync(); const compressed = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.78 }); setImageUri(compressed.uri); } catch { setError('Could not prepare this photo. Choose another image.'); } };
  const uploadImage = async (campaignId: string, uri: string) => { if (!token) return; const body = new FormData(); if (Platform.OS === 'web') { const blob = await (await fetch(uri)).blob(); body.append('image', blob, `reusehub-campaign-${Date.now()}.jpg`); } else body.append('image', new ExpoFile(uri)); await apiRequest(`/admin/campaigns/${campaignId}/image`, { method: 'POST', token, body, timeoutMs: 60_000 }); };
  const save = async () => {
    if (!token) return;
    const problem = validateForm();
    setValidation(problem);
    setNotice('');
    setError('');
    if (problem) return;
    setBusy('save');
    try {
      const payload = { title: form.title.trim(), description: form.description.trim(), categoryIds: form.categoryIds, location: form.location.trim(), instructions: form.instructions.trim() || null, coordinator: form.coordinator.trim() || null, imageUrl: form.imageUrl.trim() || null, startDate: form.startDate, startTime: form.startTime, endDate: form.endDate, endTime: form.endTime };
      let campaignId = editing;
      const wasEditing = Boolean(editing);
      if (wasEditing) await apiRequest(`/admin/campaigns/${editing}`, { method: 'PATCH', token, body: payload });
      else { const created = await apiRequest<{ campaign: { id: string } }>('/community/campaigns', { method: 'POST', token, body: payload }); campaignId = created.campaign.id; }
      let imageUploadError = '';
      if (imageUri) {
        try { await uploadImage(campaignId, imageUri); }
        catch (e) { imageUploadError = e instanceof Error ? e.message : 'The image could not be uploaded.'; }
      }
      setForm(emptyForm); setImageUri(''); setEditing(''); setValidation('');
      await load();
      setNotice(wasEditing ? 'Campaign updated successfully.' : 'Campaign created successfully. It is now in the campaign list.');
      if (imageUploadError) setError(`Campaign details were saved, but the image could not be uploaded. Edit the campaign to try the image again. ${imageUploadError}`);
    } catch (e) { setError(e instanceof ApiError && e.status === 403 ? 'You do not have permission to create or edit campaigns.' : e instanceof Error ? e.message : 'Unable to save campaign. Please check the details and try again.'); }
    finally { setBusy(''); }
  };
  const edit = (campaign: Campaign) => {
    const accepted = (campaign.acceptedCategories ?? '').split(/[\n,;]/).map((name) => name.trim().toLocaleLowerCase());
    const ids = categories.filter((category) => accepted.includes(category.name.toLocaleLowerCase())).map((category) => category.id);
    const start = campaign.startDate ? new Date(campaign.startDate) : null;
    const end = campaign.endDate ? new Date(campaign.endDate) : null;
    const localParts = (value: Date | null) => value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value) : '';
    const localTime = (value: Date | null) => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value) : '';
    setEditing(campaign.id); setImageUri(''); setNotice(''); setError('');
    setForm({ title: campaign.title, description: campaign.description, location: campaign.location ?? '', instructions: campaign.instructions ?? '', coordinator: campaign.coordinator ?? '', imageUrl: campaign.imageUrl ?? '', startDate: localParts(start), startTime: localTime(start), endDate: localParts(end), endTime: localTime(end), categoryIds: ids });
  };
  const setStatus = async (campaign: Campaign, status: string) => { if (!token) return; setBusy(campaign.id); setError(''); try { await apiRequest(`/admin/campaigns/${campaign.id}`, { method: 'PATCH', token, body: { status } }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not change campaign status.'); } finally { setBusy(''); } };
  const showDonations = async (campaign: Campaign) => { if (!token) return; setBusy(campaign.id); setError(''); try { const result = await apiRequest<{ donations: CampaignDonation[] }>(`/admin/campaigns/${campaign.id}/donations`, { token }); setSelected(campaign.id); setDonations(result.donations); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load campaign donations.'); } finally { setBusy(''); } };
  const setDonationStatus = async (donation: CampaignDonation, status: string) => { if (!token) return; setBusy(donation.id); setError(''); try { await apiRequest(`/admin/campaign-donations/${donation.id}`, { method: 'PATCH', token, body: { status } }); setDonations((rows) => rows.map((row) => row.id === donation.id ? { ...row, status } : row)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update donation status.'); } finally { setBusy(''); } };
  const remove = (campaign: Campaign) => Alert.alert('Delete campaign?', 'This removes the campaign and its submission records.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { if (!token) return; setBusy(campaign.id); try { await apiRequest(`/admin/campaigns/${campaign.id}`, { method: 'DELETE', token }); setCampaigns((rows) => rows.filter((row) => row.id !== campaign.id)); if (selected === campaign.id) setSelected(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete campaign.'); } finally { setBusy(''); } } }]);

  if (ready && user && user.role !== 'ADMIN') return <Redirect href="/profile" />;
  if (!ready || !user) return <PageShell title="Donation campaigns"><LoadingState /></PageShell>;
  if (user.role !== 'ADMIN') return <PageShell title="Donation campaigns"><LoadingState /></PageShell>;

  const activeDateTarget = picker === 'startDate' || picker === 'endDate' ? picker : '';
  const activeTimeTarget = picker === 'startTime' || picker === 'endTime' ? picker : '';
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const leadingDays = monthStart.getDay();
  const dateFloor = activeDateTarget ? (activeDateTarget === 'endDate' && form.startDate ? form.startDate : todayInKolkata()) : todayInKolkata();

  return <PageShell title="Donation campaigns" eyebrow="ADMIN CAMPAIGN MANAGEMENT">
    {loading ? <LoadingState /> : null}{error ? <ErrorState message={error} /> : null}{notice ? <Text accessibilityRole="alert" style={{ color: '#237A57', fontWeight: '700', marginBottom: 6 }}>{notice}</Text> : null}
    <View style={cardStyle}>
      <Text style={{ color: '#294735', fontSize: 16, fontWeight: '700' }}>{editing ? 'Edit campaign' : 'Create donation campaign'}</Text>
      <Text style={labelStyle}>Campaign name</Text><TextInput value={form.title} onChangeText={(value) => change('title', value)} placeholder="Campaign name" placeholderTextColor="#849087" maxLength={150} style={inputStyle} />
      <Text style={labelStyle}>Description</Text><TextInput value={form.description} onChangeText={(value) => change('description', value)} placeholder="What is this campaign collecting for?" placeholderTextColor="#849087" multiline style={[inputStyle, { minHeight: 75, textAlignVertical: 'top' }]} />
      <Text style={labelStyle}>Accepted categories</Text><Text style={{ color: '#849087', fontSize: 11, marginTop: 4 }}>Select every category this campaign accepts.</Text>
      <View style={{ gap: 7, marginTop: 8 }}>{categories.map((category) => { const checked = form.categoryIds.includes(category.id); return <Pressable key={category.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setForm((current) => ({ ...current, categoryIds: checked ? current.categoryIds.filter((id) => id !== category.id) : [...current.categoryIds, category.id] }))} style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: checked ? '#6C9A75' : '#E5EAE4', backgroundColor: checked ? '#EFF5EE' : '#fff' }}><Text style={{ color: checked ? '#237A57' : '#9AA49B', fontSize: 16, marginRight: 9 }}>{checked ? '☑' : '□'}</Text><Text style={{ color: '#385443', fontSize: 12 }}>{category.name}</Text></Pressable>; })}</View>
      <Text style={labelStyle}>Start date</Text><Pressable accessibilityRole="button" onPress={() => openDate('startDate')} style={fieldStyle}><Text style={{ color: form.startDate ? '#24382B' : '#849087' }}>▦   {formatDate(form.startDate)}</Text></Pressable>
      <Text style={labelStyle}>Start time</Text><Pressable accessibilityRole="button" onPress={() => openTime('startTime')} style={fieldStyle}><Text style={{ color: form.startTime ? '#24382B' : '#849087' }}>◷   {formatTime(form.startTime)}</Text></Pressable>
      <Text style={labelStyle}>End date</Text><Pressable accessibilityRole="button" onPress={() => openDate('endDate')} style={fieldStyle}><Text style={{ color: form.endDate ? '#24382B' : '#849087' }}>▦   {formatDate(form.endDate)}</Text></Pressable>
      <Text style={labelStyle}>End time</Text><Pressable accessibilityRole="button" onPress={() => openTime('endTime')} style={fieldStyle}><Text style={{ color: form.endTime ? '#24382B' : '#849087' }}>◷   {formatTime(form.endTime)}</Text></Pressable>
      {scheduleError ? <Text style={{ color: '#A3463A', fontSize: 11, marginTop: 8 }}>{scheduleError}</Text> : null}
      <Text style={labelStyle}>Donation location</Text><TextInput value={form.location} onChangeText={(value) => change('location', value)} placeholder="e.g. Student Activity Center" placeholderTextColor="#849087" maxLength={200} style={inputStyle} />
      <Text style={labelStyle}>Instructions (optional)</Text><TextInput value={form.instructions} onChangeText={(value) => change('instructions', value)} placeholder="Drop-off details" placeholderTextColor="#849087" multiline style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]} />
      <Text style={labelStyle}>Coordinator (optional)</Text><TextInput value={form.coordinator} onChangeText={(value) => change('coordinator', value)} placeholder="Coordinator/contact" placeholderTextColor="#849087" style={inputStyle} />
      <View style={{ alignSelf: 'flex-start', marginTop: 12 }}><ActionButton label={imageUri ? 'Choose a different image' : form.imageUrl ? 'Replace campaign image' : 'Choose campaign image'} tone="quiet" disabled={Boolean(busy)} onPress={() => void chooseImage()} /></View>
      {imageUri || form.imageUrl ? <Image source={{ uri: imageUri || (form.imageUrl.startsWith('/uploads/') ? `${resolveMediaUrl(form.imageUrl)}` : form.imageUrl) }} contentFit="cover" style={{ width: '100%', height: 145, borderRadius: 12, marginTop: 9 }} /> : null}
      <TextInput value={form.imageUrl} onChangeText={(value) => change('imageUrl', value)} placeholder="Campaign image URL (optional)" placeholderTextColor="#849087" style={inputStyle} />
      {validation ? <ErrorState message={validation} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}><ActionButton label={busy === 'save' ? 'Saving…' : editing ? 'Save changes' : 'Create campaign'} disabled={Boolean(busy)} onPress={() => void save()} />{editing ? <ActionButton label="Cancel edit" tone="quiet" onPress={() => { setEditing(''); setForm(emptyForm); setValidation(''); }} /> : null}</View>
    </View>
    {!loading && !campaigns.length ? <EmptyState message="No campaigns have been created." /> : null}
    {campaigns.map((campaign) => <View key={campaign.id} style={cardStyle}><Text style={{ color: '#849087', fontSize: 10, fontWeight: '700' }}>{campaign.status} · {campaign._count.donations} donations</Text><Text style={{ color: '#294735', fontSize: 15, fontWeight: '700', marginTop: 5 }}>{campaign.title}</Text><Text style={{ color: '#657268', fontSize: 12, marginTop: 5 }}>{campaign.description}</Text><Text style={{ color: '#557361', fontSize: 12, marginTop: 5 }}>Official location · {campaign.location ?? 'Not set'}</Text><Text style={{ color: '#849087', fontSize: 11, marginTop: 4 }}>{dateText(campaign.startDate)} – {dateText(campaign.endDate)}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}><ActionButton label="Edit" tone="quiet" onPress={() => edit(campaign)} /><ActionButton label={campaign.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} tone={campaign.status === 'ACTIVE' ? 'red' : 'green'} disabled={Boolean(busy)} onPress={() => void setStatus(campaign, campaign.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE')} /><ActionButton label="Manage donations" tone="quiet" disabled={Boolean(busy)} onPress={() => void showDonations(campaign)} /><ActionButton label="Delete" tone="red" disabled={Boolean(busy)} onPress={() => remove(campaign)} /></View>
      {selected === campaign.id ? <View style={{ borderTopWidth: 1, borderTopColor: '#E5EAE4', marginTop: 12, paddingTop: 10, gap: 7 }}><Text style={{ color: '#31553C', fontWeight: '700' }}>Campaign donations</Text>{!donations.length ? <Text style={{ color: '#819087', fontSize: 12 }}>No submissions yet.</Text> : donations.map((donation) => <View key={donation.id} style={{ backgroundColor: '#F7F9F6', borderRadius: 11, padding: 10, gap: 4 }}><Text style={{ color: '#294735', fontWeight: '700', fontSize: 13 }}>{donation.user.name} · {donation.category}</Text><Text style={{ color: '#657268', fontSize: 12 }}>{donation.itemDetails}</Text><Text style={{ color: '#849087', fontSize: 10 }}>{donation.status} · {new Date(donation.submittedAt).toLocaleDateString()}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{['SUBMITTED', 'RECEIVED', 'COMPLETED', 'CANCELLED'].map((status) => <ActionButton key={status} label={status} tone={donation.status === status ? 'green' : 'quiet'} disabled={Boolean(busy)} onPress={() => void setDonationStatus(donation, status)} />)}</View></View>)}</View> : null}
    </View>)}

    {activeDateTarget && Platform.OS === 'android' ? <DateTimePicker key={picker} value={fromDate(form[activeDateTarget])} mode="date" minimumDate={minimumForDate(activeDateTarget)} display="default" presentation="dialog" positiveButton={{ label: 'Select' }} negativeButton={{ label: 'Cancel' }} accentColor="#237A57" onDismiss={() => setPicker('')} onValueChange={(_event, value) => selectDate(activeDateTarget, value)} /> : null}
    {activeTimeTarget && Platform.OS === 'android' ? <DateTimePicker key={picker} value={fromDate(activeTimeTarget === 'startTime' ? form.startDate : form.endDate, form[activeTimeTarget])} mode="time" display="default" presentation="dialog" is24Hour={false} positiveButton={{ label: 'Select' }} negativeButton={{ label: 'Cancel' }} accentColor="#237A57" onDismiss={() => setPicker('')} onValueChange={(_event, value) => setTime(activeTimeTarget, value)} /> : null}
    {Platform.OS !== 'android' && activeDateTarget ? <Modal visible transparent animationType="fade" onRequestClose={() => setPicker('')}><View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#0006', padding: 20 }}><View style={{ alignSelf: 'center', width: '100%', maxWidth: 370, backgroundColor: '#fff', borderRadius: 18, padding: 17 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Pressable accessibilityRole="button" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Text style={{ padding: 9, color: '#237A57', fontSize: 18 }}>‹</Text></Pressable><Text style={{ color: '#294735', fontWeight: '700', fontSize: 16 }}>{calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text><Pressable accessibilityRole="button" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Text style={{ padding: 9, color: '#237A57', fontSize: 18 }}>›</Text></Pressable></View><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{weekdayNames.map((name) => <Text key={name} style={{ width: '14.28%', textAlign: 'center', color: '#849087', fontSize: 11, paddingVertical: 8 }}>{name}</Text>)}{Array.from({ length: leadingDays }, (_, index) => <View key={`blank-${index}`} style={{ width: '14.28%', height: 42 }} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; const value = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const disabled = value < dateFloor; const chosen = value === form[activeDateTarget]; return <Pressable key={value} disabled={disabled} accessibilityRole="button" onPress={() => selectDate(activeDateTarget, new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day))} style={{ width: '14.28%', height: 42, alignItems: 'center', justifyContent: 'center' }}><Text style={{ width: 32, height: 32, lineHeight: 32, textAlign: 'center', overflow: 'hidden', borderRadius: 16, backgroundColor: chosen ? '#237A57' : 'transparent', color: disabled ? '#CBD1CB' : chosen ? '#fff' : '#294735' }}>{day}</Text></Pressable>; })}</View><Pressable accessibilityRole="button" onPress={() => setPicker('')} style={{ alignSelf: 'flex-end', padding: 8, marginTop: 7 }}><Text style={{ color: '#237A57', fontWeight: '700' }}>Cancel</Text></Pressable></View></View></Modal> : null}
    {Platform.OS !== 'android' && activeTimeTarget ? <Modal visible transparent animationType="fade" onRequestClose={() => setPicker('')}><View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#0006', padding: 20 }}><View style={{ alignSelf: 'center', width: '100%', maxWidth: 340, maxHeight: '80%', backgroundColor: '#fff', borderRadius: 18, padding: 17 }}><Text style={{ color: '#294735', fontWeight: '700', fontSize: 16, marginBottom: 10 }}>Choose {activeTimeTarget === 'startTime' ? 'start' : 'end'} time</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>{Array.from({ length: 48 }, (_, index) => { const value = `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`; const selectedTime = value === webTimeValue; return <Pressable key={value} onPress={() => setWebTimeValue(value)} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, backgroundColor: selectedTime ? '#237A57' : '#EFF4EE' }}><Text style={{ color: selectedTime ? '#fff' : '#31553C', fontSize: 12 }}>{formatTime(value)}</Text></Pressable>; })}</View><View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 13 }}><ActionButton label="Cancel" tone="quiet" onPress={() => setPicker('')} /><ActionButton label="Done" onPress={() => setTime(activeTimeTarget, fromDate(undefined, webTimeValue))} /></View></View></View></Modal> : null}
  </PageShell>;
}
