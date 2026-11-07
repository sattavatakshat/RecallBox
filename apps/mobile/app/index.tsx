import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '../src/session';
import { Button, Notice, Screen, Type } from '../src/ui';
export default function Welcome() {
  const session = useSession();
  if (session.loading) return <Screen><Notice>Opening your space…</Notice></Screen>;
  if (session.account) return <Redirect href="/(account)"/>;
  return <Screen><Type>RECALLBOX / A LITTLE SPACE FOR YOU</Type><View style={{height: 48}}/><Type title>Keep a little.{ '\n' }Find it again.</Type><Type muted>A personal place for the things you want to remember. Your account is the first page.</Type><View style={{flex: 1, minHeight: 48}}/><Notice>{session.message}</Notice><Button label="Make yourself at home" onPress={() => router.push('/sign-in')}/><Type muted>Your identity provider handles sign-in. Your RecallBox session stays in your device’s secure storage.</Type></Screen>;
}
