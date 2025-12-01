# from bson import ObjectId
from passlib.context import CryptContext
from jose import jwt
from fastapi.security import OAuth2PasswordBearer, HTTPBearer
from fastapi import Depends, HTTPException, status
import prisma
from datetime import datetime, timedelta
from app.config.settings import settings
from app.config.db import serializeDict
from app.config.log_manager import logger

pwd_context = CryptContext(schemes=["bcrypt"])
security = HTTPBearer()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/signin")


def hash_password(password: str):
    return pwd_context.hash(password, scheme="bcrypt")


def verify_password(password: str, hashed_password: str):
    return pwd_context.verify(password, hashed_password)


def create_token(user_id):
    to_encode = {"user_id": user_id}
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRES_IN_MINUTES)
    to_encode.update({"exp": expire})
    jwt_token = jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    return jwt_token


async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        decoded = jwt.decode(
            token, key=settings.JWT_SECRET_KEY, algorithms=settings.JWT_ALGORITHM
        )
        user_id = decoded.get("user_id")
        user = await prisma.users.find_unique(where={"id": user_id})
        # user = User.find_one({"_id": user_id})
        if not user:
            return {"success": False, "message": "User not found."}
        return {"user": user, "success": True}
    except Exception as error:
        logger.info(error.__str__())
        return {"success": False, "message": "Invalid authentication token."}
