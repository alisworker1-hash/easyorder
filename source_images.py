#!/usr/bin/env python3
"""Populate data.json product images from Openverse (CC-licensed, embed-friendly thumbnails).
Re-runnable: only fills items that don't already have an image (pass --force to refresh all)."""
import json, sys, time, urllib.parse, urllib.request, urllib.error

# A curated search query per product → relevant, recognizable photos.
QUERIES = {
    "milk-2pct-gal": "milk gallon jug", "eggs-large-dozen": "egg carton",
    "bread-whole-wheat": "loaf of bread", "bananas-bunch": "bananas bunch",
    "coffee-ground": "ground coffee", "orange-juice": "orange juice carton",
    "butter-unsalted": "butter sticks", "chicken-breast": "raw chicken breast",
    "rice-white-5lb": "bag of white rice", "pasta-spaghetti": "spaghetti pasta box",
    "canned-soup": "canned soup", "apples-bag": "red apples",
    "yogurt-greek": "greek yogurt container", "oatmeal-rolled": "rolled oats",
    "tea-bags": "tea bags", "toilet-paper-12": "toilet paper rolls",
    "paper-towels-6": "paper towel rolls", "dish-soap": "dish soap",
    "laundry-detergent": "laundry detergent bottle", "trash-bags-tall": "trash bags box",
    "all-purpose-cleaner": "spray cleaner bottle", "dishwasher-pods": "dishwasher detergent",
    "aluminum-foil": "aluminum foil", "light-bulbs-led": "led light bulb",
    "hand-soap-refill": "hand soap bottle", "toothpaste-2pk": "toothpaste tube",
    "shampoo": "shampoo bottle", "body-wash": "body wash bottle",
    "toothbrush-soft": "toothbrush", "deodorant": "deodorant stick",
    "denture-cleaner": "dentures", "facial-tissues": "facial tissue",
    "blood-pressure-monitor": "blood pressure monitor", "ibuprofen-200": "ibuprofen tablets bottle",
    "reading-glasses-2": "reading glasses", "pill-organizer": "pill organizer",
    "compression-socks": "compression socks", "multivitamin-50plus": "vitamin supplement bottle",
    "nonslip-bath-mat": "bath mat",
}

def _get(params, tries=3):
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "EasyOrder/1.0 (demo catalog imagery)"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r).get("results") or []
        except urllib.error.HTTPError as e:
            if e.code == 429 and i + 1 < tries:
                time.sleep(3.0); continue
            raise
    return []

def fetch(q):
    # Prefer a direct Flickr CDN image (live.staticflickr.com) — fast and handles a whole grid
    # loading at once. The Openverse thumbnail host throttles under burst (39 imgs stall), so it
    # is only a fallback for the rare item with no Flickr result.
    flick = _get({"q": q, "page_size": 1, "source": "flickr", "mature": "false"})
    if flick:
        u = flick[0].get("url") or ""
        if "staticflickr.com" in u:
            return u
    any_ = _get({"q": q, "page_size": 1, "mature": "false"})
    return (any_[0].get("thumbnail") or any_[0].get("url") or "") if any_ else ""

force = "--force" in sys.argv
data = json.load(open("data.json", encoding="utf-8"))
ok, miss = 0, []
for p in data["products"]:
    if p.get("image") and not force:
        ok += 1; continue
    q = QUERIES.get(p["id"], p["name"])
    try:
        img = fetch(q)
    except Exception as e:
        img = ""; print(f"ERR {p['id']}: {e}", file=sys.stderr)
    if img:
        p["image"] = img; ok += 1
    else:
        miss.append(p["id"])
    time.sleep(0.8)

json.dump(data, open("data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"images set: {ok}/{len(data['products'])}")
if miss:
    print("missing (emoji fallback):", ", ".join(miss))
