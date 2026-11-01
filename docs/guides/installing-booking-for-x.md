# Install Booking for X

On a clean Frontbase installation, sign in as an administrator and choose **Install Template** in Dashboard or Pages. Select **Booking for X**, configure existing datasource mappings if available, review the six entries, confirm, and choose **Install**.

Booking for X is the public name of the template used for Studygram's education sites. It installs Homepage, Explore and Blog pages, plus reusable Institution detail, Program detail and Blog article layouts. All six are ordinary visually editable builder documents. Shared navigation remains editable in Menus.

Installation creates drafts. It does not publish content, copy source records, create datasource tables, or implement reservations/payments. Configure missing datasource mappings and languages, edit the layouts, then use the existing reviewed publication flow. One detail layout serves all matching records; installation does not create a page per record.

The installer accepts an empty site or its exact unedited welcome page. It refuses customized sites and repeat installation. Version one has no upgrade, replacement or uninstall operation. The selected state adapter must support atomic writes; unsupported configurations are refused.

If an installation response is interrupted, use **Check status**. The same operation is reconciled without repeating writes. Do not clear the installation receipt or retry with a new operation ID to bypass an unresolved state.

See the [implementation and acceptance record](../plans/booking-for-x-installer-20261101.md) for exact verification and remaining cloud/browser gates.
