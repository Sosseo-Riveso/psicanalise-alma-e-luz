/**
 * ============================================================================
 * GOOGLE APPS SCRIPT WEBHOOK (MINI CRM - SUPORTE A LIMPEZA E EXCLUSÃO)
 * ============================================================================
 * 
 * INSTRUÇÕES:
 * 1. Abra a planilha Google Sheets conectada ao Mini CRM.
 * 2. No menu superior, clique em: Extensões > Apps Script.
 * 3. Substitua o código pelo código abaixo e clique em "Implantar" > "Gerenciar implantações" > Editar (ícone de lápis) > Versão: "Nova versão" > Implantar.
 * ============================================================================
 */

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var rows = sheet.getDataRange().getValues();
    
    if (rows.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var headers = rows[0];
    var leads = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var lead = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j].toString().toLowerCase().trim();
        if (key === 'página' || key === 'pagina') key = 'pagina';
        lead[key] = row[j];
      }
      leads.push(lead);
    }
    
    leads.reverse();
    
    return ContentService.createTextOutput(JSON.stringify(leads))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = {};
    
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    // Comandos de Limpeza e Exclusão vindos do Mini CRM
    if (data && data.action) {
      var lastRow = sheet.getLastRow();
      var deletedCount = 0;

      if (data.action === 'clear') {
        if (lastRow > 1) {
          sheet.deleteRows(2, lastRow - 1);
          deletedCount = lastRow - 1;
        }
        return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "clear", deleted: deletedCount }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      if (lastRow > 1) {
        var numCols = Math.max(sheet.getLastColumn(), 8);
        var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
        var targetId = data.id ? String(data.id).trim() : '';
        var targetTel = data.telefone ? String(data.telefone).replace(/\D/g, '') : '';
        var targetData = data.data ? String(data.data).trim() : '';
        var targetMonth = data.month ? String(data.month).trim() : '';
        var cutoffTime = new Date().getTime() - (365 * 24 * 60 * 60 * 1000);

        for (var i = rows.length - 1; i >= 0; i--) {
          var r = rows[i];
          var rowId = String(r[0] || '').trim();
          var rowDateVal = r[1];
          var rowDateStr = (rowDateVal instanceof Date)
            ? Utilities.formatDate(rowDateVal, "America/Sao_Paulo", "dd/MM/yyyy")
            : String(rowDateVal || '').trim();
          var rowTel = String(r[4] || r[3] || '').replace(/\D/g, '');

          var shouldDelete = false;

          if (data.action === 'delete') {
            if (targetId && rowId === targetId) {
              shouldDelete = true;
            } else if (targetTel && rowTel === targetTel && (!targetData || rowDateStr === targetData)) {
              shouldDelete = true;
            }
          } else if (data.action === 'delete_month' && targetMonth) {
            if (rowDateStr.indexOf('/' + targetMonth) !== -1 || rowDateStr.indexOf(targetMonth) !== -1) {
              shouldDelete = true;
            }
          } else if (data.action === 'prune_year') {
            var parts = rowDateStr.split('/');
            if (parts.length === 3) {
              var rowDt = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
              if (rowDt < cutoffTime) shouldDelete = true;
            }
          }

          if (shouldDelete) {
            sheet.deleteRow(i + 2);
            deletedCount++;
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: data.action, deleted: deletedCount }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["ID", "Data", "Hora", "Nome", "Telefone", "Pagina", "Origem", "Tipo", "Timestamp"]);
    }

    var now = new Date();
    var formattedDate = Utilities.formatDate(now, "America/Sao_Paulo", "dd/MM/yyyy");
    var formattedTime = Utilities.formatDate(now, "America/Sao_Paulo", "HH:mm");

    sheet.appendRow([
      data.id || ("lead_" + now.getTime()),
      data.data || formattedDate,
      data.hora || formattedTime,
      data.nome || "Visitante",
      data.telefone || "-",
      data.pagina || "/",
      data.origem || "Site",
      data.tipo || "WhatsApp",
      data.timestamp || now.getTime()
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", received: data.nome }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
