from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime

class User(BaseModel):
    __tablename__ = "users"
    id: str
    name: str
    email: str
    mobile: str 
    createdAt: datetime
    updatedAt: datetime

class UserBaseSchema(BaseModel):
    name: str
    email: str
    mobile: str
    createdAt: datetime = datetime.now()
    updatedAt: datetime  = datetime.now()

class CreateUserSchema(UserBaseSchema):
    name: str = Field()
    email: EmailStr = Field()
    mobile: str = Field()


    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Vikas Ukani",
                "email": "vikasukani5@gmail.com",
                "password": "password",
                "mobile": "0000000000",
            }
        }
    }

class UpdateUser(BaseModel):
    name: Optional[str]
    email: Optional[EmailStr]