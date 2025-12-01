from typing import Annotated
from fastapi import APIRouter, Body, Depends
from app.helper.user_helper import (
    create_user,
    get_users,
)
from app.schema.user_schema import CreateUserSchema, User
from fastapi.encoders import jsonable_encoder
from app.config.jwt import get_current_user

router = APIRouter()


@router.get("/user-me", response_description="Get all users from database.")
async def get_me(user: Annotated[User, Depends(get_current_user)]):
    if not user:
        return {"success": False, "message": "User not found."}
    return {"user": user, "success": True}


@router.post("/create-users", response_description="Create new user into database.")
async def createUsers(param: CreateUserSchema = Body()):
    user = jsonable_encoder(param)
    newUser = await create_user(user=user)
    return {"data": newUser, "message": "User has been created."}
