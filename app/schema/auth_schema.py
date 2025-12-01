from pydantic import BaseModel, Field, EmailStr
from app.schema.user_schema import UserBaseSchema
from app.schema.user_schema import User


class LoginModel(BaseModel):
    success: bool
    token: str
    user: User | None


class LoginSchema(BaseModel):
    email: EmailStr
    password: str

    model_config = {
        "json_schema_extra": {
            "example": {"email": "vikas@gmail.com", "password": "password"}
        }
    }


class SignUpSchema(UserBaseSchema):
    name: str = Field(..., description="Name of the user", example="Vikas Ukani")
    email: EmailStr = Field(
        ...,
        description="Valid email address of the user",
        example="vikasukani5@gmail.com",
    )
    mobile: str = Field(
        ...,
        min_length=10,
        description="Mobile number of the user",
        example="9999999999",
    )
    password: str = Field(
        ...,
        min_length=6,
        description="Password (at least 6 characters)",
        example="password",
    )
    confirm_password: str = Field(
        ...,
        description="Password confirmation, must match password",
        example="password",
    )
    type: str = Field(
        ..., description="User type ('customer' or 'driver')", example="customer"
    )
    photo: str = Field(..., description="User photo", example="photo")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Vikas Ukani",
                    "email": "vikasukani5@gmail.com",
                    "mobile": "9999999999",
                    "password": "password",
                    "confirm_password": "password",
                    "type": "customer",
                    "photo": "customer.jpg",
                },
                {
                    "name": "Driver Name",
                    "email": "driver@example.com",
                    "mobile": "9123456789",
                    "password": "driverpass",
                    "confirm_password": "driverpass",
                    "type": "driver",
                },
            ],
            "fields": {
                "name": {"description": "Name of the user", "example": "Vikas Ukani"},
                "email": {
                    "description": "Valid email address of the user",
                    "example": "vikasukani5@gmail.com",
                },
                "mobile": {
                    "description": "Mobile number of the user",
                    "min_length": 10,
                    "example": "9999999999",
                },
                "password": {
                    "description": "Password (at least 6 characters)",
                    "min_length": 6,
                    "example": "password",
                },
                "confirm_password": {
                    "description": "Password confirmation, must match password",
                    "example": "password",
                },
                "type": {
                    "description": "User type ('customer' or 'driver')",
                    "example": "customer",
                },
                "photo": {
                    "description": "User photo",
                    "example": "photo",
                },
            },
        }
    }
