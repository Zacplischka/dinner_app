#!/usr/bin/env python3
"""#318's structural layer, binary. Usage: structural_gate.py <records-dir> [slug]
Checks every records/<slug>/recipe.json (or one). Exit 0 all pass, 1 otherwise."""
import json, re, sys
from pathlib import Path

KNOWN_UNITS = {"g", "kg", "ml", "l", "tsp", "tbsp", "cup", ""}
MEAL_TYPES = {"main course", "side dish", "dessert", "appetizer", "salad", "soup", "breakfast", "snack"}
CUISINES = {"african", "american", "british", "cajun", "caribbean", "chinese", "french", "german",
            "greek", "indian", "italian", "japanese", "korean", "latin american", "mediterranean",
            "mexican", "middle eastern", "nordic", "spanish", "thai", "vietnamese", "modern australian"}
DIETS = {"gluten free", "ketogenic", "vegetarian", "vegan", "pescetarian", "paleo"}
FREEBIES = {"salt", "pepper", "water", "olive oil", "oil"}  # staples usable in steps unlisted

def us_terms(repo_root):
    src = (repo_root / "backend/src/services/usToAuTerms.ts").read_text()
    return [k for k, v in re.findall(r"'([^']+)':\s*'([^']+)'", src)]

def check(recipe, titles, us_side):
    errs = []
    r = recipe
    if not re.fullmatch(r"owned:[a-z0-9-]+", r.get("placeId", "")): errs.append("placeId not owned:<slug>")
    if not isinstance(r.get("servings"), int) or r["servings"] < 1: errs.append("servings missing")
    if r.get("mealType") not in MEAL_TYPES: errs.append(f"bad mealType {r.get('mealType')}")
    if r.get("cuisine") is not None and r["cuisine"] not in CUISINES: errs.append(f"bad cuisine {r.get('cuisine')}")
    diets = set(r.get("diets", []))
    if not diets <= DIETS: errs.append(f"unknown diets {diets - DIETS}")
    if "vegan" in diets and "vegetarian" not in diets: errs.append("vegan must declare vegetarian (ladder)")
    if "vegetarian" in diets and "pescetarian" in diets: pass  # pescetarian implied server-side, not required
    title = r.get("title", "")
    if not title: errs.append("no title")
    if title.lower() in titles: errs.append(f"duplicate title {title}")
    steps_text = " ".join(r.get("steps", [])).lower()
    if not r.get("steps"): errs.append("no steps")
    ings = r.get("extendedIngredients", [])
    if not ings: errs.append("no ingredients")
    for ing in ings:
        name, unit, amt = ing.get("name", ""), ing.get("unit", None), ing.get("amount", None)
        if unit not in KNOWN_UNITS: errs.append(f"unknown unit '{unit}' on {name}")
        if not isinstance(amt, (int, float)) or amt <= 0: errs.append(f"unparseable amount on {name}")
        # every ingredient referenced in some step (match on any word ≥4 chars of the name)
        toks = [t for t in re.findall(r"[a-z]+", name.lower()) if len(t) >= 4]
        if toks and not any(t in steps_text or t.rstrip("s") in steps_text for t in toks):
            errs.append(f"ingredient '{name}' never referenced in steps")
        for us in us_side:
            if re.search(rf"\b{re.escape(us)}\b", name.lower()) or re.search(rf"\b{re.escape(us)}\b", ing.get("original", "").lower()):
                errs.append(f"US term '{us}' in ingredient '{name}' (AU lint)")
    return errs

if __name__ == "__main__":
    base = Path(sys.argv[1])
    only = sys.argv[2] if len(sys.argv) > 2 else None
    repo_root = base.resolve().parents[2]  # docs/prototypes/corpus-pipeline -> repo
    US_SIDE = us_terms(repo_root)
    titles, failed = set(), 0
    paths = sorted(base.glob(f"records/{only or '*'}/recipe.json"))
    if not paths: print("no recipes found"); sys.exit(1)
    for p in paths:
        r = json.loads(p.read_text())
        errs = check(r, titles, US_SIDE)
        titles.add(r.get("title", "").lower())
        status = "PASS" if not errs else "FAIL: " + "; ".join(errs)
        print(f"{p.parent.name}: {status}")
        failed += bool(errs)
    print(f"\n{len(paths) - failed}/{len(paths)} pass structural")
    sys.exit(1 if failed else 0)
