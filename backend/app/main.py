from fastapi import FastAPI

app = FastAPI(title="Eurospital Eventi API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
