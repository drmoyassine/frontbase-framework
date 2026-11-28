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

The six template layouts and the standalone inquiry page use the same footer menu revision (`15b2753e3666…`). The Menus preview action still requires a whole-site version. On this live-layout installation, Builder's **Page Settings** shared-menu control and single-layout publication applied the shared change.

Anonymous requests checked the homepage, Explore, Blog, Washington State University, Advertising, a Rutgers Camden article and the standalone inquiry page in English and Arabic. All 14 returned HTTP 200 with `Cache-Control: no-store`. Footer links retained the visitor's language. Each detail page and the standalone page contained one submission form with a ticket. This placement check used reads only. The earlier CRM receipt remains the sole production test submission.

At the initial placement check, the Arabic forms still displayed English labels. The localization verification below supersedes that finding. Mail delivery to arbitrary applicants and inbox placement remain open.

Builder previously reported a save error after the server had already committed the page. The console now handles the generated client's Axios response and surfaces the server's conflict reason when a save is rejected. Three regression checks passed. Workspace type checks passed and all packages built, including a successful retry of the Cloudflare packaging step after a local file lock. Worker `c8931013-5072-4629-9a04-de0c7262f51f` serves commit `8c92c1a0` with all 17 bindings. The signed-in console confirmed **Page saved** when adding site navigation to the standalone inquiry page. The reviewed page was published and all 14 public checks passed again.

## Bilingual inquiry forms, 2026-11-28

The published Institution detail layout places its existing Form and Street address in one Builder column, with the form first. The public layout retained the original form and workflow. In **Translate saved page**, the operator saved 11 Arabic strings for each of four Form components. These cover the heading, submit button, seven field labels including consent, and both contact-method choices. Form field names and the submitted values `Email` and `WhatsApp` remain stable across languages.

Anonymous GETs verified the standalone inquiry page reached from the footer, Dominican University of California, Washington State Advertising and the Rutgers Camden carbon-monoxide article in both languages. All eight returned HTTP 200 and `Cache-Control: no-store`. Each contained exactly one enabled form with a submission ticket and all 11 expected strings. The two institution pages rendered the form directly above the address. Arabic pages rendered RTL. The homepage footer links led to the matching language in both cases. The shared Arabic footer navigation caption still reads “Submit an inquiry.”

The production Worker version is `39d819ff-eecb-46f0-ada6-6edf51de2b84`. All 17 bindings passed the deployment parity check. The final rebuild with label escaping enabled reproduced the deployed Worker SHA-256 `8dd18886560afa43b77735dc3ffe543815dcb71572b879ed1eebc30810b7c828`. The local public form and translation preview gates caught three and five deliberately introduced faults respectively. Verification created no production CRM submission or confirmation email.
