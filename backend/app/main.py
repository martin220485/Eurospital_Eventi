from fastapi import FastAPI

from app.api.routers import auth

app = FastAPI(title="Eurospital Eventi API")
app.include_router(auth.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
