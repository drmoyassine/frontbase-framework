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

The general inquiry page uses the existing slug `/submit-university-inquiry/`. All six Booking for X layouts link there through the shared footer. Institution, program and blog article layouts also contain a Builder Form so visitors can inquire about the record they are reading. Each uses version 1 of the same workflow. The CRM uses its existing managed lists, ownership and database triggers.

## Production verification, 2026-11-28

The Builder Form on **Submit an inquiry** uses version 1 of **Inquiry follow-up · Studygram DB**. The single-page publication carried forward the site's six existing layouts. Both language routes returned HTTP 200 with an enabled form and `Cache-Control: no-store`. The English and Arabic homepages, Explore, Blog, Washington State University and Advertising also returned HTTP 200 after publication.

One browser submission returned the visitor receipt. Its initial CRM transaction rolled back because Studygram generates `activities.status`. The corrected mapping lets the database calculate status. For this specific three-step workflow, an administrator can recover the original encrypted submission from **Builder → Form → Recent inquiries → Reconcile CRM follow-up**. The CRM receipt prevents recovery from sending another confirmation after an earlier CRM commit.

The administrator recovered that submission on Worker version `3b378f42-4475-4e7a-8eaf-c6202892357d` (code `1bcf99a1`, all 17 bindings retained). A direct database check found one matching existing contact, one receipt, one received communication and one Open Lead Inquiry activity. Both records linked to that contact. The note retained the consent and original page path. Builder reported **Workflow completed** after the mail provider accepted the confirmation. The recipient confirmed that the matching message arrived in the Junk folder. This completes the single-submission delivery test. The reason for junk placement is unverified.

Workspace type checks, builds, the live-layout inquiry fixture, the single-layout publication UI tests and the deployment artifact checks passed. The fixture covers concurrent duplicate submissions, cross-tenant access, cross-origin reconciliation, refusal to replay arbitrary HTTP workflows and suppression of duplicate confirmation sends. The Worker bundle measured 987.1 KB gzip.

## Inquiry placements, 2026-11-28

The six template layouts use the same footer menu revision (`15b2753e3666…`). The standalone inquiry page is the destination. The Menus preview action still requires a whole-site version. On this live-layout installation, Builder's **Page Settings → Use latest saved menu version** and single-layout publication applied the shared change.

Anonymous requests checked the homepage, Explore, Blog, Washington State University, Advertising, a Rutgers Camden article and the standalone inquiry page in English and Arabic. All 14 returned HTTP 200 with `Cache-Control: no-store`. Footer links retained the visitor's language. Each detail page and the standalone page contained one submission form with a ticket. This placement check used reads only. The earlier CRM receipt remains the sole production test submission.

The form labels still use English on Arabic pages. Arabic field copy, mail delivery to arbitrary applicants and inbox placement remain follow-ups.
