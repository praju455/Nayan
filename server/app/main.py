from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router

app = FastAPI(title="Nayan Planning API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "chrome-extension://*", "moz-extension://*"],
    allow_origin_regex=r"^(chrome|moz)-extension://.*$",
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["content-type", "authorization"],
)
app.include_router(router)
