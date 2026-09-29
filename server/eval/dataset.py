"""Labelled documents for measuring how well the AI rules find violations.

Every document is built as a real .docx at run time and parsed by the production parser, so the
evaluation exercises the same path as the app. Labels are verbatim quotes from the document text:

- `expected`: must be flagged by that rule (counts for recall and precision)
- `optional`: borderline; a finding here counts neither for nor against the model
- `traps`: must NOT be flagged by any rule (a finding here is a false positive, reported separately)
"""

from dataclasses import dataclass, field

from app.llm import LlmRule

PERF = LlmRule(
    1,
    "No performance figures",
    "The document must not contain numeric figures that reveal the system's performance or capabilities, "
    "such as detection range, speed, accuracy, latency, throughput, availability, capacity, endurance or "
    "response time.",
)
ARCH = LlmRule(
    2,
    "No internal architecture details",
    "The document must not name specific internal servers, hostnames, IP addresses, database names or "
    "internal component names, and must not describe how data flows between specific internal components.",
)
RULES = [PERF, ARCH]

# A paragraph, a ("heading", text) pair, or a ("table", rows) pair
Item = str | tuple[str, str] | tuple[str, list[list[str]]]


@dataclass(frozen=True)
class EvalDoc:
    name: str
    language: str
    title: str
    items: list[Item]
    expected: dict[int, list[str]] = field(default_factory=dict)
    optional: dict[int, list[str]] = field(default_factory=dict)
    traps: list[str] = field(default_factory=list)


DOCS: list[EvalDoc] = [
    EvalDoc(
        "radar_overview",
        "en",
        "Falcon Radar - System Overview",
        [
            ("heading", "Background"),
            "The Falcon radar was developed in 2021 by a team of 40 engineers.",
            ("heading", "Performance"),
            "The maximum detection range is 85 km against small aerial targets.",
            "Track updates are published every 2 seconds, with a positional accuracy of 3 meters.",
            "The system is designed for continuous operation in harsh weather.",
            "See Section 4 for the maintenance procedure described on page 12.",
        ],
        expected={PERF.id: ["maximum detection range is 85 km", "every 2 seconds", "positional accuracy of 3 meters"]},
        traps=["2021", "40 engineers", "Section 4", "page 12"],
    ),
    EvalDoc(
        "cloud_platform",
        "en",
        "Platform Service Description",
        [
            "Service availability target is 99.95% per calendar month.",
            "P95 response latency is under 150 ms at peak load.",
            "The platform handles up to 12,000 requests per second.",
            "Version 2.4.1 of the client library was released in March 2024.",
            "The support team works in two shifts.",
        ],
        expected={PERF.id: ["99.95%", "under 150 ms", "12,000 requests per second"]},
        traps=["2.4.1", "March 2024", "two shifts"],
    ),
    EvalDoc(
        "data_flow",
        "en",
        "Data Handling Overview",
        [
            "Sensor data is sent from the ingest-gw-01 gateway to the Kafka cluster kfk-prod-3.",
            "The analytics database runs on 10.20.30.41 and is replicated nightly.",
            "Operators use a web interface to review alerts.",
            "The document follows ISO 9001 quality guidelines.",
        ],
        expected={ARCH.id: ["ingest-gw-01", "kfk-prod-3", "10.20.30.41"]},
        traps=["ISO 9001"],
    ),
    EvalDoc(
        "hebrew_radar",
        "he",
        "סקירת מערכת הגילוי",
        [
            "מערכת הגילוי פותחה בשנת 2019.",
            "טווח הגילוי המירבי הוא 50 ק״מ.",
            "זמן התגובה של המערכת קטן מ-200 מילישניות.",
            "הנתונים נשלחים מהשרת srv-core-02 אל מסד הנתונים DBMAIN.",
            "המסמך כולל 3 נספחים.",
        ],
        expected={PERF.id: ["50 ק״מ", "200 מילישניות"], ARCH.id: ["srv-core-02", "DBMAIN"]},
        traps=["2019", "3 נספחים"],
    ),
    EvalDoc(
        "uav_specification",
        "en",
        "UAV Program Summary",
        [
            "The UAV can remain airborne for 14 hours on a single fuel load.",
            "Its cruise speed is 180 km/h and its service ceiling is 7,500 m.",
            "The airframe was painted grey to reduce visibility.",
            "Three prototypes were built during the program.",
        ],
        expected={PERF.id: ["14 hours", "180 km/h", "7,500 m"]},
        traps=["Three prototypes"],
    ),
    EvalDoc(
        "clean_policy",
        "en",
        "Incident Reporting Policy",
        [
            "This policy describes how operators should report incidents.",
            "Incidents must be reported within the same shift.",
            "The system performs well under a wide range of conditions.",
            "All staff completed the training in 2023.",
        ],
        traps=["performs well under a wide range of conditions", "2023"],
    ),
    EvalDoc(
        "parameters_table",
        "en",
        "Sensor Parameters",
        [
            "The table below summarises the sensor configuration.",
            (
                "table",
                [
                    ["Parameter", "Value"],
                    ["Detection range", "120 km"],
                    ["Update rate", "1 s"],
                    ["Operating temperature", "-20 to 50 °C"],
                    ["Colour", "Grey"],
                ],
            ),
        ],
        expected={PERF.id: ["120 km", "1 s"]},
        optional={PERF.id: ["-20 to 50 °C"]},
        traps=["Grey"],
    ),
    EvalDoc(
        "hebrew_services",
        "he",
        "תיאור שירות האימות",
        [
            "שרת האימות auth-01.internal מעביר את האסימונים לשירות gw-api.",
            "זמינות השירות היא 99.9%.",
            "הגרסה הנוכחית היא 5.2.",
        ],
        expected={PERF.id: ["99.9%"], ARCH.id: ["auth-01.internal", "gw-api"]},
        traps=["5.2"],
    ),
    EvalDoc(
        "references_and_counts",
        "en",
        "Antenna Upgrade Note",
        [
            "Figure 3 shows the antenna layout; Table 2 lists the parts.",
            "The 2022 upgrade replaced 4 of the 6 antenna panels.",
            "Power consumption is 3.2 kW in standby.",
            "The contract value was 2 million dollars.",
        ],
        optional={PERF.id: ["3.2 kW"]},
        traps=["Figure 3", "Table 2", "2022", "4 of the 6 antenna panels", "2 million dollars"],
    ),
    EvalDoc(
        "archive_storage",
        "en",
        "Recording Archive",
        [
            "The archive stores up to 400 TB of recorded data.",
            "Recordings are retained for 30 days by policy.",
            "Data is copied from nas-archive-2 to the offsite vault every night.",
        ],
        expected={PERF.id: ["400 TB"], ARCH.id: ["nas-archive-2"]},
        optional={PERF.id: ["30 days"]},
    ),
]
