import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '../src/session';
import { Button, Notice, Screen, Type } from '../src/ui';
export default function Welcome() {
  const session = useSession();
  if (session.loading) return <Screen><Notice>Opening your space…</Notice></Screen>;
  if (session.account) return <Redirect href="/(account)"/>;
  return <Screen><Type>RECALLBOX</Type><View style={{height: 48}}/><Type title>A home for what you save.</Type><Type muted>A quiet place for details worth keeping. Start with a note and find it again whenever you need it.</Type><View style={{flex: 1, minHeight: 48}}/>{!!session.message && <Notice>{session.message}</Notice>}<Button label="Continue securely" onPress={() => router.push('/sign-in')}/><Type muted>Sign-in happens in your browser. Your session credential is kept in this device’s secure storage.</Type></Screen>;
}
