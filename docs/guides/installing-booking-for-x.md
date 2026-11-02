# Install Booking for X

On a clean Frontbase installation, sign in as an administrator and choose **Install Template** in Dashboard or Pages. Select **Booking for X**, review the six entries, confirm, and choose **Install**.

Booking for X is the public name of the template used for Studygram's education sites. It installs Homepage, Explore and Blog pages, plus reusable Institution detail, Program detail and Blog article layouts. All six are ordinary visually editable builder documents. Shared navigation remains editable in Menus.

Installation creates drafts. It does not publish content, copy source records, create datasource tables, or implement reservations/payments. After installation, configure data in Data Studio and languages in General, edit the layouts and their bindings, then use the existing reviewed publication flow. The installer has no separate mapping form. One detail layout serves all matching records; installation does not create a page per record.

The installer accepts an empty site or its exact unedited welcome page. It refuses customized sites and repeat installation. Version one has no upgrade, replacement or uninstall operation. The selected state adapter must support atomic writes; unsupported configurations are refused.

If an installation response is interrupted, use **Check status**. The same operation is reconciled without repeating writes. Do not clear the installation receipt or retry with a new operation ID to bypass an unresolved state.

See the [implementation and acceptance record](../plans/booking-for-x-installer-20261101.md) for exact verification and remaining cloud/browser gates.

Publication preparation shows **Resolve before publication**, with specific settings and links to their existing editors. It first asks for a datasource, then source tables, then individual fields/relationships and publication filters. Optional unmapped cover/logo fields are not reported as required configuration. These are saved-configuration diagnostics, not proof that the remote database or every element field is available.

Source settings are resolved through one versioned binding contract for scoped queries, record URLs and frontend edit destinations. Existing configuration and published captures remain readable through its compatibility adapter. Source, field and scope mappings remain under Data Studio's Advanced publication setup. For a role with one reusable detail template, its record ID and original-URL fields are configured in **Pages → template URLs → Record source & URLs**. Legacy sites without that reusable template retain those controls in Data Studio. Both editors use the same saved configuration; no data is copied. Canonical persistence and runtime dependency retirement are qualified in [binding consolidation](../plans/template-binding-consolidation-20261102.md).
