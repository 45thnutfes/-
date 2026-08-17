/**
 * 壁よけタップゲーム ランキング用 Google Apps Script
 *
 * このファイルはGoogleスプレッドシートに紐付けたApps Scriptエディタに
 * そのままコピー＆ペーストして使ってください（デプロイ手順は README.md 参照）。
 *
 * シートの1行目はヘッダー（timestamp, nickname, score）として自動的に作成されます。
 * お遊び用途のため、認証や不正投稿対策などのセキュリティは一切考慮していません。
 */

const SHEET_NAME = 'Ranking';
const RANKING_SIZE = 10;

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['timestamp', 'nickname', 'score']);
  }
  return sheet;
}

// GET: ランキング上位10件をJSONで返す
function doGet(e) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  values.shift(); // ヘッダー行を除く

  const entries = values
    .filter(row => row[1] !== '' && row[2] !== '' && !isNaN(row[2]))
    .map(row => ({ nickname: String(row[1]), score: Number(row[2]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, RANKING_SIZE);

  return ContentService
    .createTextOutput(JSON.stringify(entries))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST: { nickname, score } を1件追加する（重複チェックなし、同じ人が何度でも登録可）
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const nickname = String(data.nickname || '名無し').slice(0, 10);
    const score = Number(data.score);

    if (!Number.isFinite(score)) {
      return jsonOutput_({ ok: false, error: 'invalid score' });
    }

    const sheet = getSheet_();
    sheet.appendRow([new Date(), nickname, score]);

    return jsonOutput_({ ok: true });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
