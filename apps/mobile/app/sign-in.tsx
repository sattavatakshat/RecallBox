import React, { useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { configured, oidc } from '../src/config';
import { deviceId, useSession } from '../src/session';
import { ApiError } from '../src/api';
import { Button, Notice, Screen, Type } from '../src/ui';
WebBrowser.maybeCompleteAuthSession();
export default function SignIn() {
  const {account, signIn} = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (account) return <Redirect href="/(account)"/>;
  async function login() {
    setBusy(true); setError('');
    try {
      if (!configured || (Platform.OS !== 'ios' && Platform.OS !== 'android')) throw new Error('Native identity configuration is required.');
      const discovery = await AuthSession.fetchDiscoveryAsync(oidc.issuer.replace(/\/+$/, ''));
      if (!discovery.authorizationEndpoint?.startsWith('https://')) throw new Error('Secure identity service unavailable.');
      const nonce = Crypto.randomUUID() + Crypto.randomUUID();
      const request = new AuthSession.AuthRequest({clientId: oidc.clientId, redirectUri: oidc.redirectUri,
        scopes: ['openid'], responseType: AuthSession.ResponseType.Code, usePKCE: true,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256, extraParams: {nonce}});
      await request.makeAuthUrlAsync(discovery);
      const result = await request.promptAsync(discovery);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success' || result.params.state !== request.state || !result.params.code || !request.codeVerifier) throw new Error('Sign-in was not completed.');
      await signIn({provider: oidc.provider, code: result.params.code, code_verifier: request.codeVerifier,
        nonce, client_device_id: await deviceId(), platform: Platform.OS as 'ios' | 'android'});
      router.replace('/(account)');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'identity_rejected') {
        setError('The identity service could not verify this sign-in. Start a new sign-in attempt.');
      } else if (cause instanceof ApiError && cause.status === 503) {
        setError('Your local RecallBox server is unavailable. Check that it is running before retrying.');
      } else {
        // Do not display authorization codes, token responses or provider URLs.
        setError('Sign-in could not be completed. Check your connection and try again.');
      }
    }
    finally { setBusy(false); }
  }
  return <Screen><Type>YOUR FIRST PAGE</Type><Type title>A space that’s yours.</Type><Type muted>Continue securely in your browser, then come back here.</Type>{!configured && <Notice>Sign-in is awaiting identity-provider setup. No account can be created yet.</Notice>}{error && <Notice>{error}</Notice>}<Button label="Continue securely" onPress={() => void login()} busy={busy} disabled={!configured}/><Button label="Back to welcome" variant="secondary" onPress={() => router.replace('/')}/></Screen>;
}
