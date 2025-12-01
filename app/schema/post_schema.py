from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime

class PostBase(BaseModel):
    title: str
    content: Optional[str] = None
    published: Optional[bool] = False
    isActive: Optional[bool] = False


class PostCreate(BaseModel):
    title: str = Field(..., example="Sample Post Title", description="The title of the post")
    content: Optional[str] = Field(None, example="This is the content of the post.", description="The main content of the post")
    published: Optional[bool] = Field(False, example=False, description="Whether the post is published")
    # isActive: Optional[bool] = Field(False, example=False, description="Whether the post is active")
    images: Optional[list[int]] = Field(
        None, example=[1, 2], description="List of media (image) IDs associated with this post"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "My First Post",
                "content": "Hello, this is an example post.",
                "published": True,
                # "isActive": True,
                "images": [1, 2]
            }
        }
    }



class PostUpdate(BaseModel):
    title: Optional[str] = Field(
        None, example="Updated Post Title", description="The new title of the post"
    )
    content: Optional[str] = Field(
        None, example="This is the updated content of the post.", description="The new content of the post"
    )
    published: Optional[bool] = Field(
        None, example=True, description="Whether the post is published"
    )
    # isActive: Optional[bool] = Field(
    #     None, example=True, description="Whether the post is active"
    # )


class PostResponse(PostBase):
    id: int
    authorId: Optional[int]
    likeCount: int
    publishedAt: Optional[datetime]
    createdAt: datetime
    updatedAt: datetime

    class Config:
        orm_mode = True
