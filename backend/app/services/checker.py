from datetime import date
from uuid import UUID, uuid4

from ..models import AffectedReference, ApplicationCheck, CheckFinding, CheckResultStatus
from .requirements import Requirement, RequirementSet
from .rules import ApplicantProfile, ExtractedDocument


def _finding(requirement: Requirement, result: CheckResultStatus, explanation: str, fix: str | None) -> CheckFinding:
    return CheckFinding(
        requirement_id=requirement.id,
        result=result,
        affected=AffectedReference(kind="document", identifier=requirement.document_type),
        explanation=f"{requirement.label}: {explanation}",
        suggested_fix=fix,
        source_reference=requirement.source_reference,
    )


def run_check(
    requirements: RequirementSet,
    documents: list[ExtractedDocument],
    profile: ApplicantProfile,
    application_id: UUID,
    today: date,
    demo_fixture: bool = False,
) -> ApplicationCheck:
    by_type = {doc.document_type: doc for doc in documents}
    findings = []
    for requirement in requirements.requirements:
        doc = by_type.get(requirement.document_type)
        if requirement.rule is None:
            if doc is None:
                findings.append(_finding(requirement, CheckResultStatus.failed, "not provided.", "Upload this document."))
            else:
                findings.append(_finding(requirement, CheckResultStatus.passed, "provided.", None))
        elif doc is not None:  # rules on an absent document are not reported twice
            outcome = requirement.rule.evaluate(doc, profile, today)
            findings.append(_finding(requirement, outcome.result, outcome.explanation, outcome.suggested_fix))
    return ApplicationCheck(
        check_id=uuid4(),
        application_id=application_id,
        requirement_version=requirements.version,
        findings=findings,
        demo_fixture=demo_fixture,
    )
