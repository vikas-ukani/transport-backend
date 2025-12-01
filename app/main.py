from collections import defaultdict
from fastapi import FastAPI, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from app.config.prisma import connect_db, disconnect_db
from app.config.settings import settings
from app.config.log_manager import logger

from app.route.auth_router import router as AuthRouter
from app.route.user_router import router as UserRouter
from app.route.post_router import router as PostRouter
from app.route.upload_route import router as UploadRouter

app = FastAPI(debug=settings.DEBUG)

# Log Middleware.
# app.add_middleware(LogMiddleware)

@app.on_event("startup")
async def startup():
    await connect_db()

@app.on_event("shutdown")
async def shutdown():
    await disconnect_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", 'http://192.168.0.101:8081','192.168.0.101:8081', 'localhost:8081'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers={"*"},
)


@app.exception_handler(RequestValidationError)
async def custom_form_validation_error(request, exc):
    reformatted_message = defaultdict(list)
    for pydantic_error in exc.errors():
        loc, msg = pydantic_error["loc"], pydantic_error["msg"]
        filtered_loc = loc[1:] if loc[0] in ("body", "query", "path") else loc
        field_string = ".".join(filtered_loc)  # nested fields with dot-notation
        reformatted_message[field_string].append(msg)

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=jsonable_encoder(
            {"detail": "Invalid request", "errors": reformatted_message}
        ),
    )


@app.get("/", )
async def index():
    logger.info({"message": "logging from the root logger"})
    return {"message": "Welcome to the project."}

# Mobile Router
app.include_router(AuthRouter, prefix="/api")
app.include_router(UserRouter, prefix="/api")
app.include_router(PostRouter, prefix="/api")
app.include_router(UploadRouter, prefix="/api")

# Admin Router
app.include_router(UserRouter, prefix="/admin")

# app.include_router(ProductRouter, prefix="/api")
# app.include_router(CategoryRouter, prefix="/api")
# app.include_router(WishlistRouter, prefix="/api")
# app.include_router(CartRouter, prefix="/api")
