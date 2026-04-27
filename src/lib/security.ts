const PDF_MAGIC = '%PDF-';
export async function validatePdfFile(file: File, maxSizeMb = 10) {
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`O PDF deve ter no máximo ${maxSizeMb} MB.`);
  }
  if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
    throw new Error('Selecione um arquivo PDF válido.');
  }

  const header = await file.slice(0, 5).text();
  if (header !== PDF_MAGIC) {
    throw new Error('O arquivo selecionado não parece ser um PDF válido.');
  }
}

export async function validateSpreadsheetFile(file: File, maxSizeMb = 5) {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.csv')) {
    throw new Error('Selecione uma planilha CSV.');
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`A planilha deve ter no máximo ${maxSizeMb} MB.`);
  }

  const header = await file.slice(0, 256).text();
  if (header.includes('\0')) throw new Error('O CSV selecionado não é válido.');
}
