import { Redirect, router } from 'expo-router';
import { useSession } from '../../src/session';
import { Button, Notice, Screen, Type } from '../../src/ui';

// The sign-in screen owns the one-time PKCE verifier/state. Never parse and
// exchange a callback URL here without that original in-memory transaction.
export default function Callback() {
  const {account, loading} = useSession();
  if (account) return <Redirect href="/(account)"/>;
  return <Screen>
    <Type>RECALLBOX / SECURE RETURN</Type>
    <Type title>Returning to your space.</Type>
    <Type muted>RecallBox is checking whether your sign-in finished.</Type>
    {loading && <Notice>Checking your existing session…</Notice>}
    <Notice>If your browser sign-in was interrupted, restart it to keep your account secure.</Notice>
    <Button label="Return to sign-in" variant="secondary" onPress={() => router.replace('/sign-in')}/>
  </Screen>;
}
