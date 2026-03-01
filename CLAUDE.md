# Fee Proposal Generator

Google Apps Script web app for "Funkitecture & Co" architecture firm.
Generates fee proposal Google Docs from templates stored in Google Drive.

## Files
- `code.gs` — Google Apps Script backend
- `index.html` — Frontend HTML/CSS/JS served by Apps Script

## Architecture

### Backend (code.gs)
- `doGet()` — serves the web app via HtmlService
- `getConfig()` — returns project types (template names), rates, consultants
- `getStagesForTemplate(templateName)` — parses a template Google Doc for stages
- `getExistingProjects()` — lists project folders in Google Drive
- `generateProposal(data)` — copies template, runs merge field substitution

### Frontend (index.html)
- Two-tab UI: "New Proposal" and "Open Existing"
- Calls backend via `google.script.run` (Apps Script bridge)
- Loads config on DOMContentLoaded, then fetches stages when project type changes
- Collects: client details, project details, fee stages (status/fee/description), consultants, rates
- Submits all data to `generateProposal()` which creates a Google Doc

## Google Drive Structure
```
Fee Proposals/           ← ROOT_FOLDER_NAME
  _Templates/            ← TEMPLATES_FOLDER_NAME
    <ProjectType>.gdoc   ← one template per project type
  <Project Address>/     ← created per proposal
    Fee Proposal - <ClientName>.gdoc
```

## Template Doc Format (merge fields)
- `{{client_name}}`, `{{client_address}}`, `{{project_address}}`, `{{date}}`
- `{{project_description}}`, `{{total_fee}}`, `{{deposit_percentage}}`
- `{{rate_architect}}`, `{{rate_graduate}}`, `{{rate_draftsperson}}`
- `{{financial_year}}`, `{{consultant_list}}`
- `{{fee_schedule}}` — replaced with a 3-column payment schedule table (included stages only)
- Per stage: `{{stage_N_fee}}`, `{{stage_N_status}}`
- Description blocks: `{{stage_N_description_start}}` … `{{stage_N_description_end}}`
- Stage headers are Heading 1 paragraphs matching: `Stage N: <name>`

## Default Config
- Rates: Architect $200/hr, Graduate $120/hr, Draftsperson $85/hr
- Deposit: 20%
- Consultants included by default: Private Certifier, Survey, Structural Engineer, Stormwater Engineer, Civil Engineer, Landscape Architect, Basix Report
- Consultants excluded by default: Town Planning Report, Subdivision, Geotech, Quantity Surveyor, Sydney Water Section 73 & BPA

## Design System
- Fonts: Cormorant Garamond (serif), DM Mono (monospace)
- Colors: ink `#1a1714`, paper `#f5f1eb`, cream `#ede8e0`, accent `#8b6c42`
- Stage status colours: Included (green `--success`), Optional (tan `--accent`), Excluded (red `--danger`)
