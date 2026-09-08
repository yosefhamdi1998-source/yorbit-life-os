-- Notes get a real date field of their own.
--
-- The table only had created_date (when the row was written). That answers
-- "when did I type this", which is not the question someone writing a note
-- has — they want to date the note itself: the day of the call, the day the
-- bill is due, the day they agreed something. Those are frequently not the
-- day they happen to open the app.
--
-- Nullable on purpose: a quick thought jotted down doesn't need a date, and
-- forcing one would put a required field in front of the fastest path in
-- the whole app.
alter table notes
  add column if not exists note_date date;

-- Sort key for the notes list — pinned first, then by the note's own date
-- when it has one, falling back to when it was written.
create index if not exists idx_notes_user_note_date
  on notes(user_id, note_date desc nulls last);
