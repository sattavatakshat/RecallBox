"""Durable sequential benchmark execution; compatibility engine summaries are derived."""
from __future__ import annotations
import asyncio
from dataclasses import fields
import json
import os
import statistics
import sys
import time
import uuid
from typing import Awaitable, Callable, Protocol
from .adapters.agent import extract_agent_reach
from .adapters.crawl import extract_crawl4ai
from .adapters.documents import extract_docling
from .adapters.html import extract_html
from .capabilities import eligible_engines
from .config import Settings
from .experiment_store import ExperimentStore, utc_now
from .models import Extracted
from .router import platform_for
from .scoring import aggregate_score, deterministic_score, detect_regressions
from .security import validate_url
from .service import normalize_adapter_result
from .storage_v2 import sanitize
from .resources import run_adapter


class ExtractionAdapter(Protocol):
    async def __call__(self,url: str,settings: Settings)->Extracted: ...


class BenchmarkRunner:
    def __init__(self,settings: Settings,store: ExperimentStore,adapters=None,
                 validator: Callable[[str],Awaitable[str]]=validate_url,automated_evaluator=None):
        self.settings=settings;self.store=store;self.validator=validator
        self.automated_evaluator=automated_evaluator
        self.adapters=adapters or {'html':extract_html,'crawl4ai':extract_crawl4ai,'agent_reach':extract_agent_reach,'docling':extract_docling}

    async def execute(self,run_id: str):
        run=self.store.get_run(run_id)
        if not run or run['status'] not in {'QUEUED','INTERRUPTED'}:return
        owner=f'{os.getpid()}:{uuid.uuid4().hex}'
        if not self.store.claim(run_id,owner):return
        config=self.settings
        snapshot=self.store.snapshot(run_id)
        if snapshot:
            names={f.name for f in fields(Settings)}
            config=Settings(**{k:v for k,v in snapshot['config'].items() if k in names})
        self.store.update_run(run_id,'RUNNING')
        try:
            await self.validator(run['url'])
            available,skipped=eligible_engines(run['category'],config,run['requested_engines'])
            for cap in skipped:
                if not any(a['engine']==cap.name for a in self.store.attempts(run_id)):
                    self.store.start_attempt(run_id,cap.name,cap.version,cap.backend,0,'SKIPPED',reason=cap.reason)
                self.store.upsert_result(run_id,cap.name,engine_version=cap.version,backend=cap.backend,state='SKIPPED',error=cap.reason,completed_at=utc_now())
            for cap in available:
                if self.store.is_cancel_requested(run_id):raise asyncio.CancelledError
                await self._engine(run,cap,config)
            self._score_run(run_id)
            if not available:
                self.store.update_run(run_id,'FAILED',error='No eligible enabled engines')
            elif not self.store.candidate_rows(run_id):
                self.store.update_run(run_id,'FAILED',error='All eligible engines finished without reviewable output')
            elif run['evaluation_mode']=='openai':
                if self.automated_evaluator is None:raise RuntimeError('OpenAI evaluator is disabled')
                self.store.update_run(run_id,'AWAITING_EVALUATION')
                from .evaluation import build_review_packet,import_ai_scores
                packet=build_review_packet(self.store,run_id)
                reviews=await self.automated_evaluator.evaluate(packet)
                import_ai_scores(self.store,self,run_id,reviews)
            else:
                self.store.update_run(run_id,'AWAITING_EVALUATION' if run['evaluation_mode']=='manual' else 'COMPLETED')
            self.update_regressions(run_id)
        except asyncio.CancelledError:
            explicit=self.store.is_cancel_requested(run_id)
            self.store.update_run(run_id,'CANCELLED' if explicit else 'INTERRUPTED')
            if not explicit:raise
        except Exception as exc:
            self.store.update_run(run_id,'FAILED',error=sanitize(f'{type(exc).__name__}: {exc}')[:1000])
        finally:
            self.store.release(run_id,owner)

    async def _invoke(self,run_id,url,engine,config):
        async def call():
            await self.validator(url)
            return await asyncio.wait_for(run_adapter(self.adapters[engine],engine,url,config),timeout=config.adapter_timeout_seconds+5)
        task=asyncio.create_task(call())
        try:
            while not task.done():
                if self.store.is_cancel_requested(run_id):raise asyncio.CancelledError
                await asyncio.wait({task},timeout=0.1)
            return await task
        finally:
            if not task.done():
                task.cancel()
                try:await task
                except asyncio.CancelledError:pass

    async def _engine(self,run,cap,config):
        run_id=run['id'];engine=cap.name
        self.store.upsert_result(run_id,engine,state='RUNNING',engine_version=cap.version,backend=cap.backend,started_at=utc_now())
        existing=self.store.attempts(run_id)
        done={a['repetition'] for a in existing if a['engine']==engine and a['state'] in {'COMPLETED','PARTIAL','FAILED','TIMEOUT'}}
        try:
            for rep in range(1,run['repetitions']+1):
                if rep in done:continue
                if self.store.is_cancel_requested(run_id):raise asyncio.CancelledError
                attempt=self.store.start_attempt(run_id,engine,cap.version,cap.backend,rep)
                tick=time.monotonic();cpu=time.process_time();rss=_max_rss_bytes()
                try:
                    result=await self._invoke(run_id,run['url'],engine,config)
                    raw=_extracted_payload(result)
                    warnings=[]
                    result=normalize_adapter_result(engine,platform_for(run['url']),result,warnings)
                    if platform_for(run['url'])=='youtube' and engine in {'html','crawl4ai'}:
                        result.metadata['content_scope']='webpage_text; video/transcript completeness unverified'
                    normalized=_extracted_payload(result)
                    original=normalized['content'] or normalized['markdown'] or ''
                    normalized['content']=(normalized['content'] or '')[:config.benchmark_artifact_max_chars]
                    normalized['markdown']=(normalized['markdown'] or '')[:config.benchmark_artifact_max_chars]
                    truncation=dict(result.truncation)
                    if len(original)>config.benchmark_artifact_max_chars:
                        truncation.update(truncated=True,reason='artifact_content_limit',original_length=len(original),stored_length=config.benchmark_artifact_max_chars,original_complete_retained=False)
                        raw['content']=(raw.get('content') or '')[:config.benchmark_artifact_max_chars]
                        raw['markdown']=(raw.get('markdown') or '')[:config.benchmark_artifact_max_chars]
                    payload={**normalized,'schema_version':'2','source_url':run['url'],'truncated':bool(truncation.get('truncated')),
                             'truncation':truncation,'raw_adapter_output':raw,'normalized_output':normalized,
                             'redaction_policy':'secrets-v1','warnings':warnings}
                    artifact=self.store.write_artifact(run_id,'output',payload)
                    metadata={**result.metadata,**{k:getattr(result,k) for k in ('title','description','author') if getattr(result,k)}}
                    backend=metadata.get('underlying_backend') or metadata.get('backend') or cap.backend
                    state={'extracted':'COMPLETED','metadata_only':'PARTIAL','unsupported':'SKIPPED','blocked':'SKIPPED'}.get(result.status,'FAILED')
                    self.store.finish_attempt(attempt,state,duration=time.monotonic()-tick,status=result.status,
                        artifact_path=artifact,output_chars=len(normalized['content'] or normalized['markdown']),truncation=truncation,metadata=metadata,
                        backend=backend,resources={'cpu_seconds':time.process_time()-cpu,'rss_before_bytes':rss,'rss_after_bytes':_max_rss_bytes(),'scope':'parent_process_observation'})
                    self.store.bind_attempt(run_id,attempt,artifact)
                except asyncio.CancelledError:
                    self.store.finish_attempt(attempt,'CANCELLED' if self.store.is_cancel_requested(run_id) else 'INTERRUPTED',duration=time.monotonic()-tick,error_type='CancelledError')
                    raise
                except Exception as exc:
                    failed_path=self.store.write_artifact(run_id,'failure_output',{'raw_adapter_output':exc.raw_output}) if getattr(exc,'raw_output',None) else None
                    self.store.finish_attempt(attempt,'TIMEOUT' if isinstance(exc,TimeoutError) else 'FAILED',duration=time.monotonic()-tick,error_type=type(exc).__name__,error=(str(exc) or 'Adapter exceeded configured timeout')[:2000],artifact_path=failed_path,backend=getattr(exc,'backend',None))
                finally:self._summarize(run_id,cap)
        finally:self._summarize(run_id,cap)

    def _summarize(self,run_id,cap):
        rows=[a for a in self.store.attempts(run_id) if a['engine']==cap.name]
        measured=[a for a in rows if a['state'] not in {'SKIPPED','CANCELLED','INTERRUPTED','RUNNING'}]
        success=[a for a in rows if a['state'] in {'COMPLETED','PARTIAL'}]
        representative=next((a for a in rows if a['state']=='COMPLETED'),None) or next(iter(success),None)
        path=None;content={}
        if representative:
            path=self.store.artifact_record(representative['artifact_id'])['path'];content=self.store.read_artifact(path)
        state='COMPLETED' if representative else (rows[-1]['state'] if rows else 'PENDING')
        if state=='TIMEOUT':state='FAILED'
        self.store.upsert_result(run_id,cap.name,state=state,engine_version=cap.version,backend=(representative or {}).get('backend') or cap.backend,
            completed_at=utc_now(),artifact_path=path,extraction_status=(representative or {}).get('extraction_status'),
            attempts=len(measured),successes=sum(a['state']=='COMPLETED' for a in measured),
            latency_seconds=statistics.median([a['duration_seconds'] for a in measured if a['duration_seconds'] is not None]) if measured else None,
            output_chars=(representative or {}).get('output_chars') or 0,metadata_json=(representative or {}).get('metadata_json','{}'),
            title=content.get('title'),final_url=content.get('final_url'),error=next((a['error'] for a in reversed(rows) if a['error']),None),
            attempt_details_json=json.dumps([{'attempt_id':a['id'],'repetition':a['repetition'],'status':a['extraction_status'] or a['state'],'latency_seconds':a['duration_seconds'],'error':a['error']} for a in rows]))

    def _score_run(self,run_id,ai_by_result=None):
        run=self.store.get_run(run_id);snapshot=self.store.snapshot(run_id)
        minimum=snapshot['config']['benchmark_min_reliability_runs'] if snapshot else self.settings.benchmark_min_reliability_runs
        ai_by_result=ai_by_result if ai_by_result is not None else self.store.ai_evaluations(run_id)
        for result in self.store.get_results(run_id):
            d=deterministic_score(category=run['category'],predicted_metadata=result['metadata'],
                reference_metadata=run['reference_metadata'] if run['reference_verified'] else {},attempts=result['attempts'],successes=result['successes'],
                median_latency=result['latency_seconds'],min_reliability_runs=minimum)
            combined=aggregate_score(d,ai_by_result.get(result['id']),reference_verified=run['reference_verified'])
            self.store.save_score(run_id,result['id'],**{**d,**combined})

    def rescore_with_ai(self,run_id,ai_by_result):
        self._score_run(run_id,ai_by_result)
        reviewed={r['candidate_id'] for r in self.store.evaluation_history(run_id)}
        candidates={r['candidate_id'] for r in self.store.candidate_rows(run_id)}
        if candidates and reviewed>=candidates:self.store.update_run(run_id,'COMPLETED')
        self.update_regressions(run_id)

    def update_regressions(self,run_id):
        run=self.store.get_run(run_id);previous=self.store.previous_comparable_run(run)
        findings=detect_regressions(run,self.store.get_results(run_id),previous,self.store.get_results(previous['id']) if previous else [])
        self.store.replace_regressions(run_id,findings)


