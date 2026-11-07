"""Public-client authorization code + S256 PKCE; never accepts an ID token alone."""
import asyncio
import hmac
import time
import httpx
import jwt
from .config import Provider


class IdentityRejected(Exception):
    pass


class IdentityVerifier:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=8, follow_redirects=False, trust_env=False)
        self.cache = {}
        self.lock = asyncio.Lock()

    async def json_response(self, method, url, **kwargs):
        async with self.client.stream(method, url, **kwargs) as response:
            if response.status_code != 200:
                raise IdentityRejected()
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > 65536:
                    raise IdentityRejected()
            import json
            return json.loads(data)

    async def verify(self, provider: Provider, code: str, verifier: str, nonce: str):
        try:
            tokens = await self.json_response('POST', provider.token_endpoint, data={
                'grant_type': 'authorization_code', 'client_id': provider.client_id,
                'redirect_uri': provider.redirect_uri, 'code': code, 'code_verifier': verifier,
            })
            token = tokens['id_token']
            header = jwt.get_unverified_header(token)
            if header.get('alg') != 'RS256' or not isinstance(header.get('kid'), str):
                raise IdentityRejected()
            async with self.lock:
                cached = self.cache.get(provider.jwks_uri)
                if cached is None or cached[0] < time.monotonic():
                    keys = await self.json_response('GET', provider.jwks_uri)
                    if not isinstance(keys.get('keys'), list) or len(keys['keys']) > 32:
                        raise IdentityRejected()
                    cached = (time.monotonic() + 300, keys['keys'])
                    self.cache[provider.jwks_uri] = cached
            key = next(k for k in cached[1] if k.get('kid') == header['kid']
                       and k.get('kty') == 'RSA' and k.get('use', 'sig') == 'sig'
                       and k.get('alg', 'RS256') == 'RS256')
            claims = jwt.decode(token, jwt.PyJWK.from_dict(key).key, algorithms=['RS256'],
                audience=provider.client_id, issuer=provider.issuer,
                options={'require': ['exp', 'iat', 'iss', 'aud', 'sub', 'nonce']}, leeway=15)
            if not isinstance(claims['sub'], str) or not 1 <= len(claims['sub']) <= 255:
                raise IdentityRejected()
            if not isinstance(claims['nonce'], str) or not hmac.compare_digest(claims['nonce'], nonce):
                raise IdentityRejected()
            if claims.get('azp', provider.client_id) != provider.client_id:
                raise IdentityRejected()
            if isinstance(claims['aud'], list) and len(claims['aud']) > 1 and 'azp' not in claims:
                raise IdentityRejected()
            return claims['sub']
        except (httpx.HTTPError, jwt.PyJWTError, ValueError, KeyError, StopIteration, TypeError):
            raise IdentityRejected() from None
