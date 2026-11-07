"""Signed, account/epoch/purpose-bound cursors. Separate key domain from access JWTs."""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
import jwt
from .problems import Problem


def key(settings):
    return hmac.digest(settings.signing_key.encode(), b'recallbox-cursors-v1', hashlib.sha256)


def encode(settings, owner, epoch, purpose, **state):
    now = datetime.now(timezone.utc)
    return jwt.encode({'iss': settings.issuer, 'aud': 'cursor:' + purpose, 'sub': str(owner),
        'epoch': str(epoch), 'iat': now, 'exp': now + timedelta(days=30), **state}, key(settings), algorithm='HS256')


def decode(settings, token, owner, epoch, purpose):
    try:
        if len(token) > 4096:
            raise ValueError()
        payload = jwt.decode(token, key(settings), algorithms=['HS256'],
            issuer=settings.issuer, audience='cursor:' + purpose,
            options={'require': ['iss', 'aud', 'sub', 'epoch', 'iat', 'exp']})
        if payload['sub'] != str(owner):
            raise ValueError()
        if payload['epoch'] != str(epoch):
            raise Problem(410, 'cursor_expired')
        return payload
    except jwt.ExpiredSignatureError:
        raise Problem(410, 'cursor_expired') from None
    except (jwt.PyJWTError, ValueError, TypeError):
        raise Problem(400, 'invalid_cursor') from None
