-- Mahasamut becomes the built-in default theme. Never edit after it has run anywhere.
-- Installs still on the old default (classic) move to it; a default someone chose otherwise stays.

ALTER TABLE theme_default ALTER COLUMN theme_id SET DEFAULT 'mahasamut';
UPDATE theme_default SET theme_id = 'mahasamut' WHERE theme_id = 'classic';
