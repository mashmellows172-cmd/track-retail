import fs from 'node:fs';
import http from 'node:http';

const imgPath = 'C:/Users/victus/.gemini/antigravity/brain/5cd20a0a-ff58-4b3f-b5f4-1edbdd719fd2/.user_uploaded/media__1785282769759.png';
const imgBytes = fs.readFileSync(imgPath);

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
let body = '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="image"; filename="boleta.png"\r\n';
body += 'Content-Type: image/png\r\n\r\n';

const postDataEnd = '\r\n--' + boundary + '--\r\n';

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/ocr',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': Buffer.byteLength(body) + imgBytes.length + Buffer.byteLength(postDataEnd)
  }
}, res => {
  let responseData = '';
  res.on('data', chunk => { responseData += chunk; });
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('RESPONSE:', responseData);
  });
});

req.on('error', e => console.error('ERROR:', e));
req.write(body);
req.write(imgBytes);
req.write(postDataEnd);
req.end();
