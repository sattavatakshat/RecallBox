import {useState} from 'react';
import {Platform} from 'react-native';
import {router} from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import {ApiError} from './api';
import {configured, googleSignIn, oidc} from './config';
import {rememberAuth, completeAuth} from './pending-auth';
import {useSession} from './session';

// Both entry screens must use the same real OIDC/PKCE flow.
// This hook does not duplicate or weaken the native callback handling.
WebBrowser.maybeCompleteAuthSession();

export function useNativeLogin() {
  const {signIn} = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!configured || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
        setError('Secure sign-in is not configured yet. Check your RecallBox identity settings.');
        return;
      }
      let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
      const discovery = await Promise.race([
        AuthSession.fetchDiscoveryAsync(oidc.issuer.replace(/\/+$/, '')),
        new Promise<never>((_, reject) => {
          discoveryTimer = setTimeout(() => reject(new Error('Identity service timed out')), 15000);
        }),
      ]).finally(() => {
        if (discoveryTimer) clearTimeout(discoveryTimer);
      });
      if (!discovery.authorizationEndpoint?.startsWith('https://')) {
        throw new Error('Secure identity service unavailable.');
      }

      const nonce = Crypto.randomUUID() + Crypto.randomUUID();
      const request = new AuthSession.AuthRequest({
        clientId: oidc.clientId, redirectUri: oidc.redirectUri,
        scopes: ['openid'], responseType: AuthSession.ResponseType.Code,
        usePKCE: true, prompt: AuthSession.Prompt.Login,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
        extraParams: {nonce, ...(googleSignIn ? {connection: oidc.googleConnection} : {})},
      });
      const authUrl = await request.makeAuthUrlAsync(discovery);
      if (!request.codeVerifier) throw new Error('Secure sign-in unavailable.');
      await rememberAuth(request.state, request.codeVerifier, nonce);

      if (Platform.OS === 'android') {
        // Preserve the existing Android warm/cold callback handling in SessionProvider.
        await WebBrowser.openBrowserAsync(authUrl);
        return;
      }
      const result = await request.promptAsync(discovery);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success' || result.params.state !== request.state ||
          !result.params.code || !request.codeVerifier) {
        throw new Error('Sign-in was not completed.');
      }
      await completeAuth(result.params, signIn);
      router.replace('/(account)');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'identity_rejected') {
        setError('The identity service could not verify this sign-in. Start another attempt.');
      } else if (cause instanceof ApiError && cause.status === 503) {
        setError('Your RecallBox server is unavailable. Check it is running and retry.');
      } else {
        // Never expose authorization codes, provider URLs or token content.
        setError('Sign-in could not be completed. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }
  return {login, busy, error, configured, googleSignIn};
}
