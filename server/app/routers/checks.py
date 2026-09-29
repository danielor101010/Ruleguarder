from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..checks import CheckRunner, get_runner
from ..db import get_db
from ..models import CheckRun
from ..schemas import CheckStatus

router = APIRouter(prefix="/api/checks", tags=["checks"])


@router.get("/{check_id}", response_model=CheckStatus)
def get_check(check_id: int, db: Session = Depends(get_db)) -> CheckRun:
    return _get_or_404(db, check_id)


@router.post("/{check_id}/cancel", response_model=CheckStatus)
def cancel_check(check_id: int, db: Session = Depends(get_db), runner: CheckRunner = Depends(get_runner)) -> CheckRun:
    return runner.cancel(db, _get_or_404(db, check_id))


def _get_or_404(db: Session, check_id: int) -> CheckRun:
    run = db.get(CheckRun, check_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check not found")
    return run
