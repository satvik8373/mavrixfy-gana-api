import inspect
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Ensure repo root is on sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import ytmusicapi
from ytmusicapi import YTMusic
from ytmusicapi.auth.types import AuthType

app = FastAPI(title="ytmusicapi Testing & Explorer Hub", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global YTMusic instance state
current_auth: Optional[str] = None
current_language: str = "en"
current_location: str = ""
ytm_client: YTMusic = YTMusic(language=current_language, location=current_location)


def get_client() -> YTMusic:
    global ytm_client
    return ytm_client


def init_client(auth: Optional[str] = None, language: str = "en", location: str = "") -> YTMusic:
    global ytm_client, current_auth, current_language, current_location
    current_auth = auth
    current_language = language or "en"
    current_location = location or ""
    try:
        ytm_client = YTMusic(auth=auth, language=current_language, location=current_location)
        return ytm_client
    except Exception as e:
        # Fallback to unauthorized on error
        ytm_client = YTMusic(language=current_language, location=current_location)
        raise e


# Pre-configured sample presets for all API methods to make testing 1-click
METHOD_PRESETS: Dict[str, Dict[str, Any]] = {
    "search": {"query": "Dua Lipa Levitating", "filter": "songs", "limit": 10},
    "get_search_suggestions": {"query": "the weeknd", "detailed_runs": False},
    "get_home": {"limit": 3},
    "get_artist": {"channelId": "UC2XdaAVUannpujzv32jcouQ"},
    "get_artist_albums": {"channelId": "UC2XdaAVUannpujzv32jcouQ", "params": ""},
    "get_album": {"browseId": "MPREb_4pL8gz094W8"},
    "get_album_browse_id": {"audioPlaylistId": "OLAK5uy_l4a-Zq_XhG-L0e9e1L6m9_g1h"},
    "get_song": {"videoId": "kJQP7kiw5Fk"},
    "get_song_related": {"browseId": "MPREb_4pL8gz094W8"},
    "get_song_credits": {"browseId": "MPREb_4pL8gz094W8"},
    "get_lyrics": {"browseId": "MPLYt_kJQP7kiw5Fk"},
    "get_user": {"channelId": "UC2XdaAVUannpujzv32jcouQ"},
    "get_user_playlists": {"channelId": "UC2XdaAVUannpujzv32jcouQ"},
    "get_user_videos": {"channelId": "UC2XdaAVUannpujzv32jcouQ"},
    "get_tasteprofile": {},
    "get_playlist": {"playlistId": "RDCLAK5uy_kpx98w4q_b4e9i8a1y8k4f7", "limit": 15},
    "get_liked_songs": {"limit": 10},
    "get_saved_episodes": {"limit": 10},
    "get_charts": {"country": "US"},
    "get_explore": {},
    "get_mood_categories": {},
    "get_mood_playlists": {"params": ""},
    "get_watch_playlist": {"videoId": "kJQP7kiw5Fk", "limit": 10},
    "get_podcast": {"playlistId": "RDPN"},
    "get_channel": {"channelId": "UC2XdaAVUannpujzv32jcouQ"},
    "get_channel_episodes": {"channelId": "UC2XdaAVUannpujzv32jcouQ"},
    "get_episode": {"videoId": "kJQP7kiw5Fk"},
    "get_episodes_playlist": {"playlistId": "RDPN"},
    "get_account_info": {},
    "get_history": {},
    "get_library_songs": {"limit": 10},
    "get_library_albums": {"limit": 10},
    "get_library_artists": {"limit": 10},
    "get_library_playlists": {"limit": 10},
    "get_library_subscriptions": {"limit": 10},
    "get_library_podcasts": {"limit": 10},
    "get_library_channels": {"limit": 10},
    "get_library_upload_songs": {"limit": 10},
    "get_library_upload_albums": {"limit": 10},
    "get_library_upload_artists": {"limit": 10},
}

MIXIN_CATEGORIES = {
    "Search": ytmusicapi.mixins.search.SearchMixin,
    "Browsing": ytmusicapi.mixins.browsing.BrowsingMixin,
    "Playlists": ytmusicapi.mixins.playlists.PlaylistsMixin,
    "Charts": ytmusicapi.mixins.charts.ChartsMixin,
    "Explore": ytmusicapi.mixins.explore.ExploreMixin,
    "Watch": ytmusicapi.mixins.watch.WatchMixin,
    "Podcasts": ytmusicapi.mixins.podcasts.PodcastsMixin,
    "Library": ytmusicapi.mixins.library.LibraryMixin,
    "Uploads": ytmusicapi.mixins.uploads.UploadsMixin,
}

AUTH_REQUIRED_MIXINS = {"Library", "Uploads"}
AUTH_REQUIRED_METHODS = {
    "get_tasteprofile",
    "set_tasteprofile",
    "create_playlist",
    "edit_playlist",
    "delete_playlist",
    "add_playlist_items",
    "remove_playlist_items",
    "get_liked_songs",
    "get_saved_episodes",
    "join_collaborative_playlist",
    "remove_search_suggestions",
}


def build_methods_catalog():
    catalog = []
    for cat_name, mixin_cls in MIXIN_CATEGORIES.items():
        for attr_name in sorted(dir(mixin_cls)):
            if attr_name.startswith("_") or attr_name == "as_mobile":
                continue
            attr = getattr(mixin_cls, attr_name)
            if not callable(attr) or isinstance(attr, type):
                continue

            try:
                sig = inspect.signature(attr)
            except Exception:
                continue

            params = []
            for p_name, p in sig.parameters.items():
                if p_name == "self":
                    continue
                default_val = None if p.default == inspect.Parameter.empty else p.default
                annotation = str(p.annotation) if p.annotation != inspect.Parameter.empty else "Any"
                params.append(
                    {
                        "name": p_name,
                        "required": p.default == inspect.Parameter.empty,
                        "default": default_val,
                        "type": annotation.replace("typing.", "").replace("ytmusicapi.", ""),
                    }
                )

            doc = inspect.getdoc(attr) or ""
            summary = doc.split("\n\n")[0].replace("\n", " ").strip() if doc else ""

            requires_auth = (
                cat_name in AUTH_REQUIRED_MIXINS
                or attr_name in AUTH_REQUIRED_METHODS
                or "must be authenticated" in doc.lower()
                or "authentication credentials are required" in doc.lower()
            )

            preset = METHOD_PRESETS.get(attr_name, {})

            catalog.append(
                {
                    "name": attr_name,
                    "category": cat_name,
                    "summary": summary,
                    "doc": doc,
                    "parameters": params,
                    "requires_auth": requires_auth,
                    "preset": preset,
                }
            )
    return catalog


METHODS_CATALOG = build_methods_catalog()


class CallRequest(BaseModel):
    method: str
    args: Dict[str, Any] = {}


class AuthRequest(BaseModel):
    auth: Optional[str] = None
    language: Optional[str] = "en"
    location: Optional[str] = ""


@app.get("/api/status")
def get_status():
    client = get_client()
    is_authenticated = client.auth_type != AuthType.UNAUTHORIZED
    return {
        "status": "online",
        "authenticated": is_authenticated,
        "auth_type": str(client.auth_type),
        "language": current_language,
        "location": current_location,
        "methods_count": len(METHODS_CATALOG),
    }


@app.post("/api/auth")
def configure_auth(req: AuthRequest):
    try:
        init_client(auth=req.auth, language=req.language or "en", location=req.location or "")
        client = get_client()
        return {
            "success": True,
            "authenticated": client.auth_type != AuthType.UNAUTHORIZED,
            "auth_type": str(client.auth_type),
            "message": "Authentication updated successfully.",
        }
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
            },
        )


