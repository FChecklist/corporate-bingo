-- "Notify me when this game begins" (release 1.6.0): when the one "game begins" push message of a game was started, so it is sent once. NULL = not yet. Apply BEFORE deploying the code that reads it (the code does not read it unless PUSH_URL and PUSH_ADMIN_KEY are set, so a game that never turns push on does not need it).
ALTER TABLE engagement ADD COLUMN push_sent_ms INTEGER;
