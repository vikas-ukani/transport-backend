import uvicorn
import subprocess

if __name__ == '__main__':
    # Run the Prisma generate command
    subprocess.run(["prisma", "generate"], check=True)
    # Start the FastAPI server
    uvicorn.run('app.main:app', host="0.0.0.0", reload=True, lifespan="on")