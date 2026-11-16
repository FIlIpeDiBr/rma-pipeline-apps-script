/**
 * Conversão dos arquivos de entrada (PDF, planilha, imagem) para o formato enviado ao modelo: texto, imagem ou PDF.
 */

/**
 * Converte um arquivo PDF ou Excel para texto. Para PDFs, utiliza a
 * conversão para Google Docs (via Advanced Drive Service) e lê o
 * conteúdo com DocumentApp. Para arquivos Excel, exporta para CSV.
 * Outros formatos retornam o conteúdo do blob como string.
 *
 * @param {string} fileId ID do arquivo no Drive
 * @return {string} Texto extraído
 */
function extrairTextoDoArquivo_(fileId) {
  const file = DriveApp.getFileById(fileId);
  const mimeType = String(file.getMimeType() || '');
  const mimeLower = mimeType.toLowerCase();
  const fileName = String(file.getName() || '');
  const extMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch && extMatch[1] ? extMatch[1] : '';
  const token = ScriptApp.getOAuthToken();

  function exportCsv(id) {
    const url = 'https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text/csv';
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const body = response.getContentText();
    return { code: code, body: body };
  }

  // PDFs via conversao para Google Docs.
  if (mimeType === MimeType.PDF || mimeLower === 'application/pdf' || ext === 'pdf') {
    if (typeof Drive === 'undefined' || !Drive.Files || typeof Drive.Files.copy !== 'function') {
      throw new Error('Conversao de PDF requer o servico avancado Drive habilitado (Drive.Files.copy indisponivel).');
    }
    try {
      const tmpDoc = Drive.Files.copy(
        { title: 'TMP_PDF_CONV_' + file.getName(), mimeType: MimeType.GOOGLE_DOCS },
        fileId
      );
      const doc = DocumentApp.openById(tmpDoc.id);
      const text = doc.getBody().getText();
      DriveApp.getFileById(tmpDoc.id).setTrashed(true);
      return text;
    } catch (e) {
      throw new Error('Erro ao converter PDF via Drive API: ' + e);
    }
  }

  // Exporta planilhas para CSV (Excel/ODS/Google Sheets), inclusive quando o MIME vier generico.
  const planilhaMimes = [
    String(MimeType.MICROSOFT_EXCEL || '').toLowerCase(),
    String(MimeType.MICROSOFT_EXCEL_LEGACY || '').toLowerCase(),
    String(MimeType.MICROSOFT_EXCEL_OPEN_XML || '').toLowerCase(),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.ms-excel.sheet.binary.macroenabled.12',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.google-apps.spreadsheet'
  ].filter(function(v) { return !!v; });
  const planilhaExts = ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'];
  const mimeGenericoBinario = (mimeLower === 'application/octet-stream' || mimeLower === 'binary/octet-stream');
  const isPlanilha = planilhaMimes.indexOf(mimeLower) !== -1 || planilhaExts.indexOf(ext) !== -1;

  if (isPlanilha || (mimeGenericoBinario && planilhaExts.indexOf(ext) !== -1)) {
    const first = exportCsv(fileId);
    if (first.code >= 200 && first.code < 300) {
      return first.body;
    }

    try {
      if (typeof Drive !== 'undefined' && Drive.Files && typeof Drive.Files.copy === 'function') {
        const copy = Drive.Files.copy({ mimeType: MimeType.GOOGLE_SHEETS, title: 'TMP_XLSX_CONV_' + file.getName() }, fileId);
        const tmpId = copy && copy.id;
        if (tmpId) {
          const second = exportCsv(tmpId);
          try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (e) {}
          if (second.code >= 200 && second.code < 300) {
            return second.body;
          }
          throw new Error('Falha ao exportar planilha (copia GS): ' + second.body);
        }
      }
    } catch (e) {
      throw new Error('Falha ao converter/exportar planilha: ' + e);
    }

    throw new Error('Falha ao exportar planilha (mime=' + mimeType + ', ext=' + ext + '): ' + first.body);
  }

  // Fallback: tenta ler como texto.
  try {
    return file.getBlob().getDataAsString('UTF-8');
  } catch (e) {
    return file.getBlob().getDataAsString();
  }
}

