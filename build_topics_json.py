# build_topics_json.py — convert topics.csv -> topics.json (same folder)
import csv, json, hashlib, pathlib

CSV_IN   = pathlib.Path(__file__).with_name("topics.csv")
JSON_OUT = pathlib.Path(__file__).with_name("topics.json")

def hash_id(s: str) -> str:
    return "t" + hashlib.sha1(s.encode("utf-8")).hexdigest()[:10]

def main():
    if not CSV_IN.exists():
        raise SystemExit(f"Missing {CSV_IN}")

    text = CSV_IN.read_text(encoding="utf-8")
    # Detect delimiter using header line
    first = next((ln for ln in text.splitlines() if ln.strip()), "")
    delim = "\t" if "\t" in first else ","

    rows = []
    reader = csv.reader(text.splitlines(), delimiter=delim)
    headers = [h.strip() for h in next(reader, [])]

    for r in reader:
        if len(r) < len(headers):
            r = r + [""] * (len(headers) - len(r))
        for i, cell in enumerate(r):
            title = (cell or "").strip()
            if not title:
                continue
            category = headers[i] if i < len(headers) else ""
            _id = hash_id(f"{title}|{category}")
            rows.append({"id": _id, "title": title, "category": category, "done": False})

    JSON_OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} topics to {JSON_OUT}")

if __name__ == "__main__":
    main()
