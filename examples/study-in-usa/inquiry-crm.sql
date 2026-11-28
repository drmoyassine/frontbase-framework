-- Studygram CRM mapping, installed in Studygram DB only. Execute as a migration.
-- All effects for a receipt share the caller's transaction.
create schema if not exists frontbase_inquiry_private;
revoke all on schema frontbase_inquiry_private from public, anon, authenticated;
grant usage on schema frontbase_inquiry_private to service_role;

create table frontbase_inquiry_private.receipts (
    submission_id uuid primary key,
    contact_id integer not null,
    communication_id integer not null,
    activity_id integer not null,
    recorded_at timestamptz not null default now()
);
alter table frontbase_inquiry_private.receipts enable row level security;
revoke all on frontbase_inquiry_private.receipts from public, anon, authenticated;
grant select, insert on frontbase_inquiry_private.receipts to service_role;

create function public.frontbase_record_inquiry(inquiry jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $body$
declare
    receipt uuid := (inquiry->>'submissionId')::uuid;
    fields jsonb := inquiry->'fields';
    source jsonb := inquiry->'source';
    address text := lower(trim(fields->>'email'));
    person public.contacts%rowtype;
    note_id integer;
    task_id integer;
    -- Studygram Inc. owns the Study-in-USA intake.
    studygram constant integer := 519;
begin
    if receipt is null or inquiry->>'type' is distinct from 'inquiry.submitted'
       or fields->'consent' is distinct from 'true'::jsonb
       or address is null or length(address)>254 or address !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
       or nullif(trim(fields->>'message'),'') is null then
        raise exception 'invalid inquiry';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(receipt::text,1));
    if exists(select 1 from frontbase_inquiry_private.receipts where submission_id=receipt) then
        return jsonb_build_object('submission_id',receipt,'created',false);
    end if;
    perform pg_advisory_xact_lock(hashtextextended(address,2));
    -- STRICT rejects ambiguous historical case variants without picking a person.
    begin
        select * into strict person from public.contacts where lower(email)=address for update;
    exception when no_data_found then
        insert into public.contacts(contact_type,email,first_name,last_name,phone,preferred_channel,lead_source,lead_subsource,owner_org_id)
        values('Lead',address,fields->>'first_name',fields->>'last_name',nullif(fields->>'phone',''),nullif(fields->>'contact_method',''),'Inquiry','study-in-usa.com',studygram)
        returning * into person;
    end;
    if not (person.org_id is not distinct from studygram or person.owner_org_id is not distinct from studygram
        or (person.contact_type='Lead' and person.owner_org_id is null and person.org_id is null and person.lead_subsource='study-in-usa.com')) then
        raise exception 'contact requires reconciliation';
    end if;
    -- Unverified public input never rewrites a CRM profile. Record the submitted
    -- contact details on this communication for staff to reconcile.
    insert into public.communications(applicant_id,org_id,communication_type,status,message_content,date_timestamp,metadata)
    values(person.id,studygram,'Lead Communication','received',fields->>'message',now() at time zone 'UTC',
        jsonb_build_object('origin','frontbase_inquiry','submission_id',receipt,'source',source,
            'submitted',fields-'message','field_definitions',inquiry->'fieldDefinitions'))
    returning id into note_id;
    insert into public.activities(name,type,status,description,related_contact_id,origin)
    values('Follow up on Study-in-USA inquiry','Lead Inquiry','Open','Inquiry '||receipt::text,person.id,'frontbase_inquiry')
    returning id into task_id;
    insert into frontbase_inquiry_private.receipts(submission_id,contact_id,communication_id,activity_id)
    values(receipt,person.id,note_id,task_id);
    return jsonb_build_object('submission_id',receipt,'created',true);
end;
$body$;
revoke all on function public.frontbase_record_inquiry(jsonb) from public, anon, authenticated;
grant execute on function public.frontbase_record_inquiry(jsonb) to service_role;
