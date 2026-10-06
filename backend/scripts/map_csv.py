"""Convert the OSM CSV exports into records for the map tables."""

import csv
import re


_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
_TRUE = {"yes", "true", "1"}
_FALSE = {"no", "false", "0"}


def geohash5(lat, lng):
    bounds = [[-180.0, 180.0], [-90.0, 90.0]]
    value = 0
    bits = 0
    result = []
    while len(result) < 5:
        axis = bits % 2
        midpoint = sum(bounds[axis]) / 2
        coordinate = lng if axis == 0 else lat
        value = (value << 1) | int(coordinate >= midpoint)
        bounds[axis][int(coordinate >= midpoint) ^ 1] = midpoint
        bits += 1
        if bits % 5 == 0:
            result.append(_BASE32[value])
            value = 0
    return "".join(result)


def _optional(value):
    value = value.strip() if value is not None else ""
    return value or None


def _boolean(value, *, fee=False):
    value = _optional(value)
    if value is None:
        return None
    normalized = value.lower()
    if normalized in _TRUE:
        return True
    if normalized in _FALSE:
        return False
    if fee and re.fullmatch(r"\d+(?:[.,]\d+)?(?:\s*(?:eur|€))?", normalized):
        return True
    return None


def _integer(value):
    value = _optional(value)
    return int(value) if value and value.isdecimal() else None


def iter_csv_records(path, kind):
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as source:
        reader = csv.DictReader(source)
        required = {"@id", "@lat", "@lon"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"{path}: colonne mancanti: {required - set(reader.fieldnames or [])}")

        for line_number, row in enumerate(reader, start=2):
            try:
                record = {
                    "id": int(row["@id"]),
                    "lat": float(row["@lat"]),
                    "lng": float(row["@lon"]),
                }
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{path}:{line_number}: ID o coordinate non validi") from exc

            record["gh5"] = geohash5(record["lat"], record["lng"])
            if kind == "stations":
                record.update(name=_optional(row.get("name")), cap=None, type="fountain")
            elif kind == "toilets":
                record.update(
                    fee=_boolean(row.get("fee"), fee=True),
                    openingHours=_optional(row.get("opening_hours")),
                    changingTable=_boolean(row.get("changing_table")),
                )
            elif kind == "bicycle_repair":
                record.update(
                    name=_optional(row.get("name")),
                    opening_hours=_optional(row.get("opening_hours")),
                    phone=_optional(row.get("phone")),
                )
            elif kind == "bicycle_parkings":
                record.update(
                    covered=_boolean(row.get("covered")),
                    indoor=_boolean(row.get("indoor")),
                    access=_optional(row.get("access")),
                    fee=_boolean(row.get("fee"), fee=True),
                    bicycleParking=_optional(row.get("bicycle_parking")),
                    surveillance=_boolean(row.get("surveillance")),
                    capacity=_integer(row.get("capacity")),
                )
            else:
                raise ValueError(f"Tipo CSV sconosciuto: {kind}")
            yield record
