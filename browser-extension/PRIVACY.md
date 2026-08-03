# FieldFlow Website Activity privacy notice

FieldFlow Website Activity is a workforce activity extension used during an employee-started FieldFlow tracking session.

## Data collected

The extension collects only:

- the hostname (domain) of the active website, such as `salesforce.com`;
- the browser name; and
- the time attributed to that domain.

It does not collect full URLs, URL paths, query strings, page titles, page content, form values, passwords, typed text, clipboard content, screenshots, or private/incognito browsing.

## How data is used and transferred

The data is used only for workforce activity reporting within the employee's organisation. The extension sends it to the FieldFlow desktop agent running on the same computer at `127.0.0.1`. The authenticated desktop agent then sends queued activity to the organisation's FieldFlow service. The extension never stores FieldFlow passwords, access tokens, or Supabase credentials.

The extension stores only its latest connection and sampling status locally in the browser so the employee can confirm whether it is working. Data is not sold, used for advertising, or used for credit or lending decisions.

## Control and retention

Collection occurs only while a FieldFlow tracking session is active. Employees can stop collection by stopping tracking in the FieldFlow desktop agent. Organisational administrators control server-side access and retention according to the organisation's monitoring policy. Requests to access or delete server-side activity data should be made to the employee's organisation or FieldFlow administrator.

## Contact

Employees should contact their employer or organisation's FieldFlow administrator. The extension's official store listing provides the publisher's verified support contact. The public policy is available at `https://fieldflow-henna.vercel.app/privacy/website-activity`.
