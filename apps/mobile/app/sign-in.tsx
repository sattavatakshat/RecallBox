import React, { useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { configured, oidc } from '../src/config';
import { ApiError } from '../src/api';
import { useSession } from '../src/session';
import { completeAuth, rememberAuth } from '../src/pending-auth';
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
      let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
      const discovery = await Promise.race([
        AuthSession.fetchDiscoveryAsync(oidc.issuer.replace(/\/+$/, '')),
        new Promise<never>((_,reject) => {discoveryTimer=setTimeout(() => reject(new Error('Identity service timed out')),15000);}),
      ]).finally(() => {if(discoveryTimer) clearTimeout(discoveryTimer);});
      if (!discovery.authorizationEndpoint?.startsWith('https://')) throw new Error('Secure identity service unavailable.');
      const nonce = Crypto.randomUUID() + Crypto.randomUUID();
      const request = new AuthSession.AuthRequest({clientId: oidc.clientId, redirectUri: oidc.redirectUri,
        scopes: ['openid'], responseType: AuthSession.ResponseType.Code, usePKCE: true,
        prompt: AuthSession.Prompt.Login,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256, extraParams: {nonce}});
      const authUrl = await request.makeAuthUrlAsync(discovery);
      if (!request.codeVerifier) throw new Error('Secure sign-in unavailable.');
      await rememberAuth(request.state, request.codeVerifier, nonce);
      if (Platform.OS==='android') {
        // The session provider validates warm links and encrypted cold callbacks.
        // Avoid Expo's Android AppState-based browser-close lock after cancellation.
        await WebBrowser.openBrowserAsync(authUrl);
        return;
      }
      const result = await request.promptAsync(discovery);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success' || result.params.state !== request.state || !result.params.code || !request.codeVerifier) throw new Error('Sign-in was not completed.');
      await completeAuth(result.params, signIn);
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
