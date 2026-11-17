"""Evidence-gated actions. No LLM or inference from inaccessible media."""
import re
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from .auth import principal
from .db import owned
from .problems import Problem

router = APIRouter(prefix='/v1')


def ingredient_lines(text: str) -> list[str]:
    """Preserve exact source lines; never manufacture ingredients or quantities."""
    lines = (text or '').splitlines()[:500]
    start = next((i for i,line in enumerate(lines)
                  if re.fullmatch(r'\s*(?:#{1,5}\s*)?(?:\*\*)?ingredients(?:\*\*)?\s*:?\s*',
                                  line, flags=re.IGNORECASE)), None)
    if start is None:
        return []
    result = []
    for raw in lines[start+1:start+45]:
        line = raw.strip()
        if re.match(r'^(?:#{1,5}\s*)?(directions|instructions|method|preparation|steps)\b',
                    line, re.IGNORECASE):
            break
        if not line:
            if result:
                break
            continue
        if len(line) > 200:
            break
        if re.match(r'^(?:[-*•]\s+|\d+[.)]\s+)',line):
            result.append(line)
        elif result:
            # Do not extend a recognized list with unrelated prose.
            break
    return result[:24]


def eligible_actions(row) -> list[dict]:
    """Only text that was actually persisted as readable can unlock an action."""
    if row['processing_state'] != 'ready':
        return []
    content = row['user_note'] if row['kind']=='note' else row['extracted_text']
    if not content.strip():
        return []
    topic = row['suggested_topic']  # manual overrides never count as evidence
    reason = row['suggested_topic_reason']
    if not topic or not reason:
        return []
    if topic == 'Food':
        lines = ingredient_lines(content)
        return [{
            'kind':'shopping','label':'Create shopping list',
            'reason':'Recognizable ingredient lines in accessible recipe text.',
            'evidence_lines':lines,
        }] if lines else []
    if topic == 'Travel':
        return [{
            'kind':'trip','label':'Start a trip shortlist',
            'reason':reason,'evidence_lines':[],
        }]
    if topic == 'Learning':
        return [{
            'kind':'learning','label':'Add to learning queue',
            'reason':reason,'evidence_lines':[],
        }]
    return []


@router.get('/memories/{memory_id}/action-options')
async def memory_action_options(memory_id: UUID, request: Request,
                                who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner, readonly=True) as conn:
        row = await conn.fetchrow('''SELECT version,kind,user_note,extracted_text,processing_state,
            suggested_topic,suggested_topic_reason FROM memories
            WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL''', memory_id, owner)
        if row is None:
            raise Problem(404,'memory_not_found')
    return {'items':eligible_actions(row), 'source_version':row['version']}
