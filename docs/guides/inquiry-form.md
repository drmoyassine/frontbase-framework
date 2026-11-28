# Submit inquiry

In Builder, add **Data → Form** to a layout. Under **General**, select **Use inquiry form**. Edit the fields, choices, required flags, consent wording, button label and receipt message there. Renaming a label preserves its workflow key. Publish the layout to enable collection on the public live page. Builder and private previews show the form with submission disabled.

The preset collects first name, last name, email, optional phone, preferred contact method, message and consent. The current route supplies the page, language and, on a detail page, the record and parent identity. This lets one Form serve an institution layout, a program layout or an article. Existing database-bound forms keep their create/edit behavior. Older public form drafts retain their preview behavior.

## Follow-up

For a Supabase-backed CRM, select **Set up CRM follow-up**, pick its datasource and select **Create and publish workflow**. Select the resulting workflow version, save the Form and publish the reviewed page. The workflow is editable under **Automations**. Its three nodes are **Manual Trigger → Record CRM inquiry → Confirm inquiry by email**. The two action nodes require a recorded, validated submission. An editor test with arbitrary input cannot send a real receipt.

Install a server-only `public.frontbase_record_inquiry(inquiry jsonb)` transaction on the selected datasource. Return `{"submission_id":"<incoming UUID>","created":true}` only after first recording the submission, and return `created:false` for a duplicate. The confirmation action runs only on a fresh CRM receipt. The host's configured mail sender receives the validated form email and reference. If mail is refused, Recent inquiries shows **needs_review** and the committed CRM records remain available. Use the reference to reconcile delivery before resending. [Studygram mapping](../../examples/study-in-usa/inquiry-crm.sql).

**Record only** is the default. Open the Form's **Recent inquiries** in Builder to inspect the latest 50 submissions for that element. For automated follow-up, publish a Frontbase workflow in **Actions**, then select the workflow and its version under **After recording an inquiry**. Save and publish the layout. Edits to the workflow draft do not change the selected version.

For an existing CRM integration, start with a **Manual Trigger**, add **HTTP Request** with a fixed HTTPS destination, set its method to POST and enable a JSON request body. Connect the trigger's **payload** output to the request's **body** input and leave its literal body unset. Keep destination credentials on the server. Before collecting real inquiries, confirm the workflow sends data only to the intended destination. The trigger payload has this shape (example values):

```json
{
  "inquiry": {
    "type": "inquiry.submitted",
    "submissionId": "d429655a-fb16-419d-a07e-76d4cb562106",
    "fields": {
      "first_name": "Test", "last_name": "Student",
      "email": "student@example.test", "phone": "",
      "contact_method": "Email", "message": "When is the next intake?", "consent": true
    },
    "source": {
      "pageId": "…", "formId": "ask-us", "locale": "en", "path": "/example-program/",
      "collection": "programs", "recordId": "42", "parentId": "7"
    }
  }
}
```

The event also carries field definitions, including the consent wording, and the publication revision. The destination should use the submission ID to deduplicate each note, task and email. Use the CRM's approved contact identity to create or update the contact. In the same database transaction, append the inquiry to communications, assign the follow-up task, and enqueue the confirmation email. Deliver from that outbox after commit. A fresh inquiry from the same person warrants a new note and task. Honor the site's consent policy before sending. The framework does not assume CRM table names, a task assignee, or an email sender.

The workflow execution appears in Actions history with its submission ID and outcome. On Workers the visitor can leave once the inquiry is recorded, while Frontbase completes the configured follow-up in the background.

## Operations

The public form posts to its own site. The server verifies the sealed one-hour form ticket against the current published page and record, validates the configured fields, and records the encrypted submission and workflow intent in one row. Retries of the same submission with different values are rejected. The public receipt confirms recording only. An unavailable workflow or unsuccessful HTTP destination is flagged for administrator review. If a process stops mid-delivery, check the CRM for the submission ID before taking further action.

Inquiries expire after 30 days. Inbox reads and new submissions purge expired entries for the site. For cleanup independent of traffic, configure a daily Cloudflare Cron Trigger on the application Worker, or schedule the backend's `purgeExpiredInquiries(runner)` against the installed state database on another host. Set separate retention policies for backups and downstream CRM data.

This implementation collects on the published live-layout serving path. Synthetic coverage uses local SQLite, a real published detail layout and a test CRM destination. Production acceptance needs the actual page placements, consent copy, contact matching rule, communications/task mappings, sender and a designated test recipient.
