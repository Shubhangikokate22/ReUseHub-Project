import { useState, type ComponentProps } from 'react';
import { Link, Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { BrandLockup } from '@/components/app-icon';

type AuthScreenProps = { mode: 'login' | 'register' };

export function AuthScreen({ mode }: AuthScreenProps) {
  const registering = mode === 'register';
  const { user, login, register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Redirect href="/home" />;

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (registering) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      router.replace('/home');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <BrandLockup size={38} fontSize={18} />
          <View style={styles.hero}>
            <Text style={styles.kicker}>CAMPUS ITEM EXCHANGE</Text>
            <Text style={styles.title}>{registering ? 'Make room for reuse.' : 'Good things find a new home.'}</Text>
            <Text style={styles.subtitle}>
              {registering ? 'Join your campus community and pass useful things along.' : 'Sign in to find, share, and exchange useful campus items.'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{registering ? 'Create your account' : 'Welcome back'}</Text>
            {registering && <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Asha Mehta" autoCapitalize="words" />}
            <Field label="Campus email" value={email} onChangeText={setEmail} placeholder="you@campus.edu" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder={registering ? 'At least 8 characters' : 'Enter your password'} secureTextEntry autoCapitalize="none" />

            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.submit, pressed && !busy && styles.pressed, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{registering ? 'Create account' : 'Sign in'}</Text>}
            </Pressable>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{registering ? 'Already have an account?' : 'New to ReUseHub?'}</Text>
              <Link href={registering ? '/login' : '/register'} asChild>
                <Pressable><Text style={styles.switchLink}>{registering ? 'Sign in' : 'Join now'}</Text></Pressable>
              </Link>
            </View>
          </View>

          <Text style={styles.footnote}>Reuse more. Waste less. Build a more resourceful campus.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = ComponentProps<typeof TextInput> & { label: string };
function Field({ label, ...inputProps }: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#98A39A" style={styles.input} autoCorrect={false} {...inputProps} />
    </View>
  );
}

const styles = {
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F7F8F3' },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24 },
  hero: { paddingTop: 42, paddingBottom: 26 },
  kicker: { color: '#237A57', fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: '#183B2E', fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1.1, marginTop: 10, maxWidth: 420 },
  subtitle: { color: '#69776D', fontSize: 15, lineHeight: 23, marginTop: 11, maxWidth: 410 },
  card: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E8ECE5', shadowColor: '#20392C', shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  cardTitle: { color: '#223A2E', fontSize: 20, fontWeight: '700', marginBottom: 5 },
  fieldWrap: { gap: 8, marginTop: 17 },
  label: { color: '#34473B', fontSize: 13, fontWeight: '700' },
  input: { color: '#26392E', height: 51, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DFE5DC', backgroundColor: '#FCFDFB', fontSize: 15 },
  error: { color: '#B34338', fontSize: 13, lineHeight: 18, marginTop: 14 },
  submit: { minHeight: 52, borderRadius: 13, backgroundColor: '#237A57', alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.7 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18 },
  switchText: { color: '#69776D', fontSize: 13 },
  switchLink: { color: '#237A57', fontSize: 13, fontWeight: '700' },
  footnote: { textAlign: 'center', color: '#8A958C', fontSize: 12, marginTop: 25 },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
