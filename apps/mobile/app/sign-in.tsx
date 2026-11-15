import React from 'react';
import {Redirect, router} from 'expo-router';
import {useSession} from '../src/session';
import {useNativeLogin} from '../src/use-native-login';
import {Button, Notice, Screen, Type} from '../src/ui';

export default function SignIn() {
  const {account} = useSession();
  const {login, busy, error, configured} = useNativeLogin();
  if (account) return <Redirect href="/(account)"/>;
  return <Screen>
    <Type variant="eyebrow" muted>YOUR FIRST PAGE</Type>
    <Type title>A space that's yours.</Type>
    <Type muted>Continue securely in your browser, then come back here.</Type>
    {!configured && <Notice kind="error">
      Sign-in is awaiting identity-provider setup. No account can be created yet.
    </Notice>}
    {!!error && <Notice kind="error">{error}</Notice>}
    <Button label="Continue securely" onPress={() => void login()} busy={busy} disabled={!configured}/>
    <Button label="Back to welcome" variant="secondary" onPress={() => router.replace('/')}/>
  </Screen>;
}
