"""One heavy adapter at a time in the local API process."""
import asyncio

_heavy_lock=asyncio.Lock()


async def run_adapter(adapter,name,url,settings):
    if name=='html':
        return await adapter(url,settings)
    async with _heavy_lock:
        return await adapter(url,settings)
