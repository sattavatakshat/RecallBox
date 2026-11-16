"""Conservative offline topic hints from text actually available to RecallBox.

No ML guess, third-party API, or inference about inaccessible reels/media.
A topic is returned only with an explicit textual signal; otherwise None.
"""
import re


def suggest_topic(title: str, text: str) -> tuple[str | None, str | None]:
    heading = (title or '').lower()[:240]
    excerpt = (text or '').lower()[:6000]

    title_rules = (
        ('Food', r'\brecipe\b', 'The title explicitly mentions a recipe.'),
        ('Travel', r'\b(travel guide|trip itinerary|travel itinerary|places to visit|things to do in)\b',
         'The title explicitly describes travel planning.'),
        ('Learning', r'\b(tutorial|programming guide|coding guide|learn to code|software lesson)\b',
         'The title explicitly describes a tutorial or lesson.'),
        ('Shopping', r'\b(buying guide|product comparison|shopping guide)\b',
         'The title explicitly describes a shopping guide.'),
        ('Ideas', r'\b(startup idea|business idea|saas idea)\b',
         'The title explicitly describes a business idea.'),
    )
    for topic, pattern, reason in title_rules:
        if re.search(pattern, heading):
            return topic, reason

    body_rules = (
        ('Food', ('ingredients', 'instructions'), 'Ingredients and instructions appear in accessible text.'),
        ('Food', ('ingredients', 'method'), 'Ingredients and preparation method appear in accessible text.'),
        ('Travel', ('itinerary', 'day 1'), 'Itinerary and a day-by-day plan appear in accessible text.'),
        ('Learning', ('tutorial', 'example code'), 'Tutorial and example code appear in accessible text.'),
    )
    for topic, signals, reason in body_rules:
        if all(re.search(r'\b' + re.escape(part) + r'\b', excerpt) for part in signals):
            return topic, reason
    return None, None
