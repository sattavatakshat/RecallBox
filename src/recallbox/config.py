"""Explicit environment-only product configuration; no lab settings or dotenv loading."""
import json
import os
from dataclasses import dataclass
from urllib.parse import urlsplit


def required(name: str) -> str:
    value = os.environ.get('RECALLBOX_' + name, '')
    if not value or value.startswith('REPLACE_'):
        raise ValueError(f'RECALLBOX_{name} must be configured')
    return value


def https(value: str) -> str:
    url = urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment:
        raise ValueError('Identity URLs must be absolute HTTPS URLs without credentials/fragments')
    return value


@dataclass(frozen=True)
class Provider:
    issuer: str
    client_id: str
    token_endpoint: str
    jwks_uri: str
    redirect_uri: str


@dataclass(frozen=True)
class Settings:
    database_url: str
    signing_key: str
    providers: dict[str, Provider]
    issuer: str = 'recallbox'

    @classmethod
    def load(cls):
        database_url = required('DATABASE_URL')
        url = urlsplit(database_url)
        if url.scheme != 'postgresql' or url.username != 'recallbox_api' or not url.hostname or not url.path.strip('/'):
            raise ValueError('Use a PostgreSQL URL with the dedicated recallbox_api role')
        key = required('SIGNING_KEY')
        if len(key.encode()) < 48:
            raise ValueError('Signing key requires at least 48 random bytes/characters')
        providers = {}
        for name, item in json.loads(required('OIDC_PROVIDERS')).items():
            provider = Provider(**item)
            for endpoint in (provider.issuer, provider.token_endpoint, provider.jwks_uri):
                https(endpoint)
            redirect = urlsplit(provider.redirect_uri)
            if not provider.client_id or not redirect.scheme or redirect.scheme in ('http', 'exp'):
                raise ValueError('Native registered redirect and public client ID required')
            providers[name] = provider
        if not providers:
            raise ValueError('At least one real OIDC provider is required')
        return cls(database_url, key, providers)
