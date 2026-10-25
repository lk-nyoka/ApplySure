from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid5

from . import rules

_NAMESPACE = UUID("6f1c2d7e-3b4a-4c58-9a10-5d2e8f0b7a11")

# The vocabulary a curator can use in stored requirement data: rule type name -> rule class.
RULE_TYPES = {
    "max_age": rules.MaxAge,
    "not_expired": rules.NotExpired,
    "valid_id_number": rules.ValidIdNumber,
    "id_matches_profile": rules.IdMatchesProfile,
    "name_matches_profile": rules.NameMatchesProfile,
    "address_matches_profile": rules.AddressMatchesProfile,
    "min_number": rules.MinNumber,
    "max_number": rules.MaxNumber,
    "field_equals": rules.FieldEquals,
}


@dataclass(frozen=True)
class Requirement:
    """One thing to check. `rule` None means the document itself must be present."""

    id: UUID
    document_type: str
    label: str
    rule: object | None = None
    rule_params: dict[str, Any] | None = None
    source_reference: str | None = None

    @property
    def rule_key(self) -> str:
        return "present" if self.rule is None else self.rule.key


@dataclass(frozen=True)
class RequirementSet:
    version: str
    requirements: tuple[Requirement, ...]


def build_rule(spec: dict[str, Any]) -> object:
    try:
        return RULE_TYPES[spec["type"]](**spec.get("params", {}))
    except (KeyError, TypeError) as exc:
        raise ValueError(f"Invalid rule specification: {spec!r}") from exc


def requirement_set_from_spec(spec: dict[str, Any], source_reference: str | None) -> RequirementSet:
    """Build a requirement set from stored data. Raises ValueError on anything unrecognised (fail closed)."""
    version = spec["version"]
    items = []
    for document in spec["documents"]:
        document_type, label = document["document_type"], document["label"]
        entries: list[tuple[object | None, dict[str, Any] | None]] = [(None, None)]
        entries += [(build_rule(r), r.get("params")) for r in document.get("rules", [])]
        for index, (rule, params) in enumerate(entries):
            # Stable IDs per (version, document, position) so a published version never changes identity.
            requirement_id = uuid5(_NAMESPACE, f"{version}:{document_type}:{index}")
            items.append(Requirement(requirement_id, document_type, label, rule, params, source_reference))
    return RequirementSet(version, tuple(items))
