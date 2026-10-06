"""Import map points from scripts/data into the database, without duplicating IDs."""

from pathlib import Path

from app import create_app
from app.map.models import BicycleParking, BicycleRepair, Station, Toilet
from extensions import db
from scripts.map_csv import iter_csv_records


DATA_DIR = Path(__file__).resolve().parent / "data"
BATCH_SIZE = 1000
SOURCES = (
    ("stations", Station),
    ("toilets", Toilet),
    ("bicycle_repair", BicycleRepair),
    ("bicycle_parkings", BicycleParking),
)


def import_csv_to_model(path, kind, model):
    existing_ids = {row[0] for row in db.session.query(model.id)}
    batch = []
    imported = 0
    for record in iter_csv_records(path, kind):
        if record["id"] in existing_ids:
            continue
        existing_ids.add(record["id"])
        batch.append(record)
        if len(batch) >= BATCH_SIZE:
            db.session.bulk_insert_mappings(model, batch)
            imported += len(batch)
            batch.clear()
    if batch:
        db.session.bulk_insert_mappings(model, batch)
        imported += len(batch)
    db.session.commit()
    print(f"{kind}: {imported} nuovi record")

def import_data():
    app = create_app()
    with app.app_context():
        db.create_all()
        for kind, model in SOURCES:
            try:
                import_csv_to_model(DATA_DIR / f"{kind}.csv", kind, model)
            except Exception:
                db.session.rollback()
                raise
    print("Importazione completata.")

if __name__ == "__main__":
    import_data()
