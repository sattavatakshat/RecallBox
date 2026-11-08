"""Bounded extraction child. No database or identity credentials are inherited."""
import ipaddress
import json
import os
from pathlib import Path
import resource
import socket
import subprocess
import sys
from urllib.parse import urljoin, urlsplit


def fetch_public(url, directory):
    from universal_extractor.security import check_url
    from universal_extractor.fetcher import FetchResult
    for redirect in range(5):
        check_url(url)
        parsed = urlsplit(url)
        host = parsed.hostname.encode('idna').decode('ascii')
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise ValueError('Blocked non-public DNS answer')
        address = addresses[0][4][0]
        pinned = f'[{address}]' if ':' in address else address
        headers, body = directory / 'headers', directory / 'body'
        command = ['/usr/bin/curl', '--silent', '--show-error', '--noproxy', '*', '--proto', '=http,https',
                   '--resolve', f'{host}:{port}:{pinned}', '--max-time', '18', '--connect-timeout', '6',
                   '--max-filesize', '4194304', '--max-redirs', '0', '--dump-header', str(headers),
                   '--output', str(body), '--user-agent', 'RecallBoxLocal/0.1', '--url', url]
        result = subprocess.run(command, capture_output=True, timeout=22, env={'PATH':'/usr/bin:/bin'}, close_fds=True)
        if result.returncode:
            raise ValueError('Source retrieval failed or exceeded limits')
        raw = headers.read_text(errors='replace').split('\r\n\r\n')[-1]
        lines = raw.splitlines()
        status = int(lines[0].split()[1])
        metadata = dict(line.split(':',1) for line in lines[1:] if ':' in line)
        metadata = {key.lower(): value.strip() for key,value in metadata.items()}
        if status in (301,302,303,307,308):
            if not metadata.get('location'):
                raise ValueError('Redirect missing destination')
            url = urljoin(url,metadata['location'])
            continue
        if status in (401,403,429):
            return None
        if status != 200 or body.stat().st_size>4194304:
            raise ValueError('Source unavailable')
        return FetchResult(url,metadata.get('content-type','').lower(),body.read_bytes(),status)
    raise ValueError('Too many redirects')


def extract(kind, source, directory):
    if kind == 'url':
        from universal_extractor.adapters.html import parse_html
        from universal_extractor.config import Settings
        result = fetch_public(source,directory)
        if result is None:
            return {'state':'metadata_only','text':'','error':'Source restricted or rate limited. Original URL retained.'}
        if result.content_type.split(';')[0] not in ('text/html','application/xhtml+xml','text/plain'):
            return {'state':'metadata_only','text':'','error':'This URL does not provide supported article text. Original URL retained.'}
        parsed = parse_html(result,Settings(max_content_chars=100000))
        return {'state':'ready' if parsed.content else 'metadata_only', 'text':parsed.content or parsed.description or '',
                'title':(parsed.title or '')[:240], 'error':None if parsed.content else 'Only available page metadata was captured.'}
    if kind == 'pdf':
        from pypdf import PdfReader
        reader = PdfReader(directory / 'input', strict=False)
        if reader.is_encrypted or len(reader.pages)>100:
            return {'state':'metadata_only','text':'','error':'Encrypted PDFs and PDFs over 100 pages are retained without extraction.'}
        text = []
        remaining = 100000
        for page in reader.pages:
            value = (page.extract_text() or '')[:remaining]
            text.append(value)
            remaining -= len(value)
            if remaining <= 0:
                break
        content = '\n'.join(text)[:100000].strip()
        return {'state':'ready' if content else 'metadata_only','text':content,
                'error':None if content else 'No embedded text. Scanned PDF OCR is unavailable.'}
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 12000000
    with Image.open(directory / 'input') as image:
        width,height = image.size
        image.verify()
    return {'state':'metadata_only','text':f'Image · {width} × {height} pixels',
            'error':'Original image saved. Image text recognition is unavailable on this configuration.'}


def main():
    resource.setrlimit(resource.RLIMIT_CPU,(20,20))
    resource.setrlimit(resource.RLIMIT_FSIZE,(5*1024*1024,5*1024*1024))
    resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
    try:
        result = extract(sys.argv[1],sys.argv[2],Path(sys.argv[3]))
    except Exception:
        result = {'state':'failed','text':'','error':'Processing failed. Source may be unavailable, unsafe, invalid or too large.'}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
