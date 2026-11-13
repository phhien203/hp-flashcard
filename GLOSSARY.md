# Flashcard App

A flashcard app for creating and organizing question-and-answer cards and studying them.

## Language

**Card**:
A flashcard with a required question, answer, and exactly one category.

**Category**:
A named grouping of cards. A category comes into existence when a card is assigned that name; it is not managed separately.
Category names are equivalent regardless of letter case or surrounding whitespace; an existing category retains its display spelling.

**Progress**:
A card's cumulative self-assessed successes, from zero to five: each "I Know This" adds one up to five, and resetting returns it to zero.
New cards start at zero; editing, revealing answers, and navigating preserve progress.

**Not Started**:
A card with zero progress.

**In Progress**:
A card with progress from one to four.

**Mastered**:
A card whose progress has reached five out of five.
