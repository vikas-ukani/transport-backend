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


@router.get("/posts", response_description="Get all posts from database.")
async def get_posts(user: Annotated[User, Depends(get_current_user)]):
    print("getting posts")
    try:
        posts = await prisma.post.find_many(
            order={"createdAt": "desc"}, include={"author": True, "images": True}
        )
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
        print(f"User ID: {user.id}")
        post_data = post.dict()
        post_data["authorId"] = int(user.id)
        # Step 1: Create post without image relations
        image_ids = post_data.pop("images", None)
        created_post = await prisma.post.create(data=post_data)

        print(f"Created Post ID::: {created_post.id}")
        # Step 2: Update Media records to set their postId to the created post's ID, if any image IDs provided.
        if image_ids:
            # Only update images that exist and are not already linked to a post, or just overwrite the link
            await prisma.media.update_many(
                where={"id": {"in": image_ids}}, data={"postId": created_post.id}
            )
        # Explicitly fetch the author and image details for the created post and reformat as a full response
        post_with_relations = await prisma.post.find_unique(
            where={"id": created_post.id},
            include={"author": True, "images": True}
        )

        if post_with_relations and getattr(post_with_relations, "author", None):
            author = post_with_relations.author
            author_basic = {
                "id": getattr(author, "id", None),
                "name": getattr(author, "name", None),
                "photo": getattr(author, "photo", None),
            }
            # If post_with_relations is a pydantic model, set attribute
            setattr(post_with_relations, "author", author_basic)
        if not post_with_relations:
            raise HTTPException(
                status_code=404,
                detail={"success": False, "message": "Post not found.", "data": None}
            )

        return {
            "success": True, 
            "message": "Post created successfully.",
            "data": post_with_relations
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
    if db_post.authorId != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this post",
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
    if db_post.authorId != user.id:
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