function inferTipoFromNomeArquivo_(fileName) {
  const nome = String(fileName || '');
  const lower = nome.toLowerCase();
  if (lower.indexOf('balanc') !== -1 || lower.indexOf('balan') !== -1) return 'BALANCO';
  if (lower.indexOf('dre') !== -1 || lower.indexOf('resultado') !== -1 || lower.indexOf('demonstracao') !== -1) return 'DRE';
  const parsed = parseFileName(nome);
  if (parsed && (parsed.tipo === 'BALANCO' || parsed.tipo === 'DRE')) return parsed.tipo;
  return 'OUTRO';
}

function textoUtilParaExtracao_(texto) {
  const s = String(texto || '').trim();
  if (!s) return false;
  if (s.length < 120) return false;
  const temLetras = /[A-Za-zÀ-ÿ]/.test(s);
  const temNumeros = /\d/.test(s);
  return temLetras && temNumeros;
}

function blobParaDataUrl_(blob) {
  if (!blob) return '';
  const mime = String(blob.getContentType() || 'image/png');
  const base64 = Utilities.base64Encode(blob.getBytes());
  return 'data:' + mime + ';base64,' + base64;
}

function obterImagemArquivoParaIa_(file) {
  if (!file) return null;
  const mime = String(file.getMimeType() || '').toLowerCase();
  const nome = String(file.getName() || '');
  const extMatch = nome.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch && extMatch[1] ? extMatch[1] : '';
  const isImagem = mime.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'].indexOf(ext) !== -1;
  if (!isImagem) return null;
  const blob = file.getBlob();
  const dataUrl = blobParaDataUrl_(blob);
  if (!dataUrl) return null;
  return {
    modo: 'imagem',
    imageDataUrl: dataUrl,
    mimeType: String(blob.getContentType() || mime || 'image/png')
  };
}

function arquivoEhPdf_(file) {
  if (!file) return false;
  const mime = String(file.getMimeType() || '').toLowerCase();
  const nome = String(file.getName() || '');
  return mime === 'application/pdf'
    || mime === String(MimeType.PDF || '').toLowerCase()
    || /\.pdf$/i.test(nome);
}

function obterPdfArquivoParaIa_(file) {
  if (!arquivoEhPdf_(file)) return null;
  return {
    modo: 'pdf_file',
    fileName: String(file.getName() || 'documento.pdf')
  };
}

function prepararEntradaIaArquivo_(fileId) {
  const file = DriveApp.getFileById(fileId);
  const imagemDireta = obterImagemArquivoParaIa_(file);
  if (imagemDireta) return imagemDireta;

  const isPdf = arquivoEhPdf_(file);
  let texto = '';
  let tentouTexto = false;
  try {
    texto = extrairTextoDoArquivo_(fileId);
    tentouTexto = true;
  } catch (e) {
    if (!isPdf) throw e;
  }

  if (tentouTexto && !isConteudoBinario(texto) && textoUtilParaExtracao_(texto)) {
    return { modo: 'texto', texto: texto };
  }

  if (isPdf) {
    const pdfEntrada = obterPdfArquivoParaIa_(file);
    if (pdfEntrada) return pdfEntrada;
  }

  if (tentouTexto && !isConteudoBinario(texto)) return { modo: 'texto', texto: texto };
  throw new Error('Conteudo binario detectado; verifique a conversao do arquivo para texto/imagem.');
}

function isConteudoBinario(texto) {
  if (!texto || typeof texto !== 'string') return false;
  if (texto.startsWith('%PDF-')) return true;
  const max = Math.min(texto.length, 4000);
  if (max === 0) return false;
  let nonPrintable = 0;
  let nullChars = 0;
  for (let i = 0; i < max; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0) {
      nullChars++;
      nonPrintable++;
      continue;
    }
    const printable = (c >= 32 && c !== 127) || c === 9 || c === 10 || c === 13;
    if (!printable) nonPrintable++;
  }
  if ((nullChars / max) > 0.01) return true;
  return (nonPrintable / max) > 0.3;
}

function estimarTokens_(texto) {
  if (!texto || typeof texto !== 'string') return 0;
  return Math.ceil(texto.length / 4);
}
