import csv
import tempfile
import unittest
from pathlib import Path

from scripts.map_csv import geohash5, iter_csv_records


class MapCsvTests(unittest.TestCase):
    def test_geohash_matches_map_client(self):
        self.assertEqual(geohash5(45.4642, 9.19), "u0nd9")
        self.assertEqual(geohash5(41.9028, 12.4964), "sr2yk")

    def test_parking_columns_and_large_id(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bicycle_parkings.csv"
            with path.open("w", newline="", encoding="utf-8") as output:
                writer = csv.DictWriter(output, fieldnames=[
                    "@id", "@lat", "@lon", "covered", "indoor", "access",
                    "fee", "bicycle_parking", "surveillance", "capacity",
                ])
                writer.writeheader()
                writer.writerow({
                    "@id": "14157657299", "@lat": "45.4642", "@lon": "9.19",
                    "covered": "no", "fee": "0.50 EUR", "capacity": "12",
                    "bicycle_parking": "wall_loops",
                })
            record = next(iter_csv_records(path, "bicycle_parkings"))
            self.assertEqual(record["id"], 14157657299)
            self.assertEqual(record["gh5"], "u0nd9")
            self.assertIs(record["covered"], False)
            self.assertIs(record["fee"], True)
            self.assertEqual(record["capacity"], 12)
            self.assertEqual(record["bicycleParking"], "wall_loops")
            self.assertIsNone(record["indoor"])


if __name__ == "__main__":
    unittest.main()
