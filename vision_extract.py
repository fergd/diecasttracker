"""
vision_extract.py

Sends a card photo to Claude for structured extraction. This is the
"propose" half of the propose/confirm pipeline - match.py is the "confirm"
half.

Requires ANTHROPIC_API_KEY set in the environment on whatever machine
actually runs this (your backupbox), not committed to source control.
"""

import base64
import json
import os

import anthropic

MODEL = "claude-haiku-4-5-20251001"  # cheap, fast, well-suited to extraction

CARDED_PROMPT = """You are looking at a photo of a carded (packaged) Hot Wheels or \
Matchbox diecast car. Read the text printed on the card and extract the following \
fields as JSON only - no preamble, no markdown fences, just the raw JSON object:

{
  "packaging_type": "carded",
  "brand": "Hot Wheels" or "Matchbox" or other diecast brand,
  "casting_name": the car's model/casting name as printed on the card,
  "collector_number": the number printed on the card (may be a fraction like "8/10"
                       for a series position, or a standalone number like "148" for
                       a year collector number - transcribe exactly as printed),
  "series": the named series/theme printed on the card (e.g. "HW Hot Trucks"),
  "release_year": the year if visible (from a "NEW FOR ____" flag or copyright date),
  "color": brief description of the car's visible color/deco,
  "special_flags": array of any of: "Treasure Hunt", "Super Treasure Hunt", "New Casting",
                    "Zamac", or store-exclusive labels, if visible,
  "card_condition_notes": brief, cautious note on visible card condition (creases,
                           bubble integrity) - flag as "unable to assess" if unclear,
  "extraction_confidence": your own rough confidence 0.0-1.0 that the casting_name
                            and collector_number were read correctly (not guessed)
}

If a field isn't visible or legible, use null rather than guessing. Do not invent
information that isn't printed on the card."""

LOOSE_PROMPT = """You are looking at photo(s) of a LOOSE (unpackaged) Hot Wheels or \
Matchbox diecast car. There is no card to read text from, so identification has to \
come from two places: the car's body shape/color/deco, and - if a base/underside \
photo is provided - text stamped into the metal base, which usually carries the \
casting name and a copyright year (note: the copyright year is often the design \
year, typically one year before the car's actual first release, not the release \
year itself).

Extract the following fields as JSON only - no preamble, no markdown fences, just \
the raw JSON object:

{
  "packaging_type": "loose",
  "brand": "Hot Wheels" or "Matchbox" or other diecast brand if identifiable from
            base markings (e.g. "MATTEL" + country of manufacture is a Hot Wheels
            signal), else your best guess with lower confidence,
  "casting_name": the car's model/casting name - read from the base stamp if a base
                   photo was provided and text is legible, otherwise your best visual
                   identification based on body shape/proportions/distinguishing
                   features (grille, wheel wells, spoiler, etc) - be honest that this
                   is a visual guess if no base text was available,
  "base_stamp_text": verbatim text read from the base photo, if provided (casting
                       name, copyright year, country of manufacture, any casting
                       codes) - null if no base photo was given or text is illegible,
  "copyright_year_on_base": the year stamped on the base, if visible (note in
                              extraction_confidence notes that this may differ from
                              actual release year),
  "color": description of the car's color/deco/wheel type - wheel type (5-spoke,
            redline, real riders, etc) is often a useful identifying/dating clue,
  "identification_method": "base_stamp" if read from base text, "visual_only" if
                             no base photo/text was available,
  "extraction_confidence": your own rough confidence 0.0-1.0 - should be notably
                            LOWER for visual_only identification than for a clearly
                            legible base stamp, since casting names can't reliably
                            be guessed from appearance alone across 28,000+ castings
}

If a field isn't visible or legible, use null rather than guessing. Do not invent
information you can't actually see."""


def _load_image_block(image_path: str) -> dict:
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")
    media_type = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": image_data},
    }


def extract_card_details(image_path: str, packaging_type: str = "carded",
                          base_image_path: str | None = None) -> dict:
    """
    packaging_type: 'carded' or 'loose'. Determines which prompt/schema is used.
    base_image_path: for loose cars only - an optional second photo of the car's
                      underside, where casting name + copyright year are usually
                      stamped. Strongly recommended for loose cars; identification
                      without it falls back to visual-only guessing (see prompt).
    """
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    content = [_load_image_block(image_path)]
    if packaging_type == "loose" and base_image_path:
        content.append(_load_image_block(base_image_path))

    prompt = LOOSE_PROMPT if packaging_type == "loose" else CARDED_PROMPT
    content.append({"type": "text", "text": prompt})

    response = client.messages.create(
        model=MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": content}],
    )

    raw_text = response.content[0].text.strip()
    # Defensive cleanup in case the model wraps the JSON in fences despite instructions
    raw_text = raw_text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        result = json.loads(raw_text)
        result.setdefault("packaging_type", packaging_type)
        return result
    except json.JSONDecodeError:
        return {
            "packaging_type": packaging_type,
            "brand": None, "casting_name": None, "collector_number": None,
            "series": None, "release_year": None, "color": None,
            "special_flags": [], "card_condition_notes": None,
            "extraction_confidence": 0.0,
            "_parse_error": True, "_raw_response": raw_text,
        }
