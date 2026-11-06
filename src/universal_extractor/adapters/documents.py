import asyncio
from pathlib import Path
import tempfile
import json
import sys
from ..config import Settings
from ..fetcher import fetch_url
from ..models import Extracted, truncation_info


def _convert_pdf(path: Path, max_size: int) -> str:
    from docling.document_converter import DocumentConverter
    result = DocumentConverter().convert(path, max_file_size=max_size)
    try:
        return result.document.export_to_markdown()
    finally:
        source = getattr(result, "input", None)
        if source is not None and hasattr(source, "release"):
            source.release()


async def extract_docling(url: str, settings: Settings) -> Extracted:
    try:
        import docling  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("Docling is not installed: pip install '.[documents]'") from exc
    response = await fetch_url(url, settings)
    if not response.data.startswith(b"%PDF-"):
        raise RuntimeError("The URL did not return a PDF document")
    # Convert local verified file; never pass an unvalidated remote URL to Docling.
    with tempfile.TemporaryDirectory(prefix="url-extract-") as folder:
        path = Path(folder) / "source.pdf"
        path.write_bytes(response.data)
        proc=await asyncio.create_subprocess_exec(sys.executable,'-m','universal_extractor.adapters.documents',
            str(path),str(settings.max_response_bytes),str(settings.max_content_chars),
            stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        try:
            stdout,stderr=await asyncio.wait_for(proc.communicate(),timeout=settings.adapter_timeout_seconds)
            if proc.returncode:raise RuntimeError('Docling conversion failed; '+stderr.decode(errors='replace')[-500:])
            converted=json.loads(stdout)
        except (asyncio.CancelledError,TimeoutError):
            if proc.returncode is None:proc.kill()
            await proc.communicate()
            raise
    markdown=converted['markdown']
    return Extracted(status="extracted" if markdown else "unsupported",
                     engine="docling", final_url=response.url,
                     content=markdown or None, markdown=markdown or None,content_type='application/pdf',
                     truncation=converted['truncation'])


if __name__=='__main__':
    # Child keeps converter model memory isolated and can be terminated on cancellation.
    from contextlib import redirect_stdout
    with redirect_stdout(sys.stderr):
        original=_convert_pdf(Path(sys.argv[1]),int(sys.argv[2])).strip()
    bounded=original[:int(sys.argv[3])]
    print(json.dumps({'markdown':bounded,'truncation':truncation_info(original,bounded,int(sys.argv[3]),'markdown')}))
