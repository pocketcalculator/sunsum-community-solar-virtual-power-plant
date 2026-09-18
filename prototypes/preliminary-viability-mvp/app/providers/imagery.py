import base64
import hashlib
import json
from abc import ABC, abstractmethod
from pathlib import Path

from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import AzureOpenAI

from app.schemas import ImageAnalysisResult, ImageObservation
from app.settings import Settings

SYSTEM_PROMPT = """You extract only observable solar-site image characteristics. Return JSON with an
observations array. Allowed keys: visible_surface, possible_usable_surface, trees,
potential_shading, visible_obstructions, roof_complexity, possible_mount_type, image_quality.
Each item has key, value, uncertainty. Never claim structural capacity, ownership, utility
capacity, legal restrictions, exact area, exact dimensions, or a final viability decision."""
DEMO_IMAGE_MANIFEST = Path("data/sample/site_images/manifest.json")


class ImageryProvider(ABC):
    @abstractmethod
    def analyze(self, content: bytes, media_type: str) -> ImageAnalysisResult: ...


class ManualReviewImageryProvider(ImageryProvider):
    def analyze(self, content: bytes, media_type: str) -> ImageAnalysisResult:
        return ImageAnalysisResult(
            provider_status="not_configured",
            observations=[],
            warnings=[
                "AI image analysis is not configured. The image is stored for manual review.",
                "No image observation becomes trusted evidence until a reviewer confirms it.",
            ],
        )


class DemoAwareImageryProvider(ImageryProvider):
    def __init__(self, fallback: ImageryProvider):
        self.fallback = fallback

    def analyze(self, content: bytes, media_type: str) -> ImageAnalysisResult:
        if DEMO_IMAGE_MANIFEST.exists():
            manifest = json.loads(DEMO_IMAGE_MANIFEST.read_text())
            digest = hashlib.sha256(content).hexdigest()
            match = next(
                (image for image in manifest["images"] if image["sha256"] == digest), None
            )
            if match:
                return ImageAnalysisResult(
                    provider_status="simulated",
                    observations=[
                        ImageObservation(**item, source="simulated_demo")
                        for item in match["expected_observations"]
                    ],
                    warnings=[
                        "Known synthetic test image; observations are simulated.",
                        "Image observations do not establish ownership, structural, legal, permitting, or utility facts.",
                    ],
                )
        return self.fallback.analyze(content, media_type)


class AzureOpenAIImageryProvider(ImageryProvider):
    def __init__(self, settings: Settings):
        if not settings.azure_openai_endpoint or not settings.azure_openai_deployment:
            raise ValueError("Azure OpenAI endpoint and deployment are required")
        kwargs = {
            "azure_endpoint": settings.azure_openai_endpoint,
            "api_version": settings.azure_openai_api_version,
        }
        if settings.azure_openai_api_key:
            kwargs["api_key"] = settings.azure_openai_api_key
        else:
            kwargs["azure_ad_token_provider"] = get_bearer_token_provider(
                DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
            )
        self.client = AzureOpenAI(**kwargs)  # type: ignore[arg-type]
        self.deployment = settings.azure_openai_deployment

    def analyze(self, content: bytes, media_type: str) -> ImageAnalysisResult:
        data_url = f"data:{media_type};base64,{base64.b64encode(content).decode('ascii')}"
        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract observable site characteristics."},
                            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                        ],
                    },
                ],
                response_format={"type": "json_object"},
                max_tokens=1000,
            )
            payload = json.loads(response.choices[0].message.content or "{}")
            allowed = {
                "visible_surface", "possible_usable_surface", "trees", "potential_shading",
                "visible_obstructions", "roof_complexity", "possible_mount_type", "image_quality",
            }
            observations = [
                ImageObservation(
                    key=item["key"], value=item.get("value"),
                    uncertainty=str(item.get("uncertainty", "unspecified")), source="azure_openai"
                )
                for item in payload.get("observations", [])
                if item.get("key") in allowed
            ]
            return ImageAnalysisResult(
                provider_status="live",
                observations=observations,
                warnings=["AI observations are untrusted until human confirmation."],
            )
        except Exception:  # noqa: BLE001 - external SDK failures become unavailable evidence
            return ImageAnalysisResult(
                provider_status="unavailable",
                observations=[],
                warnings=["Image analysis is unavailable; no negative inference was made."],
            )


def get_imagery_provider(settings: Settings) -> ImageryProvider:
    if settings.azure_openai_endpoint and settings.azure_openai_deployment:
        fallback = AzureOpenAIImageryProvider(settings)
    else:
        fallback = ManualReviewImageryProvider()
    return DemoAwareImageryProvider(fallback)