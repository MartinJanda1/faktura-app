-- Sjednocení typů datumů u tabulky invoices: TIMESTAMP WITHOUT TIME ZONE
-- (CREATE TABLE IF NOT EXISTS staré sloupce nepřepíše)

DO $$
DECLARE
    col_type text;
    col_udt text;
BEGIN
    SELECT data_type, udt_name INTO col_type, col_udt
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'issue_date';

    IF col_type = 'date' THEN
        ALTER TABLE invoices
            ALTER COLUMN issue_date TYPE TIMESTAMP WITHOUT TIME ZONE
                USING issue_date::timestamp,
            ALTER COLUMN due_date TYPE TIMESTAMP WITHOUT TIME ZONE
                USING due_date::timestamp;
    ELSIF col_udt = 'timestamptz' THEN
        ALTER TABLE invoices
            ALTER COLUMN issue_date TYPE TIMESTAMP WITHOUT TIME ZONE
                USING issue_date AT TIME ZONE 'Europe/Prague',
            ALTER COLUMN due_date TYPE TIMESTAMP WITHOUT TIME ZONE
                USING due_date AT TIME ZONE 'Europe/Prague';
    END IF;

    SELECT data_type, udt_name INTO col_type, col_udt
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'created_at';

    IF col_type = 'time without time zone' THEN
        ALTER TABLE invoices
            ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING CURRENT_DATE + created_at,
            ALTER COLUMN saved_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING CURRENT_DATE + saved_at,
            ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING CURRENT_DATE + updated_at;
    ELSIF col_udt = 'timestamptz' THEN
        ALTER TABLE invoices
            ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING created_at AT TIME ZONE 'Europe/Prague',
            ALTER COLUMN saved_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING saved_at AT TIME ZONE 'Europe/Prague',
            ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING updated_at AT TIME ZONE 'Europe/Prague';
    END IF;
END $$;

ALTER TABLE invoices
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN saved_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE invoices
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN saved_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP NOT NULL;
