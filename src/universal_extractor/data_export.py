"""Versioned observations and label exports; no training or routing changes."""
from __future__ import annotations
import csv
import json
from pathlib import Path
from .storage_v2 import now,encode,digest,sanitize
from .scoring import deterministic_score


def export_training_data(store,output,*,rubric_version='v0.3.0',dataset_version=None,format='csv'):
    root=Path(output).resolve()
    root.mkdir(parents=True,exist_ok=False,mode=0o700)
    report=store.integrity_report()
    if report['issues'] or report['broken_references'] or report['foreign_key_violations'] or report['orphans'] or report['staged']:
        raise ValueError('Repair artifact/relational integrity before exporting')
    features=[];outcomes=[];evaluations=[];scores=[];legacy=[];artifacts=[]
    with store.connect() as db:
        query='SELECT * FROM benchmark_runs WHERE rubric_version=?'
        args=[rubric_version]
        if dataset_version:query+=' AND dataset_version=?';args.append(dataset_version)
        runs=[dict(r) for r in db.execute(query,args)]
        for run in runs:
            artifacts.extend(dict(row) for row in db.execute('SELECT * FROM artifacts WHERE run_id=?',(run['id'],)))
            snapshot=store.snapshot(run['id'])
            if snapshot:
                item={'run_id':run['id'],'dataset_version':run['dataset_version'],**snapshot['features']}
                item['config_snapshot_run_id']=run['id'];features.append(item)
                item['configuration']=snapshot['config']
                item['environment']=snapshot['environment']
            else:
                legacy.append({'run_id':run['id'],'reason':'legacy_missing_input_snapshot'})
            history=store.evaluation_history(run['id'])
            for event in history:
                evaluations.append({**event,'observation_kind':'verified_label' if event['status']=='VERIFIED' else 'provisional_or_insufficient_review'})
            for a in store.attempts(run['id']):
                records=[e for e in history if e['attempt_id']==a['id'] and e['rubric_version']==rubric_version]
                latest=records[-1] if records else None
                verified=[e for e in records if e['status']=='VERIFIED']
                label=verified[-1] if verified else None
                ai=json.loads(label['score_json']) if label else {}
                artifact=store.artifact_record(a['artifact_id']) if a['artifact_id'] else None
                metadata_metric=deterministic_score(category=run['category'],predicted_metadata=json.loads(a['metadata_json']),
                    reference_metadata=json.loads(run['reference_metadata_json']) if run['reference_verified'] else {},
                    attempts=0,successes=0,median_latency=a['duration_seconds'])['metadata_score']
                outcomes.append({**a,'category':run['category'],'dataset_version':run['dataset_version'],'rubric_version':rubric_version,
                    'verified_metadata_quality_score':metadata_metric,'metadata_label_missing':metadata_metric is None,
                    'observation_kind':'raw_attempt','ai_label_missing':label is None,'verified_ai_score':label['ai_score'] if label else None,
                    'verified_fidelity':ai.get('fidelity'),'verified_completeness':ai.get('completeness'),
                    'verified_structure':ai.get('structure'),'verified_grounding':ai.get('grounding'),
                    'label_evaluation_id':label['id'] if label else None,'latest_review_id':latest['id'] if latest else None,
                    'reference_artifact_id':label['reference_artifact_id'] if label else None,
                    'artifact_sha256':artifact['sha256'] if artifact else None,'artifact_path':artifact['path'] if artifact else None})
            scores.extend({**dict(s),'observation_kind':'derived_engine_aggregate'} for s in db.execute('SELECT * FROM score_events WHERE run_id=? AND rubric_version=?',(run['id'],rubric_version)))
    tables={'input_features':features,'attempt_outcomes':outcomes,'evaluation_history':evaluations,'derived_scores':scores,'artifact_inventory':artifacts,'legacy_coverage':legacy}
    paths=[]
    for name,rows in tables.items():
        columns=list(dict.fromkeys(key for row in rows for key in row)) or ['run_id']
        normalized=[{k:encode(v) if isinstance(v,(dict,list)) else sanitize(v) for k,v in row.items()} for row in rows]
        path=root/f'{name}.csv'
        with path.open('x',newline='',encoding='utf-8') as handle:
            writer=csv.DictWriter(handle,fieldnames=columns);writer.writeheader();writer.writerows(normalized)
        paths.append(path)
        if format=='parquet':
            try:
                import pyarrow as pa
                import pyarrow.parquet as pq
            except ImportError as exc:raise ValueError('Parquet requires an already installed pyarrow; CSV is fully supported') from exc
            path=root/f'{name}.parquet';pq.write_table(pa.Table.from_pylist(normalized),path);paths.append(path)
    manifest={'schema_version':'training-export-v1.2','created_at':now(),'rubric_version':rubric_version,
        'dataset_version_filter':dataset_version,'run_count':len(runs),'coverage':{k:len(v) for k,v in tables.items()},
        'missing_values':'blank CSV cells mean missing, numeric 0 means measured zero',
        'selection_policy':'latest verified review per attempt; all reviews retained separately',
        'feature_label_separation':'Only input_features is an input table; join by run_id. Other files contain outcomes/labels.',
        'files':{p.name:{'sha256':digest(p.read_bytes()),'bytes':p.stat().st_size} for p in paths}}
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return manifest
