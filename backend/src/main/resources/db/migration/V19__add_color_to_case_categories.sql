-- A colour per category, which the inbox uses as the text colour of the cases
-- classified as such. Null is the normal case and means "no colour chosen";
-- the constraint keeps the column to the fixed palette, because the frontend
-- resolves each name to a light and a dark value and cannot do that for a
-- colour it has never heard of.
ALTER TABLE case_categories ADD COLUMN color TEXT
    CHECK (color IN ('BLUE', 'GREEN', 'AMBER', 'RED', 'VIOLET', 'TEAL', 'GREY'));
