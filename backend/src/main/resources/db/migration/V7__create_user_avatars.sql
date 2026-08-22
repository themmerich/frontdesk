-- Profile pictures live in their own table, not as a column on users: the user
-- row is loaded on practically every request (auth, tenant scoping), and a
-- multi-megabyte image must not travel along. Only the avatar endpoint reads it.
CREATE TABLE user_avatars (
    id           UUID        PRIMARY KEY,
    user_id      UUID        NOT NULL UNIQUE REFERENCES users (id),
    image        BYTEA       NOT NULL,
    content_type TEXT        NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL
);
