import { Redirect } from 'expo-router';
import { ActivityIndicator, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import AppTabs from '@/components/app-tabs';
import { useAuth } from '@/context/auth-context';

export default function ProtectedTabLayout() {
  const { ready, user } = useAuth();
  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#237A57" /></View>;
  if (!user) return <Redirect href="/login" />;
  return <AppTabs />;
}

const styles = {
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F3' },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
