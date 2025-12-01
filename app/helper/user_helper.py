from app.config.prisma import prisma
from app.config.db import serializeDict
from app.config.log_manager import logger


async def get_users() -> list:
    users = []
    async for user in await prisma.users.find():
        del user["password"]
        if "password_confirm" in user:
            del user["password_confirm"]
        users.append(serializeDict(user))
    return users


async def create_user(user: dict) -> dict:
    user = await prisma.user.create(data=user)
    print(user.json())
    newUser = await prisma.user.find_first({
        "id": user.id
    })
    return serializeDict(newUser)


async def get_user_by_email(email: str):
    logger.info("Fine user by email: " + email)
    user = await prisma.user.find_first({"email": email})
    return serializeDict(user) if user is not None else None


async def get_user(id: str) -> dict:
    newUser = await prisma.user.find_first({"id": id})
    # newUser = await User.find_one({"_id": ObjectId(id)})
    return serializeDict(newUser)


async def update_user(id: str, param: dict):
    if len(param) < 1:
        return False
    user = await prisma.users.update({"id": id}, {"$set": param})
    # user = await User.find_one_and_update({"_id": ObjectId(id)}, {"$set": param})
    return True if user is not None else False


async def delete_user(id: str):
    user = await prisma.user.find_first({"id": id})
    # user = User.find_one({"id": ObjectId(id)})
    if user:
        await prisma.user.delete({"id": id})
        return True
    return False