"""
cloudinary_upload.py

Photo storage on Cloudinary instead of backupbox's local disk - Tailscale-only
local storage meant photos were never reachable from the public internet
(blocking the "Item photo URL" column in the eBay CSV export), and raw phone
photos (several MB each) would blow through Cloudinary's free-tier storage
in a few hundred uploads.

Every upload is resized/recompressed locally first (free - just CPU) before
it ever leaves the machine, which is what actually makes the free tier
viable: a downscaled ~150-400KB JPEG instead of a 3-8MB camera original.

Requires CLOUDINARY_URL set in the environment (cloudinary://key:secret@cloud
- from the Cloudinary dashboard's "API Environment variable" display). The
SDK auto-configures from that on import, no explicit cloudinary.config() call
needed.
"""

import io

import cloudinary
import cloudinary.uploader
from PIL import Image

FOLDER = "zamak_ledger"
MAX_DIMENSION = 1600  # plenty to read card text/casting details - not print quality
JPEG_QUALITY = 85


def resize_for_upload(raw_bytes: bytes) -> bytes:
    """Downscale to MAX_DIMENSION on the long edge and re-encode as JPEG.
    Skips the resize (but still re-encodes, for consistent compression) if
    the image is already smaller. Flattens transparency onto white - photos
    of physical cards/cars have no meaningful alpha channel, and JPEG has
    none anyway."""
    img = Image.open(io.BytesIO(raw_bytes))
    img = img.convert("RGB") if img.mode not in ("RGB", "L") else img

    width, height = img.size
    longest = max(width, height)
    if longest > MAX_DIMENSION:
        scale = MAX_DIMENSION / longest
        img = img.resize((round(width * scale), round(height * scale)), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def upload_photo(raw_bytes: bytes) -> str:
    """Resizes then uploads to Cloudinary, returns the public_id (what gets
    stored in the DB - not the full URL, so the delivery URL's transformation
    params can change later without touching stored data)."""
    resized = resize_for_upload(raw_bytes)
    result = cloudinary.uploader.upload(resized, folder=FOLDER, resource_type="image")
    return result["public_id"]


def duplicate_photo(public_id: str) -> str:
    """Server-side copy (upload-by-URL, no bytes round-tripped through us) -
    for split, where the new row needs its own independent asset so deleting
    or replacing a photo on either row doesn't destroy the other's."""
    source_url = cloudinary.CloudinaryImage(public_id).build_url()
    result = cloudinary.uploader.upload(source_url, folder=FOLDER, resource_type="image")
    return result["public_id"]


def delete_photo_asset(public_id: str) -> None:
    cloudinary.uploader.destroy(public_id, resource_type="image")


def cloudinary_delivery_url(public_id: str, width: int = 1200) -> str:
    """Not currently used server-side (the frontend builds its own delivery
    URLs from the public_id directly), kept here so the transformation
    parameters live in one place if a server-rendered use ever needs them."""
    return cloudinary.CloudinaryImage(public_id).build_url(
        width=width, crop="limit", quality="auto", fetch_format="auto"
    )
