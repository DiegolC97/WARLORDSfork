# contradiction

A memory that clashes with newer reality — flagged to be resolved.

## Internal race identifiers were first defined as descriptive strings (empire, dwarfs, high…

What: Internal race identifiers were first defined as descriptive strings (empire, dwarfs, high-elves, orcs-and-goblins, warriors-of-chaos, lizardmen) in the playable-skeleton slice, then changed to opaque race1..race6 in save schema v2 during the naming/de-branding slice. · Why: the naming slice required that no display name (working title) ever leak outside src/names/displayNames.ts, and descriptive race ids risked embedding those names in code/data/saves permanently. · Where: src/save/schema.ts, src/names/displayNames.ts. · Learned: any future reference to descriptive race ids from the first slice is stale; race identity in code is now the opaque race1..race6, with display names looked up separately. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-4 -->