class BenchmarkManager:
    def __init__(self,runner,queue_size=8):
        self.runner=runner;self.queue=asyncio.Queue(maxsize=queue_size);self.worker=None
    def start(self,*,recover_existing=False):
        if self.worker is None or self.worker.done():
            if recover_existing:self.runner.store.recover_interrupted(0)
            self.worker=asyncio.create_task(self._work(),name='benchmark-worker')
    async def submit(self,run_id):
        self.start();self.queue.put_nowait(run_id)
    async def _work(self):
        while True:
            try:run_id=await asyncio.wait_for(self.queue.get(),timeout=0.5);queued=True
            except TimeoutError:
                pending=self.runner.store.recover_interrupted(1)
                if not pending:continue
                run_id=pending[0];queued=False
            try:await self.runner.execute(run_id)
            finally:
                if queued:self.queue.task_done()
    async def close(self):
        if self.worker and not self.worker.done():
            self.worker.cancel()
            try:await self.worker
            except asyncio.CancelledError:pass


def _max_rss_bytes():
    try:
        import resource
        value=int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        return value if sys.platform=='darwin' else value*1024
    except (ImportError,ValueError):return None


def _extracted_payload(result):
    return {key:getattr(result,key,None) for key in ('status','engine','final_url','title','author','description','content','markdown','images','metadata','truncation','raw_output','content_type','language','links','image_metadata')}
