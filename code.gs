// ============================================================
// CONFIGURATION — update these before deploying
// ============================================================
const CONFIG = {
  ROOT_FOLDER_NAME: "Fee Proposals",
  TEMPLATES_FOLDER_NAME: "_Templates",
  RATES: {
    architect:    200,
    graduate:     120,
    draftsperson:  85,
  },
  DEPOSIT_PERCENT: 20,
};

// ============================================================
// WEB APP ENTRY POINT
// ============================================================
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle("Funkitecture Fee Proposal Generator")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// CALLED FROM FRONTEND: get initial config (no stages yet)
// ============================================================
function getConfig() {
  return {
    projectTypes:       getTemplateNames(),
    rates:              CONFIG.RATES,
    depositPercent:     CONFIG.DEPOSIT_PERCENT,
    defaultConsultants: getDefaultConsultants(),
  };
}

// ============================================================
// CALLED FROM FRONTEND: get stages for a selected template
// ============================================================
function getStagesForTemplate(templateName) {
  try {
    const file = getTemplateDoc(templateName);
    Logger.log('Opening template: ' + file.getName() + ' id:' + file.getId());
    const doc = DocumentApp.openById(file.getId());
    const stages = parseStagesFromTemplate(doc);
    Logger.log('Parsed ' + stages.length + ' stages');
    return { success: true, stages };
  } catch(e) {
    Logger.log('Error in getStagesForTemplate: ' + e.message + '\n' + e.stack);
    return { success: false, error: e.message + ' | stack: ' + e.stack };
  }
}

// ============================================================
// PARSE STAGES FROM TEMPLATE DOC
//
// A stage header paragraph contains {{stage_N_fee}} where N is
// a number or number_number (e.g. stage_1_fee, stage_4_5_fee).
//
// The stage name is everything on that line before the fee placeholder.
//
// The paragraph immediately after the header containing {{stage_N_status}}
// gives the default status. If the text around it says "Optional" the status
// is Optional; if "Excluded", Excluded; otherwise Included.
//
// All paragraphs between the status line and the next stage header
// form the description.
// ============================================================
function parseStagesFromTemplate(doc) {
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  const feeRegex    = /\{\{stage_([\d_]+)_fee\}\}/i;
  const statusRegex = /\{\{stage_([\d_]+)_status\}\}/i;
  // Matches "Stage 1:", "Stage 4.5:" — permissive whitespace between Stage and number
  const stageNameRegex = /^Stage[\s\u00a0]+([\d]+(?:[._][\d]+)?)[\s\u00a0]*:/i;

  // First pass: find all Heading 1 paragraphs that look like stage headers
  // (i.e. start with "Stage N:" — skip status lines like {{stage_N_status}})
  const stageHeaders = [];
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const para = child.asParagraph();
    if (para.getHeading() !== DocumentApp.ParagraphHeading.HEADING1) continue;

    const text = para.getText().trim();
    const nameMatch = text.match(stageNameRegex);
    if (!nameMatch) continue; // skip status lines and other Heading 1s that aren't stage headers

    const stageKey = nameMatch[1].replace(/\./g, '_');

    // Stage name is the full heading text, stripped of any fee placeholder
    const stageName = text
      .replace(feeRegex, '')
      .replace(/\$?\s*\+\s*GST\s*/gi, '')
      .replace(/:\s*$/, '')
      .replace(/^\$/, '')
      .trim();

    stageHeaders.push({ index: i, stageKey, stageName });
  }

  // Second pass: collect status + description for each stage
  return stageHeaders.map((header, hi) => {
    const nextIndex = stageHeaders[hi + 1]
      ? stageHeaders[hi + 1].index
      : numChildren;

    let status = 'Included';
    const descLines = [];
    let statusFound = false;
    let inDescription = false;

    const descStartRegex = /\{\{stage_[\d_]+_description_start\}\}/i;
    const descEndRegex   = /\{\{stage_[\d_]+_description_end\}\}/i;

    for (let i = header.index + 1; i < nextIndex; i++) {
      const child = body.getChild(i);
      if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
      const text = child.asParagraph().getText();

      // Status line
      if (!statusFound && statusRegex.test(text)) {
        if      (/optional/i.test(text)) status = 'Optional';
        else if (/excluded/i.test(text)) status = 'Excluded';
        else                             status = 'Included';
        statusFound = true;
        continue;
      }

      // Description markers — trim to handle trailing spaces in Doc
      if (descStartRegex.test(text.trim())) { inDescription = true;  continue; }
      if (descEndRegex.test(text.trim()))   { inDescription = false; continue; }

      if (inDescription) descLines.push(text);
    }

    while (descLines.length && !descLines[descLines.length - 1].trim()) {
      descLines.pop();
    }

    return {
      stageKey:    header.stageKey,
      name:        header.stageName,
      status,
      fee:         '',
      description: descLines.join('\n'),
    };
  });
}

