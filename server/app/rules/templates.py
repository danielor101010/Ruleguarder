"""Ready-made rules: the "Add from template" picker and the "Load Sample Rules" button.

This list is the single source of truth - the client only renders what GET /api/rules/templates
returns. Params are validated (and defaults filled in) at import time, so a broken template
fails on startup instead of when a user picks it.
"""

from typing import Any

from ..schemas import RuleCreate, RuleTemplate, Severity, TemplateCategory
from .engine import validate_rule_params


def _template(
    template_id: str,
    category: TemplateCategory,
    name: str,
    description: str,
    rule_type: str,
    params: dict[str, Any],
    severity: Severity,
    *,
    in_sample_set: bool = False,
    enabled: bool = True,
) -> RuleTemplate:
    return RuleTemplate(
        id=template_id,
        label=name,
        description=description,
        category=category,
        in_sample_set=in_sample_set,
        rule=RuleCreate(
            name=name,
            description=description,
            type=rule_type,
            params=validate_rule_params(rule_type, params),
            severity=severity,
            enabled=enabled,
        ),
    )


RULE_TEMPLATES: list[RuleTemplate] = [
    # ---------- sample set ----------
    _template(
        "pii-all",
        "privacy",
        "No personal data (PII)",
        "Flags social security numbers, phone numbers, email addresses and credit card numbers.",
        "pii",
        {"categories": ["ssn", "phone", "email", "credit_card"]},
        "high",
        in_sample_set=True,
    ),
    _template(
        "classification-markings",
        "security",
        "No classification markings",
        "Flags the markings TOP SECRET, CONFIDENTIAL and RESTRICTED (upper case, as markings are written).",
        "forbidden_text",
        {"pattern": r"\b(TOP SECRET|CONFIDENTIAL|RESTRICTED)\b", "is_regex": True, "case_sensitive": True},
        "high",
        in_sample_set=True,
    ),
    _template(
        "acronym-definitions",
        "style",
        "Define acronyms at first use",
        'Every acronym must be written out at its first use, as "Full Name (ABC)" or "ABC (Full Name)".',
        "acronym_definitions",
        {},
        "low",
        in_sample_set=True,
    ),
    _template(
        "cross-references",
        "structure",
        "No broken cross-references",
        'References such as "Section 3.2", "Figure 4" or "Table 2" must point at an existing target.',
        "cross_references",
        {"kinds": ["section", "figure", "table"]},
        "medium",
        in_sample_set=True,
    ),
    _template(
        "max-sentence-40",
        "style",
        "Sentences of at most 40 words",
        "Long sentences are hard to read; split sentences longer than 40 words.",
        "max_sentence_words",
        {"max_words": 40},
        "low",
        in_sample_set=True,
    ),
    _template(
        "ai-no-performance-figures",
        "ai",
        "No performance figures",
        "AI rule: the document must not reveal numeric performance figures. Created disabled, "
        "because every check with it spends LLM quota.",
        "llm",
        {
            "instruction": "The document must not contain numeric figures that reveal the system's "
            "performance, such as detection range, accuracy, speed or update rate."
        },
        "high",
        in_sample_set=True,
        enabled=False,
    ),
    # ---------- more templates ----------
    _template(
        "pii-contact-details",
        "privacy",
        "No contact details",
        "Flags email addresses and phone numbers only.",
        "pii",
        {"categories": ["email", "phone"]},
        "medium",
    ),
    _template(
        "max-paragraph-150",
        "style",
        "Paragraphs of at most 150 words",
        "Flags paragraphs longer than 150 words.",
        "max_paragraph_words",
        {"max_words": 150},
        "low",
    ),
    _template(
        "standard-fonts",
        "style",
        "Standard fonts only",
        "Text must use Calibri, Calibri Light, Arial or Times New Roman.",
        "allowed_fonts",
        {"fonts": ["Calibri", "Calibri Light", "Arial", "Times New Roman"]},
        "low",
    ),
    _template(
        "body-font-size",
        "style",
        "Readable font sizes",
        "Text must be between 9 pt and 28 pt.",
        "font_size_range",
        {"min_pt": 9, "max_pt": 28},
        "low",
    ),
    _template(
        "revision-history",
        "structure",
        "Revision history required",
        'The document must contain a "Revision history" section.',
        "required_text",
        {"pattern": "Revision history"},
        "medium",
    ),
]
