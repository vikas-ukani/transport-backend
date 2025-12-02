from typing import Annotated
from fastapi import APIRouter, Body, Depends

from app.schema.user_schema import CreateUserSchema, User
from app.config.jwt import get_current_user

router = APIRouter()


from typing import List, Optional
from fastapi import HTTPException, status
from app.config.prisma import prisma
from pydantic import BaseModel, validator
from datetime import datetime

# Pydantic Schemas for Post
# --- Post Routes Group ---
from app.schema.post_schema import PostCreate, PostUpdate, PostResponse

@router.get("/videos", response_description="Get all videos from database.")
async def get_videos(user: Annotated[User, Depends(get_current_user)]):
    try:
        videos = await prisma.video.find_many(order={"id": "desc"})
        # If you want to cast to dict for response
        videos = [video.model_dump() for video in videos]
        return {"data": videos, "success": True}
    except Exception as e:
        print(f"Error fetching videos: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": "An error occurred while fetching videos.",
                "data": [],
            },
        )


@router.get("/posts", response_description="Get all posts from database.")
async def get_posts(user: Annotated[User, Depends(get_current_user)]):
    print("getting posts")
    try:
        print(f"userId {user.id}")
        userId = int(user.id)
        posts = await prisma.post.find_many(
            where={"userId": userId, "isActive": True},
            order={"createdAt": "desc"},
            include={"user": True, "images": True},
        )
        posts = [post.model_dump() for post in posts]
        for post in posts:
            if post["user"]:
                user_obj = post["user"]
                post["user"] = {
                    "id": user_obj["id"],
                    "name": user_obj["name"],
                    "photo": user_obj["photo"],
                }
        return {"data": posts, "success": True}
    except Exception as e:
        print(f"Error fetching posts: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": "An error occurred while fetching posts.",
                "data": [],
            },
        )


@router.post(
    "/posts",
    response_description="Create a new post in the database.",
)
async def create_post(
    post: PostCreate,
    user: Annotated[User, Depends(get_current_user)],
):
    try:
        # To get the user id from the user model (object), use: user.id
        post_data = post.dict()
        post_data["userId"] = int(user.id)
        # Step 1: Create post without image relations
        image_ids = post_data.pop("images", None)
        created_post = await prisma.post.create(data=post_data)

        return {
            "success": True,
            "message": "Post created successfully.",
            "data": created_post,
        }
        # pass
        # Step 2: Update Media records to set their postId to the created post's ID, if any image IDs provided.
        if image_ids:
            # Only update images that exist and are not already linked to a post, or just overwrite the link
            await prisma.media.update_many(
                where={"id": {"in": image_ids}}, data={"postId": created_post.id}
            )
        # Explicitly fetch the user and image details for the created post and reformat as a full response
        post_with_relations = await prisma.post.find_unique(
            where={"id": created_post.id}, include={"user": True, "images": True}
        )

        if post_with_relations and getattr(post_with_relations, "user", None):
            user = post_with_relations.user
            user_basic = {
                "id": getattr(user, "id", None),
                "name": getattr(user, "name", None),
                "photo": getattr(user, "photo", None),
            }
            # If post_with_relations is a pydantic model, set attribute
            setattr(post_with_relations, "user", user_basic)
        if not post_with_relations:
            raise HTTPException(
                status_code=404,
                detail={"success": False, "message": "Post not found.", "data": None},
            )

        return {
            "success": True,
            "message": "Post created successfully.",
            "data": post_with_relations,
        }
    except Exception as e:
        print(f"Error creating post: {e},")
        raise HTTPException(
            status_code=500, detail="An error occurred while creating the post."
        )


@router.put(
    "/posts/{post_id}",
    response_model=PostResponse,
    response_description="Update a post in the database.",
)
async def update_post(
    post_id: int,
    post: PostUpdate,
    user: Annotated[User, Depends(get_current_user)],
):
    db_post = await prisma.post.find_unique(where={"id": post_id})
    if not db_post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Post not found"
        )
    if db_post.userId != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not userized to update this post",
        )
    updated_data = post.dict(exclude_unset=True)
    updated_post = await prisma.post.update(where={"id": post_id}, data=updated_data)
    return updated_post


@router.delete(
    "/posts/{post_id}", response_description="Delete a post from the database."
)
async def delete_post(
    post_id: int,
    user: Annotated[User, Depends(get_current_user)],
):
    db_post = await prisma.post.find_unique(where={"id": post_id})
    if not db_post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Post not found"
        )
    if db_post.userId != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this post",
        )
    await prisma.post.delete(where={"id": post_id})
    return {"message": "Post deleted successfully"}


# @router.post("/create-post", response_description="Create new user into database.")
# async def createUsers(param: CreateUserSchema = Body()):
#     user = jsonable_encoder(param)
#     newUser = await create_user(user=user)
#     return {"data": newUser, "message": "User has been created."}
