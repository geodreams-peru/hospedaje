function getSheetsConfig() {
  const apiKey = process.env.SHEETS_API_KEY;
  const spreadsheetId = process.env.SHEETS_ID;
  const sheetName = process.env.SHEETS_NAME || 'Respuestas de formulario 1';

  if (!apiKey || !spreadsheetId || !sheetName) {
    throw new Error('Falta configurar SHEETS_API_KEY, SHEETS_ID o SHEETS_NAME en el entorno.');
  }

  return { apiKey, spreadsheetId, sheetName };
}

async function fetchApplicantsFromSheet() {
  const { apiKey, spreadsheetId, sheetName } = getSheetsConfig();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}&t=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`No se pudo leer Google Sheets: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data.values) ? data.values.slice(1) : [];
  return rows;
}

module.exports = {
  fetchApplicantsFromSheet
};