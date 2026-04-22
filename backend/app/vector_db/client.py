"""ChromaDB client and collection management."""
import os
import chromadb
from chromadb.config import Settings
from functools import lru_cache


@lru_cache(maxsize=1)
def get_chroma_client() -> chromadb.Client:
    return chromadb.PersistentClient(
        path=os.path.join(os.path.dirname(__file__), "../../../../data/chroma"),
        settings=Settings(anonymized_telemetry=False)
    )


def get_collection(name: str = "best_practices"):
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"}
    )
