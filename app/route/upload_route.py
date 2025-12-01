from app.config.jwt import get_current_user
from fastapi import APIRouter, UploadFile, HTTPException, Depends
import os
import shutil
from fastapi.responses import FileResponse
import uuid

UPLOAD_DIRECTORY = "uploads"

# Create directory if not exists
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

router = APIRouter()


@router.post("/upload")
async def upload(file: UploadFile):
    print(f"Filename is {file.filename}")

    try:
        # Get original extension
        ext = os.path.splitext(file.filename)[1]  # .jpg, .png, .pdf

        # Create unique filename
        unique_name = f"{uuid.uuid4()}{ext}"

        file_path = os.path.join(UPLOAD_DIRECTORY, unique_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

    except Exception as e:
        return {
            "success": False,
            "message": f"There was an error uploading the file",
        }
    finally:
        await file.close()
    return {
        "success": True,
        "original_filename": file.filename,
        "filename": unique_name,
        "url": f"/{UPLOAD_DIRECTORY}/{unique_name}",
        "message": "File uploaded successfully!"
    }

@router.get("/files/{filename}")
async def get_file(filename: str):
    file_path = os.path.join(UPLOAD_DIRECTORY, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)