@app.get("/api/methods")
def get_methods():
    return {
        "count": len(METHODS_CATALOG),
        "methods": METHODS_CATALOG,
        "categories": list(MIXIN_CATEGORIES.keys()),
    }


@app.post("/api/call")
def execute_call(req: CallRequest):
    client = get_client()
    method_name = req.method
    if not hasattr(client, method_name):
        raise HTTPException(status_code=404, detail=f"Method '{method_name}' not found on YTMusic client")

    func = getattr(client, method_name)
    if not callable(func):
        raise HTTPException(status_code=400, detail=f"Attribute '{method_name}' is not callable")

    # Clean and cast arguments
    cleaned_args = {}
    for k, v in req.args.items():
        if v == "" or v is None:
            continue
        # String numbers to int/float if appropriate, handle json lists/dicts
        if isinstance(v, str):
            if v.lower() == "true":
                cleaned_args[k] = True
                continue
            elif v.lower() == "false":
                cleaned_args[k] = False
                continue
            elif v.isdigit():
                cleaned_args[k] = int(v)
                continue
            elif (v.startswith("{") and v.endswith("}")) or (v.startswith("[") and v.endswith("]")):
                try:
                    cleaned_args[k] = json.loads(v)
                    continue
                except Exception:
                    pass
        cleaned_args[k] = v

    start_time = time.time()
    try:
        result = func(**cleaned_args)
        duration_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "success": True,
            "method": method_name,
            "duration_ms": duration_ms,
            "result": result,
        }
    except Exception as e:
        duration_ms = round((time.time() - start_time) * 1000, 2)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "method": method_name,
                "duration_ms": duration_ms,
                "error": str(e),
                "traceback": traceback.format_exc(),
            },
        )


# Convenience API Endpoints for Quick Home/Search/Album/Playlist views
@app.get("/api/home")
def get_home_feed(limit: int = 4):
    client = get_client()
    try:
        feed = client.get_home(limit=limit)
        return {"success": True, "data": feed}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/search")
def search_music(
    query: str = Query(..., min_length=1),
    filter: Optional[str] = Query(None),
    limit: int = 20,
):
    client = get_client()
    try:
        results = client.search(query=query, filter=filter if filter and filter != "all" else None, limit=limit)
        return {"success": True, "query": query, "filter": filter, "data": results}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/suggestions")
def get_suggestions(query: str = Query(..., min_length=1)):
    client = get_client()
    try:
        suggestions = client.get_search_suggestions(query=query)
        return {"success": True, "suggestions": suggestions}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/charts")
def get_charts_data(country: str = "US"):
    client = get_client()
    try:
        charts = client.get_charts(country=country)
        return {"success": True, "data": charts}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/explore")
def get_explore_data():
    client = get_client()
    try:
        explore = client.get_explore()
        return {"success": True, "data": explore}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/mood_categories")
def get_moods():
    client = get_client()
    try:
        moods = client.get_mood_categories()
        return {"success": True, "data": moods}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


# Cache for audio streams: {video_id: {"url": str, "bitrate": float, "format": str, "duration": int, "fetched_at": float}}
stream_cache: Dict[str, Dict[str, Any]] = {}

@app.get("/api/stream/{video_id}")
def get_audio_stream(video_id: str):
    import yt_dlp
    
    # Check cache (valid for 3 hours)
    now = time.time()
    if video_id in stream_cache:
        cached = stream_cache[video_id]
        if now - cached["fetched_at"] < 3 * 3600:
            return {
                "success": True,
                "cached": True,
                "video_id": video_id,
                "stream_url": cached["url"],
                "bitrate": cached.get("bitrate"),
                "format": cached.get("format"),
                "duration": cached.get("duration"),
            }

    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            stream_url = info.get("url")
            if not stream_url:
                raise HTTPException(status_code=404, detail="No direct audio stream found for video")
            
            data = {
                "url": stream_url,
                "bitrate": info.get("abr") or info.get("tbr"),
                "format": info.get("ext") or "webm",
                "duration": info.get("duration"),
                "title": info.get("title"),
                "fetched_at": now,
            }
            stream_cache[video_id] = data

            return {
                "success": True,
                "cached": False,
                "video_id": video_id,
                "stream_url": stream_url,
                "bitrate": data["bitrate"],
                "format": data["format"],
                "duration": data["duration"],
                "title": data["title"],
            }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e), "traceback": traceback.format_exc()}
        )


@app.get("/api/album/{browse_id}")
def get_album_details(browse_id: str):
    client = get_client()
    try:
        album = client.get_album(browseId=browse_id)
        return {"success": True, "data": album}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/playlist/{playlist_id}")
def get_playlist_details(playlist_id: str, limit: int = 50):
    client = get_client()
    try:
        playlist = client.get_playlist(playlistId=playlist_id, limit=limit)
        return {"success": True, "data": playlist}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


# Mount static files
static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
def serve_index():
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "Please ensure static/index.html exists"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting ytmusicapi testing server at http://127.0.0.1:{port} ...")
    uvicorn.run("server:app", host="127.0.0.1", port=port, reload=False)
