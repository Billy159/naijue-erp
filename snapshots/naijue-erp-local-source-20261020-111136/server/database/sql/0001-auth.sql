-- Version 0001: structural baseline; no business rows or account seeds.
CREATE TABLE __AUTH__.employee_account_audit (
    id bigint NOT NULL,
    actor_id text NOT NULL,
    employee_id text NOT NULL,
    action text NOT NULL,
    changes jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE __AUTH__.employee_account_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE __AUTH__.employee_account_audit_id_seq OWNED BY __AUTH__.employee_account_audit.id;

CREATE TABLE __AUTH__.employee_login (
    id text NOT NULL,
    login_name text,
    body jsonb NOT NULL,
    password_salt text,
    password_hash text,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __AUTH__.employee_session (
    token text NOT NULL,
    employee_id text NOT NULL,
    employee_version integer NOT NULL,
    expires_at bigint NOT NULL
);

ALTER TABLE ONLY __AUTH__.employee_account_audit ALTER COLUMN id SET DEFAULT nextval('__AUTH__.employee_account_audit_id_seq'::regclass);

ALTER TABLE ONLY __AUTH__.employee_account_audit
    ADD CONSTRAINT employee_account_audit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __AUTH__.employee_login
    ADD CONSTRAINT employee_login_login_name_key UNIQUE (login_name);

ALTER TABLE ONLY __AUTH__.employee_login
    ADD CONSTRAINT employee_login_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __AUTH__.employee_session
    ADD CONSTRAINT employee_session_pkey PRIMARY KEY (token);

ALTER TABLE ONLY __AUTH__.employee_session
    ADD CONSTRAINT employee_session_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES __AUTH__.employee_login(id);
