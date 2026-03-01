# Funkitecture Fee Proposal Generator

A Google Apps Script web app that generates fee proposal documents for Funkitecture & Co. Pulls stage descriptions and structure from Google Doc templates, lets you configure fees and consultants, then produces a populated Google Doc saved to Drive.

## Setup

### 1. Google Drive structure

Create the following folder structure in your Google Drive:

```
Fee Proposals/
  _Templates/
    <ProjectType>   ← one Google Doc per project type (e.g. "Residential")
```

### 2. Deploy to Apps Script

1. Go to [script.google.com](https://script.google.com) and create a new project
2. Copy `code.gs` into the script editor
3. Add a new HTML file named `Index` and copy `index.html` into it
4. Deploy as a Web App: **Deploy → New deployment → Web app**
   - Execute as: Me
   - Who has access: Anyone within your organisation (or as needed)

### 3. Configure rates

Edit the `CONFIG` object at the top of `code.gs`:

```js
const CONFIG = {
  ROOT_FOLDER_NAME:      "Fee Proposals",
  TEMPLATES_FOLDER_NAME: "_Templates",
  RATES: {
    architect:    200,
    graduate:     120,
    draftsperson:  85,
  },
  DEPOSIT_PERCENT: 20,
};
```

## Template Doc Format

Template documents live in `Fee Proposals/_Templates/`. Each file name becomes a project type option in the dropdown.

### Stage headers
Stage headers must be **Heading 1** paragraphs in the format:

```
Stage 1: Schematic Design
Stage 4.5: Construction Certificate
```

### Merge fields

| Field | Description |
|---|---|
| `{{client_name}}` | Client full name |
| `{{client_address}}` | Client postal address |
| `{{project_address}}` | Site address |
| `{{date}}` | Proposal date |
| `{{project_description}}` | Brief project description |
| `{{total_fee}}` | Sum of all Included stage fees |
| `{{deposit_percentage}}` | Deposit % (e.g. `20%`) |
| `{{rate_architect}}` | Hourly rate |
| `{{rate_graduate}}` | Hourly rate |
| `{{rate_draftsperson}}` | Hourly rate |
| `{{financial_year}}` | e.g. `2024-2025` |
| `{{consultant_list}}` | Auto-generated list of included consultants |
| `{{stage_N_fee}}` | Fee for stage N (e.g. `stage_1_fee`) |
| `{{stage_N_status}}` | Included / Optional / Excluded |

### Description blocks

Wrap editable stage description content between marker paragraphs:

```
{{stage_1_description_start}}
Your default description text here…
{{stage_1_description_end}}
```

Content between the markers is extracted into the UI and replaced on generation.

## Usage

1. Open the deployed web app URL
2. Fill in client and project details
3. Select a project type — stages load automatically from the template
4. Set fees, toggle stage status (Included / Optional / Excluded), and adjust consultants
5. Click **Generate Proposal →**
6. The proposal opens in a new tab as a Google Doc, saved under `Fee Proposals/<Project Address>/`

## File Reference

| File | Purpose |
|---|---|
| `code.gs` | Apps Script backend — Drive I/O, template parsing, doc generation |
| `index.html` | Frontend UI — served by Apps Script HtmlService |
