import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../src/session';
import { Notice, Screen } from '../../src/ui';
export default function Protected() {
  const {account, loading} = useSession();
  if (loading) return <Screen><Notice>Restoring your session…</Notice></Screen>;
  if (!account) return <Redirect href="/sign-in"/>;
  return <Stack screenOptions={{headerShown: false}}/>;
}
