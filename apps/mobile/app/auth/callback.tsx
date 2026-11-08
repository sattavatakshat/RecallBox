import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useSession } from '../../src/session';
import { completeAuth } from '../../src/pending-auth';
import { Button, Screen, Type } from '../../src/ui';
export default function Callback() {
  const {account, loading, signIn} = useSession();
  const params = useLocalSearchParams<{code?: string; state?: string; error?: string}>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (loading || account) return;
    void completeAuth(params, signIn).catch(() => setError('Sign-in was interrupted or expired. Please start again.'));
  }, [loading, account?.id, params.code, params.state]);
  if (account) return <Redirect href="/(account)"/>;
  return <Screen><Type title>Returning to your space.</Type><Type muted>{error || 'Completing secure sign-in…'}</Type>{!!error && <Button label="Try sign-in again" onPress={() => router.replace('/sign-in')}/>}</Screen>;
}
