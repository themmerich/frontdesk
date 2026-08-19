create table notes (
    id         bigint generated always as identity primary key,
    title      varchar(200) not null,
    content    text         not null,
    created_at timestamptz  not null default now(),
    updated_at timestamptz  not null default now()
);
