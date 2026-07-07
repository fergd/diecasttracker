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

CARDED_PROMPT = """You are looking at photo(s) of a carded (packaged) Hot Wheels or \
Matchbox diecast car. Read the text printed on the card and extract the following \
fields as JSON only - no preamble, no markdown fences, just the raw JSON object:

{
  "packaging_type": "carded",
  "brand": "Hot Wheels" or "Matchbox" or other diecast brand,
  "car_make": the REAL-WORLD vehicle manufacturer the casting represents (e.g.
              "Chevrolet", "Ford", "Nissan", "Volkswagen") - distinct from "brand"
              above, which is the collectible line (Hot Wheels/Matchbox), not the
              car itself. Read this from the casting name if it names a real make
              (e.g. "Custom '72 Chevy Luv" -> "Chevrolet"), or from any licensed-
              manufacturer text/logo on the card. null if the casting is a fully
              custom/fictional Hot Wheels design with no real-world make,
  "casting_name": the car's model/casting name as printed on the card, usually in a
                   stylized logo/wordmark box on the card FRONT (e.g. "LIMOZEEN",
                   "PORSCHE CARRERA"),
  "collector_number": the STANDALONE yearly mainline number, e.g. "542" or "967" -
                       this is the car's overall position out of that year's full
                       lineup (roughly 250 cars/year), NOT a fraction. Usually
                       printed on the card BACK, often near the barcode/proof-of-
                       purchase area, labeled "COLLECTOR #" or just shown as a bare
                       number in a box. Hot Wheels dropped this numbering in the
                       2000s, so it's frequently absent on newer cards - use null
                       rather than confusing it with series_number below, which
                       looks similar but counts something completely different.
  "series_number": the position WITHIN the named series/segment given in "series"
                    below, e.g. "2/4" or "2 OF 4" - printed on the card FRONT,
                    directly below or beside the series name banner (e.g. "BIFF!
                    BAM! BOOM! SERIES" with "#2 OF 4 CARS" right next to it). This
                    is a completely different number from collector_number above:
                    a card can show BOTH simultaneously (a 3-digit yearly number on
                    the back AND a small "X of Y" fraction on the front) since one
                    counts the year's full lineup and the other counts only this
                    specific themed sub-series. Transcribe exactly as printed
                    (e.g. "2/4", "2 OF 4"). null if no series position is shown,
  "sku": the manufacturer's item/Toy # code - a short alphanumeric code (e.g. "CFH06",
         "N9637", "DVK33", "X1786", often followed by a dash and a longer suffix like
         "-D9B0A" or "-09A0C"). Almost always on the BACK of the card. CRITICAL location
         on most modern (roughly 2010s-present) cards: printed on the small die-cut
         HANG-TAB itself, at the very TOP of the card, above the main hang-hole -
         usually right next to a tiny "Pp" plastics-recycling code and near the brand
         logo corner. This tab is easy to crop out of a back-of-card photo if the photo
         doesn't include the very top edge - if the code isn't found elsewhere, check
         this tab specifically before giving up. Other cards instead put it vertically
         or in small print near a different die-cut notch on the side, or occasionally
         on the front. Sometimes also appears on the back as a shorter reference (e.g.
         a "Text X1786 to ____" promotional line) - that shorter form is the same short
         code, use it to confirm but prefer the FULL suffixed version from the hang-tab
         if both are visible. This is a much more reliable identifier than the casting
         name (exact, not fuzzy) - read it carefully if a back-of-card photo was
         provided. null if not visible in any provided photo,
  "sku_full_code": the longer code alongside the short one, with a dash suffix (e.g.
                    "T9710-09AOQ", "X1786-09A0C") - usually on the same hang-tab as
                    "sku" above. That suffix is usually a batch/assortment code
                    specific to that individual case, not part of the casting's
                    identity. Transcribe the FULL string here if a suffixed code is
                    visible, else null. (The "sku" field above should
                    still just be the short primary code, e.g. "T9710" from that example.)
  "series": the named series/theme printed on the card (e.g. "HW Hot Trucks", "Biff!
             Bam! Boom! Series") - series_number above is this car's position within
             whatever series name you put here,
  "release_year": the year if visible (from a "NEW FOR ____" flag or copyright date),
  "color": brief description of the car's visible color/deco,
  "treasure_hunt": "TH" if this is a regular Treasure Hunt, "Super TH" if a Super
                     Treasure Hunt, else null. Look for the actual Treasure Hunt LOGO
                     (a small green flame/checkered-flag icon, sometimes with "TH"
                     lettering) printed on the card - don't rely on the words
                     "Treasure Hunt" being spelled out somewhere, some cards only
                     show the logo. Super Treasure Hunts additionally almost always
                     have real rubber tires (not hard plastic) and "Spectraflame"
                     metallic/candy paint, visible even through the blister if the
                     car itself is checked closely - if you see rubber tires AND
                     spectraflame paint but aren't sure about the logo, it's more
                     likely "Super TH" than plain "TH". If genuinely uncertain
                     whether ANY Treasure Hunt marking is present, use null rather
                     than guessing,
  "wheel_type": "Redline" (red-striped tires, only on 1968-77 vintage cars),
                 "Real Riders" (rubber tires with visible tread detail, used on
                 Premium lines and Super Treasure Hunts), "Basic Wheels" (standard
                 hard plastic, the vast majority of mainline releases), "Chrome"
                 (shiny chrome-look wheels, e.g. Ultra Hots line), or "Other" if
                 visible but doesn't fit those categories. A major collector value
                 driver, second only to Treasure Hunt status - look closely at the
                 wheel material/finish even through the blister. null if the wheels
                 aren't clearly visible in any provided photo,
  "special_flags": array of any of: "New Casting", "Zamac" (unpainted bare-metal
                    finish), "Chase" (Premium-line Super-TH-equivalent, often
                    numbered like "0/5"), "Store Exclusive", if visible (Treasure
                    Hunt status goes in the dedicated "treasure_hunt" field above,
                    not here),
  "card_condition_notes": brief, cautious note on visible card condition (creases,
                           bubble integrity) - flag as "unable to assess" if unclear,
  "extraction_confidence": your own rough confidence 0.0-1.0 that the casting_name,
                            collector_number, and series_number were read correctly
                            (not guessed)
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
  "car_make": the REAL-WORLD vehicle manufacturer the casting represents (e.g.
              "Chevrolet", "Ford", "Nissan") - distinct from "brand" above (the
              collectible line). Infer from the casting name if it names a real
              make, or from body styling if recognizable. null if this is a fully
              custom/fictional design or can't be determined,
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
  "base_country": the country of manufacture stamped on the base (e.g. "Malaysia",
                    "Thailand", "China", "Indonesia", "Vietnam") - a real collector
                    value driver since casting/base variants differ in scarcity by
                    country. Extract just the country name cleanly (not the full
                    stamp text). null if no base photo was given or the country
                    isn't legible - do not guess,
  "color": description of the car's color/deco,
  "wheel_type": "Redline" (red-striped tires, only on 1968-77 vintage cars),
                 "Real Riders" (rubber tires with visible tread detail, used on
                 Premium lines and Super Treasure Hunts), "Basic Wheels" (standard
                 hard plastic, the vast majority of mainline releases), "Chrome"
                 (shiny chrome-look wheels), or "Other" if visible but doesn't fit
                 those categories. A major collector value driver and also a useful
                 dating clue. null if not clearly visible,
  "body_base_construction": "Metal/Metal" if BOTH the body and the base/chassis
                              underneath are metal, "Metal/Plastic" if the body is
                              metal but the base is plastic (the most common modern
                              configuration), "All-Plastic" if neither is metal.
                              Assess from the base photo if provided - tap/visual
                              cues: metal bases are typically a distinct silver/gray
                              cast-metal color and rigid, plastic bases usually show
                              injection-molding seams and a duller, warmer-toned
                              plastic. null if no base photo was given or genuinely
                              unclear,
  "treasure_hunt": "TH" if this is a regular Treasure Hunt, "Super TH" if a Super
                     Treasure Hunt, else null. No card to check a logo on for a
                     loose car, so this comes from the base stamp text (if it
                     mentions Treasure Hunt) or from the physical features Super
                     Treasure Hunts almost always have: real rubber tires (not hard
                     plastic) plus "Spectraflame" metallic/candy paint. If you see
                     both of those together, it's likely "Super TH" even without
                     stamp confirmation. If genuinely uncertain, use null rather
                     than guessing,
  "identification_method": "base_stamp" if read from base text, "visual_only" if
                             no base photo/text was available,
  "special_flags": array of any of: "New Casting", "Zamac" (unpainted bare-metal
                    finish), "Chase" (Premium-line Super-TH-equivalent), "Store
                    Exclusive", if determinable from the base stamp text or visible
                    finish (Treasure Hunt status goes in the dedicated
                    "treasure_hunt" field above, not here),
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
    base_image_path: an optional second photo. For loose cars, the underside/base,
                      where casting name + copyright year are usually stamped -
                      strongly recommended; identification without it falls back to
                      visual-only guessing (see prompt). For carded cars, the BACK of
                      the card, which usually carries the sku/Toy # code - optional,
                      but a much more reliable identifier than the printed casting
                      name alone.

    Raises RuntimeError with a clean, user-facing message on API failure (bad key,
    no credits, rate limit, etc) - callers (app.py) turn this into a proper JSON
    error response instead of a raw 500 with a stack trace as the body.
    """
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    content = [_load_image_block(image_path)]
    if base_image_path:
        content.append(_load_image_block(base_image_path))

    prompt = LOOSE_PROMPT if packaging_type == "loose" else CARDED_PROMPT
    content.append({"type": "text", "text": prompt})

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.APIStatusError as e:
        # e.g. "Your credit balance is too low to access the Anthropic API."
        detail = e.message
        try:
            detail = e.body.get("error", {}).get("message", e.message)
        except (AttributeError, TypeError):
            pass
        raise RuntimeError(f"Claude API error ({e.status_code}): {detail}") from e
    except anthropic.APIConnectionError as e:
        raise RuntimeError("Couldn't reach the Claude API - check backupbox's internet connection.") from e

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
            "series_number": None,
            "sku": None, "sku_full_code": None,
            "series": None, "release_year": None, "color": None,
            "treasure_hunt": None, "wheel_type": None,
            "special_flags": [], "card_condition_notes": None,
            "extraction_confidence": 0.0,
            "_parse_error": True, "_raw_response": raw_text,
        }