// ============================================================
// CALLED FROM FRONTEND: list existing project folders
// ============================================================
function getExistingProjects() {
  try {
    const root = getRootFolder();
    const folders = root.getFolders();
    const projects = [];

    while (folders.hasNext()) {
      const folder = folders.next();
      const name = folder.getName();
      if (name === CONFIG.TEMPLATES_FOLDER_NAME) continue;

      const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
      let docUrl = null, docName = null;
      while (files.hasNext()) {
        const file = files.next();
        docUrl = file.getUrl();
        docName = file.getName();
        break;
      }
      projects.push({ folderName: name, docUrl, docName });
    }

    projects.sort((a, b) => a.folderName.localeCompare(b.folderName));
    return { success: true, projects };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// CALLED FROM FRONTEND: generate a new proposal
// ============================================================
function generateProposal(data) {
  try {
    Logger.log('generateProposal received stages: ' + JSON.stringify(data.stages.map(s => ({
      stageKey: s.stageKey,
      fee: s.fee,
      status: s.status,
      descLen: (s.description || '').length,
    }))));

    const root = getRootFolder();
    const projectFolder = getOrCreateFolder(root, data.projectAddress);
    const templateDoc = getTemplateDoc(data.projectType);

    const docName = "Fee Proposal - " + data.clientName;
    const copy = templateDoc.makeCopy(docName, projectFolder);

    const doc = DocumentApp.openById(copy.getId());
    substituteMergeFields(doc, data);
    doc.saveAndClose();

    return { success: true, docUrl: copy.getUrl() };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// MERGE FIELD SUBSTITUTION
// ============================================================
function substituteMergeFields(doc, data) {
  const body   = doc.getBody();
  const header = doc.getHeader();
  const footer = doc.getFooter();

  // Scalar fields — use regex patterns to handle trailing spaces in Doc
  const fields = {
    "\\{\\{client_name\\}\\}":         data.clientName,
    "\\{\\{client_address\\}\\}":      data.clientAddress,
    "\\{\\{project_address\\}\\}":     data.projectAddress,
    "\\{\\{date\\}\\}":                data.date,
    "\\{\\{project_description\\}\\}": data.projectDescription,
    "\\{\\{total_fee\\}\\}":           formatCurrencyNoGst(data.totalFee),
    "\\{\\{deposit_percentage\\}\\}":  data.depositPercent + "%",
    "\\{\\{rate_architect\\}\\}":      "$" + data.rates.architect + ".00",
    "\\{\\{rate_graduate\\}\\}":       "$" + data.rates.graduate + ".00",
    "\\{\\{rate_draftsperson\\}\\}":   "$" + data.rates.draftsperson + ".00",
    "\\{\\{financial_year\\}\\}":      data.financialYear,
  };

  // Run all simple replacements across body, header and footer
  const sections = [body];
  if (header) sections.push(header);
  if (footer) sections.push(footer);

  sections.forEach(section => {
    for (const [key, value] of Object.entries(fields)) {
      section.replaceText(key, value || "");
    }

    // Stage fee and status
    data.stages.forEach(stage => {
      const k = stage.stageKey;
      section.replaceText(`\\{\\{stage_${k}_fee\\}\\}`,    stage.fee ? formatCurrencyNoGst(stage.fee) : 'TBC');
      section.replaceText(`\\{\\{stage_${k}_status\\}\\}`, stage.status);
    });

    // Consultant list
    const consultantText = data.consultants
      .filter(c => c.included)
      .map(c => `${c.name} ($${Number(c.amount).toLocaleString()}+GST)`)
      .join("\n");
    section.replaceText("\\{\\{consultant_list\\}\\}", consultantText);
  });

  // Stage descriptions — body only, must run after simple replacements
  data.stages.forEach(stage => {
    replaceDescriptionBlock(body, stage.stageKey, stage.description || '');
  });
}

// ============================================================
// REPLACE DESCRIPTION BLOCK
// Finds the paragraph containing {{stage_N_description_start}},
// deletes all paragraphs up to and including {{stage_N_description_end}},
// then inserts the user's description lines in place of the start paragraph.
// ============================================================
function replaceDescriptionBlock(body, stageKey, descriptionText) {
  // Use simple string matching with trim() to handle trailing spaces
  const startMarker = `{{stage_${stageKey}_description_start}}`;
  const endMarker   = `{{stage_${stageKey}_description_end}}`;

  // Find start and end paragraph indices
  let startIdx = -1;
  let endIdx   = -1;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const text = child.asParagraph().getText().trim();
    if (startIdx === -1 && text === startMarker) { startIdx = i; continue; }
    if (startIdx !== -1 && text === endMarker)   { endIdx   = i; break;    }
  }

  if (startIdx === -1 || endIdx === -1) return;

  // Delete paragraphs from endIdx down to startIdx (reverse to preserve indices)
  for (let i = endIdx; i >= startIdx; i--) {
    body.getChild(i).removeFromParent();
  }

  // Insert description lines at startIdx in reverse order
  const lines = descriptionText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    body.insertParagraph(startIdx, lines[i]);
  }
}

// ============================================================
// HELPERS
// ============================================================
function getRootFolder() {
  const folders = DriveApp.getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  if (!folders.hasNext()) throw new Error(`Root folder "${CONFIG.ROOT_FOLDER_NAME}" not found in Drive.`);
  return folders.next();
}

function getOrCreateFolder(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

function getTemplateNames() {
  const root = getRootFolder();
  const templateFolders = root.getFoldersByName(CONFIG.TEMPLATES_FOLDER_NAME);
  if (!templateFolders.hasNext()) throw new Error(`Templates folder "${CONFIG.TEMPLATES_FOLDER_NAME}" not found.`);
  const templateFolder = templateFolders.next();
  const files = templateFolder.getFilesByType(MimeType.GOOGLE_DOCS);
  const names = [];
  while (files.hasNext()) names.push(files.next().getName());
  return names.sort();
}

function getTemplateDoc(projectType) {
  const root = getRootFolder();
  const templateFolders = root.getFoldersByName(CONFIG.TEMPLATES_FOLDER_NAME);
  if (!templateFolders.hasNext()) throw new Error(`Templates folder "${CONFIG.TEMPLATES_FOLDER_NAME}" not found.`);
  const templateFolder = templateFolders.next();
  const files = templateFolder.getFilesByName(projectType);
  if (!files.hasNext()) throw new Error(`Template Doc "${projectType}" not found in _Templates folder.`);
  return files.next();
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) return "";
  return "$" + Number(amount).toLocaleString() + " + GST";
}

// Use this when the template already has "+ GST" after the placeholder
function formatCurrencyNoGst(amount) {
  if (!amount && amount !== 0) return "";
  return "$" + Number(amount).toLocaleString();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// DEFAULT CONSULTANT DATA
// ============================================================
function getDefaultConsultants() {
  return [
    { name: "Private Certifier",             amount: 8500, included: true  },
    { name: "Survey",                        amount: 1500, included: true  },
    { name: "Structural Engineer",           amount: 2000, included: true  },
    { name: "Stormwater Engineer",           amount: 1500, included: true  },
    { name: "Civil Engineer",                amount: 1200, included: true  },
    { name: "Landscape Architect",           amount: 2000, included: true  },
    { name: "Basix Report",                  amount: 1500, included: true  },
    { name: "Town Planning Report",          amount: 1200, included: false },
    { name: "Subdivision",                   amount: 3000, included: false },
    { name: "Geotech",                       amount: 1500, included: false },
    { name: "Quantity Surveyor",             amount: 3000, included: false },
    { name: "Sydney Water Section 73 & BPA", amount: 4500, included: false },
  ];
}