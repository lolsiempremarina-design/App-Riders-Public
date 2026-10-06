"""Structural checks for an Italian personal tax ID (codice fiscale)."""

import re
import unicodedata


MONTH_CODES = "ABCDEHLMPRST"
OMOCODIA_TO_DIGIT = dict(zip("LMNPQRSTUV", "0123456789"))
NUMERIC_POSITIONS = (6, 7, 9, 10, 12, 13, 14)
TAX_ID_PATTERN = re.compile(
    r"^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]"
    r"[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$"
)
# Latin letters that NFKD does not reduce to A-Z. Before, a name with one of them (Łukasz, Øyvind, Ægir...) was
# refused with "use Latin letters", even with the tax code typed by hand. Same table as LATIN_TRANSLITERATION in
# FrontendReact/src/utils/fiscalCodeUtils.js; tests/data/fiscal_codes.json is checked by the tests of both sides.
TRANSLITERATION = str.maketrans({
    "Ł": "L", "ł": "L", "Đ": "D", "đ": "D", "Ð": "D", "ð": "D", "Ø": "O", "ø": "O", "Æ": "AE", "æ": "AE",
    "Œ": "OE", "œ": "OE", "Þ": "TH", "þ": "TH", "ß": "SS", "ẞ": "SS", "ı": "I", "Ħ": "H", "ħ": "H",
    "Ŧ": "T", "ŧ": "T", "Ŀ": "L", "ŀ": "L",
})
ODD_VALUES = {
    **dict(zip("0123456789", (1, 0, 5, 7, 9, 13, 15, 17, 19, 21))),
    **dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (
        1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6,
        8, 12, 14, 16, 10, 22, 25, 24, 23,
    ))),
}


def _name_letters(value):
    normalized = unicodedata.normalize("NFKD", value.translate(TRANSLITERATION)).upper()
    letters = []
    for char in normalized:
        if "A" <= char <= "Z":
            letters.append(char)
        elif unicodedata.combining(char) or char.isspace() or char in "'-’":
            continue
        else:
            return None
    return "".join(letters) or None


def _name_code(value, *, given_name=False):
    letters = _name_letters(value)
    if not letters:
        return None
    consonants = "".join(char for char in letters if char not in "AEIOU")
    vowels = "".join(char for char in letters if char in "AEIOU")
    if given_name and len(consonants) >= 4:
        return consonants[0] + consonants[2] + consonants[3]
    return (consonants + vowels + "XXX")[:3]


def _check_character(first_fifteen):
    total = 0
    for index, char in enumerate(first_fifteen):
        if index % 2 == 0:
            total += ODD_VALUES[char]
        else:
            total += int(char) if char.isdigit() else ord(char) - ord("A")
    return chr(ord("A") + total % 26)


def validate_personal_tax_id(code, first_name, last_name, date_of_birth, gender):
    """Return a user-facing error, or None when the encoded details match."""
    if not TAX_ID_PATTERN.fullmatch(code):
        return "Invalid tax ID code format."
    if _check_character(code[:15]) != code[15]:
        return "Invalid tax ID code check character."

    decoded = list(code)
    for index in NUMERIC_POSITIONS:
        decoded[index] = OMOCODIA_TO_DIGIT.get(decoded[index], decoded[index])
    decoded = "".join(decoded)

    if not _name_letters(first_name) or not _name_letters(last_name):
        return "Enter first and last names using Latin letters."
    if decoded[:3] != _name_code(last_name) or decoded[3:6] != _name_code(first_name, given_name=True):
        return "The tax ID code does not match the first and last names."

    expected_date = (
        f"{date_of_birth.year % 100:02d}"
        f"{MONTH_CODES[date_of_birth.month - 1]}"
        f"{date_of_birth.day + (40 if gender == 'F' else 0):02d}"
    )
    if decoded[6:11] != expected_date:
        return "The tax ID code does not match the birth date or gender."
    return None


def split_legacy_full_name(full_name, code):
    """Infer a split only when the tax ID selects one unambiguous option."""
    parts = full_name.split()
    if len(parts) < 2 or not code or len(code) < 6:
        return None

    matches = set()
    for index in range(1, len(parts)):
        left = " ".join(parts[:index])
        right = " ".join(parts[index:])
        for first_name, last_name in ((left, right), (right, left)):
            if (
                _name_code(last_name) == code[:3].upper()
                and _name_code(first_name, given_name=True) == code[3:6].upper()
            ):
                matches.add((first_name, last_name))
    return next(iter(matches)) if len(matches) == 1 else None
