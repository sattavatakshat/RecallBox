"""Configure existing Auth0 native clients; never provisions users or bypasses login."""
import argparse
import json
import os
from pathlib import Path
import shlex
from urllib.parse import urlsplit
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--domain', required=True, help='Tenant hostname, without https://')
    parser.add_argument('--ios-client-id', required=True)
    parser.add_argument('--android-client-id', required=True)
    args = parser.parse_args()
    domain = args.domain
    if (not domain.isascii() or not domain.endswith('.auth0.com') or '/' in domain or ':' in domain
            or not all(part and part.replace('-', '').isalnum() for part in domain.split('.'))):
        parser.error('Use the canonical Auth0 tenant hostname')
    for client in (args.ios_client_id, args.android_client_id):
        if not client.isascii() or not client.isalnum() or len(client) < 16:
            parser.error('Supply the real public native client IDs from Auth0')
    issuer = f'https://{domain}/'
    with urlopen(issuer + '.well-known/openid-configuration', timeout=15) as response:
        raw = response.read(65537)
        if response.status != 200 or len(raw) > 65536:
            raise RuntimeError('Invalid discovery response')
        discovery = json.loads(raw)
    if discovery['issuer'] != issuer or 'RS256' not in discovery['id_token_signing_alg_values_supported']:
        raise RuntimeError('Unexpected issuer or signing algorithms')
    if 'S256' not in discovery.get('code_challenge_methods_supported', []):
        raise RuntimeError('Provider does not advertise S256 PKCE')
    if 'none' not in discovery.get('token_endpoint_auth_methods_supported', []):
        raise RuntimeError('Provider does not advertise public clients')
    for key in ('authorization_endpoint', 'token_endpoint', 'jwks_uri'):
        url = urlsplit(discovery[key])
        if url.scheme != 'https' or url.netloc != domain or url.fragment or url.username:
            raise RuntimeError('Unexpected discovery endpoint')
    redirect = 'app.recallbox.mobile://auth/callback'
    providers = {
        'oidc-' + platform: dict(issuer=issuer, client_id=client,
            token_endpoint=discovery['token_endpoint'], jwks_uri=discovery['jwks_uri'],
            redirect_uri=redirect)
        for platform, client in [('ios', args.ios_client_id), ('android', args.android_client_id)]
    }
    private = Path.home() / '.config' / 'recallbox'
    mobile = Path(__file__).resolve().parents[1] / 'apps/mobile/.env.local'
    # Fail rather than overwrite an operator's existing configuration.
    if (private / 'oidc.env').exists() or mobile.exists():
        raise RuntimeError('Configuration exists; review it before replacing it')
    private.mkdir(mode=0o700, parents=True, exist_ok=True)
    content = 'export RECALLBOX_OIDC_PROVIDERS=' + shlex.quote(json.dumps(providers)) + '\n'
    with (private / 'oidc.env').open('x') as output:
        os.chmod(output.name, 0o600)
        output.write(content)
    values = dict(EXPO_PUBLIC_API_URL='http://127.0.0.1:8001',
        EXPO_PUBLIC_OIDC_ISSUER=issuer,
        EXPO_PUBLIC_OIDC_IOS_CLIENT_ID=args.ios_client_id,
        EXPO_PUBLIC_OIDC_ANDROID_CLIENT_ID=args.android_client_id,
        EXPO_PUBLIC_OIDC_IOS_PROVIDER='oidc-ios', EXPO_PUBLIC_OIDC_ANDROID_PROVIDER='oidc-android',
        EXPO_PUBLIC_OIDC_REDIRECT_URI=redirect)
    with mobile.open('x') as output:
        os.chmod(output.name, 0o600)
        output.write(''.join(f'{key}={value}\n' for key, value in values.items()))
    print('Discovery verified; wrote private oidc.env and ignored mobile .env.local.')
    print('Client registration and real account login still require live verification.')


if __name__ == '__main__':
    main()
