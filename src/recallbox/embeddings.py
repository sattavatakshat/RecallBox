"""Small local English sentence vectors from Apple's installed model, revision 1."""
import asyncio
import json
import math
from pathlib import Path

slot = asyncio.Semaphore(1)


async def embed(text):
    binary = Path(__file__).resolve().parents[2] / 'build/local-embed'
    if not binary.is_file() or not text.strip():
        return None
    async with slot:
        # No network or identity/database environment in this process.
        child = await asyncio.create_subprocess_exec('/usr/bin/sandbox-exec','-p',
            '(version 1)(allow default)(deny network*)',str(binary),
            stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,
            env={'PATH':'/usr/bin:/bin'})
        try:
            output,_ = await asyncio.wait_for(child.communicate(text[:6000].encode()),8)
            vector = json.loads(output)
            if child.returncode or len(vector)!=512 or any(not math.isfinite(x) for x in vector) or sum(x*x for x in vector)<1e-12:
                return None
            return '['+','.join(str(x) for x in vector)+']'
        except (asyncio.TimeoutError,ValueError,TypeError):
            if child.returncode is None:
                child.kill(); await child.wait()
            return None
