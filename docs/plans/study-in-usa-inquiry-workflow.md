# Study-in-USA inquiry workflow

The public Builder Form supplies the fields. The published workflow selects Studygram DB from Data Studio. Its first action calls the [Studygram transaction](../../examples/study-in-usa/inquiry-crm.sql). Its second action emails the submitter after the transaction commits.

| Input | CRM destination | Rule |
|---|---|---|
| Email | `public.contacts.email` | Match a single contact by case-insensitive email within Studygram’s scope. Ambiguous or out-of-scope matches require review. |
| First name, last name, phone, preferred contact method | New Lead in `public.contacts` | Identify new leads as Inquiry from study-in-usa.com, owned by Studygram Inc. Existing contacts retain their profile. Staff can reconcile new details from the communication. |
| Message, consent, submitted details, page and record context | `public.communications` | One received Lead Communication per submission, linked by `applicant_id`. Preserve the consent wording and page revision. A public submission does not authenticate the sender as a CRM user. |
| Follow-up | `public.activities` | One Open Lead Inquiry linked through `related_contact_id`. The initial mapping leaves individual assignment to Studygram. |
| Submission UUID | Private receipt | One transaction records the contact link, communication, activity and receipt. Retrying that UUID cannot create another note or task. |
| Confirmation | Worker transactional sender | Send a short receipt in the submission language with its reference. The existing verified-destination binding supports the designated test inbox. Broad public confirmations require a sender permitted to deliver to other addresses. |

The initial page uses the legacy inquiry slug `/submit-university-inquiry/`. Links from other layouts and record-specific placements are separate configuration work. The CRM uses its existing managed lists, ownership and database triggers. The form receipt and workflow history distinguish recording, CRM completion and a delivery problem. Inbox arrival requires a separate mailbox check.

## Production verification, 2026-11-28

The Builder Form on **Submit an inquiry** uses version 1 of **Inquiry follow-up · Studygram DB**. The single-page publication carried forward the site's six existing layouts. Both language routes returned HTTP 200 with an enabled form and `Cache-Control: no-store`. The English and Arabic homepages, Explore, Blog, Washington State University and Advertising also returned HTTP 200 after publication.

One browser submission returned the visitor receipt. Its initial CRM transaction rolled back because Studygram generates `activities.status`. The corrected mapping lets the database calculate status. For this specific three-step workflow, an administrator can recover the original encrypted submission from **Builder → Form → Recent inquiries → Reconcile CRM follow-up**. The CRM receipt prevents recovery from sending another confirmation after an earlier CRM commit.
