from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Rule
from ..rules import RULE_TYPES, RuleValidationError, validate_rule_params
from ..rules.templates import RULE_TEMPLATES
from ..schemas import RuleCreate, RuleOut, RuleTemplate, RuleTypeOut, RuleUpdate, SampleRulesResult

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("/types", response_model=list[RuleTypeOut])
def list_rule_types() -> list[RuleTypeOut]:
    return [
        RuleTypeOut(
            key=t.key,
            label=t.label,
            description=t.description,
            params_schema=t.params_model.model_json_schema(),
        )
        for t in RULE_TYPES.values()
    ]


# Static paths are declared before the "/{rule_id}" routes so they are never taken for an id.
@router.get("/templates", response_model=list[RuleTemplate])
def list_rule_templates() -> list[RuleTemplate]:
    return RULE_TEMPLATES


@router.post("/samples", response_model=SampleRulesResult, status_code=status.HTTP_201_CREATED)
def create_sample_rules(db: Session = Depends(get_db)) -> SampleRulesResult:
    """Create every sample-set template. Idempotent: a rule whose name already exists is skipped."""
    existing = set(db.scalars(select(Rule.name)))
    created: list[Rule] = []
    skipped: list[str] = []
    for template in RULE_TEMPLATES:
        if not template.in_sample_set:
            continue
        if template.rule.name in existing:
            skipped.append(template.rule.name)
            continue
        rule = _new_rule(template.rule)
        db.add(rule)
        created.append(rule)
        existing.add(rule.name)
    db.commit()
    return SampleRulesResult(created=[RuleOut.model_validate(r) for r in created], skipped=skipped)


@router.get("", response_model=list[RuleOut])
def list_rules(db: Session = Depends(get_db)) -> list[Rule]:
    return list(db.scalars(select(Rule).order_by(Rule.id)))


@router.post("", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(body: RuleCreate, db: Session = Depends(get_db)) -> Rule:
    rule = _new_rule(body)
    db.add(rule)
    db.commit()
    return rule


@router.patch("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, body: RuleUpdate, db: Session = Depends(get_db)) -> Rule:
    rule = _get_or_404(db, rule_id)
    changes = body.model_dump(exclude_unset=True)
    if "params" in changes:
        changes["params"] = _validated(rule.type, changes["params"])
    for key, value in changes.items():
        setattr(rule, key, value)
    db.commit()
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, db: Session = Depends(get_db)) -> None:
    db.delete(_get_or_404(db, rule_id))
    db.commit()


def _new_rule(body: RuleCreate) -> Rule:
    data = body.model_dump()
    data["params"] = _validated(body.type, body.params)
    return Rule(**data)


def _validated(rule_type: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        return validate_rule_params(rule_type, params)
    except RuleValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


def _get_or_404(db: Session, rule_id: int) -> Rule:
    rule = db.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    return rule
