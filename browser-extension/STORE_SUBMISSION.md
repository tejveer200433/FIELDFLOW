# FieldFlow Website Activity store submission

The packaging script creates two upload files:

- `fieldflow-website-activity-chromium-0.3.0.zip` for the Chrome Web Store and compatible Chromium stores;
- `fieldflow-website-activity-firefox-0.3.0.zip` for Mozilla Add-ons.

These ZIP files are store-upload packages, not Windows installers. Do not use the old repository-root `browser-extension.zip`.

## Single purpose

During an employee-started FieldFlow tracking session, report the hostname of the active website to the FieldFlow desktop agent installed on the same computer.

## Permission explanations

- `tabs`: reads the active tab URL only long enough to extract its hostname. The path, query, title, content, and original URL are discarded.
- `alarms`: triggers automatic domain sampling once per minute.
- `storage`: stores the latest local connection/sampling status shown in the extension popup.
- `http://127.0.0.1:38473/*`: sends hostname-only samples to the FieldFlow desktop agent on the same computer.

## Chrome Web Store disclosure

Declare **website activity** as collected. State that it is used only for the extension's workforce activity-reporting purpose, is not sold, and is not used for advertising. Provide a publicly hosted privacy-policy URL containing the substance of `PRIVACY.md`.

## Firefox disclosure

The Firefox manifest declares `websiteActivity` as required data collection. Keep that declaration consistent with the Mozilla Add-ons privacy questionnaire.

## Before uploading

1. Confirm `https://fieldflow-henna.vercel.app/privacy/website-activity` is publicly accessible after deployment.
2. Run `browser-extension/package-store.ps1`.
3. Upload the Chromium ZIP to the Chrome Web Store developer dashboard and use the public policy URL above.
4. Upload the Firefox ZIP to Mozilla Add-ons and complete source/review questions truthfully.
5. Wait for store review and publication.
6. Record the final store links and stable extension IDs. They are needed before preparing employee installation instructions and the final Windows installer.

Because the laptops are unmanaged, each employee must approve **Add extension** once in each browser they use. After installation, the extension needs no separate FieldFlow sign-in and no **Check now** action.
