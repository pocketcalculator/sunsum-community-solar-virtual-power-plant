from abc import ABC, abstractmethod
from typing import Any

import httpx
from azure.identity import DefaultAzureCredential

from app.schemas import ProviderResult, SiteSubmission
from app.settings import Settings


class GeocodingProvider(ABC):
    @abstractmethod
    def geocode(self, site: SiteSubmission) -> ProviderResult: ...


class UnavailableGeocoder(GeocodingProvider):
    def geocode(self, site: SiteSubmission) -> ProviderResult:
        if site.latitude is not None and site.longitude is not None:
            return ProviderResult(
                provider="user_coordinates",
                status="live",
                observations={
                    "resolved": True,
                    "latitude": site.latitude,
                    "longitude": site.longitude,
                },
                provenance={"source": "user_entered", "verification": "not_provider_validated"},
            )
        return ProviderResult(
            provider="geocoding",
            status="not_configured",
            safe_message="Geocoding is not configured; location evidence remains unresolved.",
        )


class AzureMapsGeocoder(GeocodingProvider):
    endpoint = "https://atlas.microsoft.com/geocode"
    api_version = "2026-01-01"

    def __init__(self, settings: Settings):
        self.settings = settings

    def _headers(self) -> dict[str, str]:
        headers = {"Accept-Language": "en-US"}
        if self.settings.azure_maps_key:
            headers["subscription-key"] = self.settings.azure_maps_key
        else:
            credential = DefaultAzureCredential()
            token = credential.get_token("https://atlas.microsoft.com/.default")
            headers["Authorization"] = f"Bearer {token.token}"
            if self.settings.azure_maps_client_id:
                headers["x-ms-client-id"] = self.settings.azure_maps_client_id
        return headers

    def geocode(self, site: SiteSubmission) -> ProviderResult:
        query = ", ".join(
            part for part in (site.street_address, site.city, site.state, site.zip_code) if part
        )
        if not query:
            return ProviderResult(
                provider="azure_maps",
                status="unavailable",
                safe_message="No address was supplied for geocoding.",
            )
        try:
            response = httpx.get(
                self.endpoint,
                params={"api-version": self.api_version, "query": query, "top": 1},
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            features: list[dict[str, Any]] = response.json().get("features", [])
            if not features:
                return ProviderResult(
                    provider="azure_maps",
                    status="unavailable",
                    safe_message="Azure Maps found no location match.",
                    provenance={"api_version": self.api_version},
                )
            feature = features[0]
            longitude, latitude = feature["geometry"]["coordinates"][:2]
            properties = feature.get("properties", {})
            return ProviderResult(
                provider="azure_maps",
                status="live",
                observations={
                    "resolved": True,
                    "latitude": latitude,
                    "longitude": longitude,
                    "formatted_address": properties.get("address", {}).get("formattedAddress"),
                    "confidence": properties.get("confidence"),
                    "match_codes": properties.get("matchCodes", []),
                },
                provenance={
                    "endpoint": self.endpoint,
                    "api_version": self.api_version,
                    "response_type": properties.get("type"),
                },
            )
        except Exception:  # noqa: BLE001 - external auth/HTTP failures become unavailable evidence
            return ProviderResult(
                provider="azure_maps",
                status="unavailable",
                safe_message="Azure Maps is temporarily unavailable; no negative inference was made.",
                provenance={"api_version": self.api_version},
            )


def get_geocoder(settings: Settings) -> GeocodingProvider:
    if settings.azure_maps_key or settings.use_azure_identity:
        return AzureMapsGeocoder(settings)
    return UnavailableGeocoder()