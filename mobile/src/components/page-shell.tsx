import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';

export function PageShell({ title, eyebrow, children, action }: PropsWithChildren<{ title: string; eyebrow?: string; action?: ReactNode }>) {
  const router = useRouter();
  const { ready, user } = useAuth();
  if (!ready) return <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8F3' }}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#237A57" /></View></SafeAreaView>;
  if (!user) return <Redirect href="/login" />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8F3' }} edges={['top']}>
    <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingTop: 7, paddingBottom: 36 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ paddingVertical: 10 }}><Text style={{ color: '#51715D', fontSize: 13 }}>‹  Back</Text></Pressable>{action}
      </View>
      {eyebrow ? <Text style={{ color: '#65816C', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 10 }}>{eyebrow}</Text> : null}
      <Text style={{ color: '#1D3C2D', fontSize: 28, lineHeight: 34, fontWeight: '700', marginTop: 5, marginBottom: 16 }}>{title}</Text>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

export function LoadingState() { return <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color="#237A57" /></View>; }
export function ErrorState({ message }: { message: string }) { return <Text accessibilityRole="alert" style={{ color: '#A3463A', fontSize: 13, lineHeight: 19, paddingVertical: 12 }}>{message}</Text>; }
export function EmptyState({ message }: { message: string }) { return <Text style={{ color: '#849087', fontSize: 13, lineHeight: 19, paddingVertical: 18 }}>{message}</Text>; }
export function ActionButton({ label, onPress, tone = 'green', disabled = false }: { label: string; onPress: () => void; tone?: 'green' | 'quiet' | 'red'; disabled?: boolean }) {
  const colors = tone === 'red' ? ['#F8ECEA', '#A34D43'] : tone === 'quiet' ? ['#EDF2EC', '#3E614B'] : ['#237A57', '#FFFFFF'];
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ minHeight: 39, justifyContent: 'center', alignItems: 'center', backgroundColor: colors[0], borderRadius: 11, paddingHorizontal: 13, opacity: disabled ? 0.55 : 1 }}><Text style={{ color: colors[1], fontSize: 12, fontWeight: '700' }}>{label}</Text></Pressable>;
}

export const cardStyle = { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7ECE5', borderRadius: 15, padding: 15, marginTop: 10 } as const;
