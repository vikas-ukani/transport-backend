from typing import Annotated
from fastapi import APIRouter, Body, Depends

from app.schema.user_schema import CreateUserSchema, User
from app.config.jwt import get_current_user

router = APIRouter()


@router.get("/posts", response_description="Get all posts from database.")
async def getPosts(user=Annotated[User, Depends(get_current_user)]):
    return {"posts": "All posts"}


# @router.post("/create-post", response_description="Create new user into database.")
# async def createUsers(param: CreateUserSchema = Body()):
#     user = jsonable_encoder(param)
#     newUser = await create_user(user=user)
#     return {"data": newUser, "message": "User has been created."}
