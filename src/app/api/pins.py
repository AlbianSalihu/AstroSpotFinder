from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.models.pin import Pin, PinUpdate
from app.paths import PINS_FILE
from app.repositories.pin_repository import (
    DuplicatePinError,
    PinRepository,
)


router = APIRouter(
    prefix="/api/pins",
    tags=["pins"],
)


@lru_cache(maxsize=1)
def get_repository() -> PinRepository:
    return PinRepository(PINS_FILE)


@router.get(
    "",
    response_model=list[Pin],
)
def list_pins(
    repository: PinRepository = Depends(get_repository),
) -> list[Pin]:
    return repository.list_pins()


@router.post(
    "",
    response_model=Pin,
    status_code=status.HTTP_201_CREATED,
)
def create_pin(
    pin: Pin,
    repository: PinRepository = Depends(get_repository),
) -> Pin:
    try:
        return repository.add_pin(pin)
    except DuplicatePinError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error


@router.patch(
    "/{pin_id}",
    response_model=Pin,
)
def update_pin(
    pin_id: str,
    update: PinUpdate,
    repository: PinRepository = Depends(get_repository),
) -> Pin:
    updated = repository.update_pin(pin_id, update.label)

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'Pin "{pin_id}" was not found.',
        )

    return updated


@router.delete(
    "/{pin_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_pin(
    pin_id: str,
    repository: PinRepository = Depends(get_repository),
) -> Response:
    was_removed = repository.remove_pin(pin_id)

    if not was_removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'Pin "{pin_id}" was not found.',
        )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )
