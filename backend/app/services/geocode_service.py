"""Geocoding via Photon (https://photon.komoot.io), OSM-based.

Photon converte un indirizzo testuale in coordinate (lat/lon). Non fornisce
tile: la mappa lato frontend usa Leaflet + tile OSM.
"""
import logging

import httpx

logger = logging.getLogger(__name__)

PHOTON_URL = "https://photon.komoot.io/api/"


def geocode(query: str) -> tuple[float, float] | None:
    """Risolve un indirizzo in (latitudine, longitudine). None se non trovato o errore."""
    query = (query or "").strip()
    if not query:
        return None
    try:
        r = httpx.get(
            PHOTON_URL,
            params={"q": query, "limit": 1, "lang": "it"},
            timeout=5.0,
            headers={"User-Agent": "EurospitalEventi/1.0"},
        )
        r.raise_for_status()
        features = r.json().get("features", [])
        if not features:
            return None
        lon, lat = features[0]["geometry"]["coordinates"]
        return float(lat), float(lon)
    except Exception as exc:  # rete/parsing: non bloccare il salvataggio evento
        logger.warning("geocode fallito per %r: %s", query, exc)
        return None
