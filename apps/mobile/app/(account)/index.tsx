import { useState } from 'react';
import { useSession } from '../../src/session';
import { Button, Notice, Screen, Type } from '../../src/ui';
export default function Account() {
  const {account, logout, message, retry} = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function leave() { setBusy(true); try { await logout(); } catch { setError('Could not revoke your session. Reconnect and try signing out again.'); } finally { setBusy(false); } }
  return <Screen><Type>YOUR RECALLBOX</Type><Type title>{account?.display_name ?? 'Welcome home.'}</Type><Type muted>You’re signed in to your personal space.</Type><Type>Account created {account ? new Date(account.created_at).toLocaleDateString() : ''}</Type><Notice>{message || error}</Notice>{message && <Button label="Reconnect" onPress={() => void retry()}/>}<Button label="Sign out of this device" onPress={() => void leave()} busy={busy}/></Screen>;
}
