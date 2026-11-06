import asyncio
import json
import shutil
from ..config import Settings
from ..models import Extracted, truncation_info


async def extract_agent_reach(url: str, settings: Settings) -> Extracted:
    exe = shutil.which("agent-reach")
    if not exe:
        raise RuntimeError("Agent Reach not installed; see official installation guide")

    # No shell=True, no arbitrary command execution from the URL.
    proc = await asyncio.create_subprocess_exec(exe, "read", url,
                                                stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE)
    async def read_limited(stream,limit):
        chunks=[];size=0
        while chunk:=await stream.read(65536):
            size+=len(chunk)
            if size>limit:raise RuntimeError('Agent Reach output exceeded download limit; complete output not retained')
            chunks.append(chunk)
        return b''.join(chunks)
    tasks=[asyncio.create_task(read_limited(proc.stdout,settings.max_response_bytes)),
           asyncio.create_task(read_limited(proc.stderr,settings.max_response_bytes)),asyncio.create_task(proc.wait())]
    try:
        stdout, stderr, _ = await asyncio.wait_for(asyncio.gather(*tasks), timeout=settings.adapter_timeout_seconds)
    except asyncio.TimeoutError as exc:
        proc.kill()
        await proc.communicate()
        raise RuntimeError("Agent Reach exceeded timeout") from exc
    except BaseException:
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        if proc.returncode is None:
            proc.kill()
        await proc.communicate()
        raise
    raw = stdout.decode("utf-8", errors="replace")
    if proc.returncode != 0:
        error=RuntimeError((stderr.decode("utf-8", errors="replace") or raw or "Agent Reach failed")[:2000])
        try:
            envelope=json.loads(raw)
            attempts=(envelope.get('meta') or {}).get('attempts') or []
            error.backend=(attempts[-1].get('backend') if attempts and isinstance(attempts[-1],dict) else None) or envelope.get('backend')
        except (ValueError,AttributeError):error.backend=None
        error.raw_output={'envelope':raw[:settings.max_content_chars],
                          'truncation':truncation_info(raw,raw[:settings.max_content_chars],settings.max_content_chars,'agent_error_envelope')}
        raise error
    if not raw.strip():
        raise RuntimeError("Agent Reach returned no content")

    # Agent Reach 1.6+ prints a JSON envelope (ok/result/error). Older versions
    # and certain channels can print plain text. Support both without inventing content.
    text = raw
    title = None
    metadata = {}
    author=None
    try:
        payload = json.loads(raw)
        if isinstance(payload, dict):
            for key in ('backend','channel','action'):
                if isinstance(payload.get(key),str):metadata[key]=payload[key]
            envelope_meta = payload.get("meta")
            if isinstance(envelope_meta, dict):
                for key in ("backend", "channel", "tool"):
                    if isinstance(envelope_meta.get(key), str):
                        metadata[key] = envelope_meta[key]
                attempts = envelope_meta.get("attempts")
                if isinstance(attempts, list) and attempts:
                    last = attempts[-1]
                    if isinstance(last, dict) and isinstance(last.get("backend"), str):
                        metadata["underlying_backend"] = last["backend"]
            if payload.get("ok") is False:
                error = payload.get("error") or {}
                raise RuntimeError(f"Agent Reach failed: {str(error)[:350]}")
            items=payload.get('items')
            value = payload.get("result", items[0] if isinstance(items,list) and items else payload)
            if isinstance(value, str):
                text = value
            elif isinstance(value, dict):
                for key in ("backend", "channel", "tool"):
                    if isinstance(value.get(key), str):
                        metadata[key] = value[key]
                title = value.get("title") if isinstance(value.get("title"), str) else None
                author=value.get('author') if isinstance(value.get('author'),str) else None
                if isinstance(value.get('published_at'),str):metadata['published_at']=value['published_at']
                for field in ("content", "text", "markdown", "transcript", "body"):
                    if isinstance(value.get(field), str) and value.get(field).strip():
                        text = value[field]
                        break
                else:
                    text = json.dumps(value, ensure_ascii=False)
            else:
                text = json.dumps(value, ensure_ascii=False)
    except json.JSONDecodeError:
        pass
    original = text.strip()
    text = original[:settings.max_content_chars]
    if not text:
        raise RuntimeError("Agent Reach returned empty data")
    metadata_only=metadata.get('channel') in {'youtube','bilibili'} and metadata.get('action')=='read'
    if metadata_only:metadata['content_scope']='video_metadata_only; captions not requested'
    return Extracted(status="metadata_only" if metadata_only else "extracted", engine="agent_reach", final_url=url,
                     title=title,author=author,description=text if metadata_only else None,
                     content=None if metadata_only else text, markdown=None if metadata_only else text, metadata=metadata,
                     truncation=truncation_info(original,text,settings.max_content_chars),
                     raw_output={'envelope':raw[:settings.max_content_chars],
                                 'truncation':truncation_info(raw,raw[:settings.max_content_chars],settings.max_content_chars,'agent_envelope')})
