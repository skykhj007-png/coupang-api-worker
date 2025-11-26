import CryptoJS from 'crypto-js';

const accessKey = '73920ae9-75b9-4136-9d78-39a0de286d64';
const secretKey = '540f3ad0ac3430ce695c8186e6957822d1ab0878';

// Test 1: ISO 8601 format (what coupangApi.js uses)
function test1() {
  const datetime = new Date().toISOString().slice(0, -5) + 'Z';
  const method = 'GET';
  const path = '/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword=laptop&limit=2';
  const message = datetime + method + path;

  const signature = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  console.log('Test 1 - ISO 8601 format (coupangApi.js style):');
  console.log('  datetime:', datetime);
  console.log('  message:', message.substring(0, 60) + '...');
  console.log('  signature:', signature);
  console.log('  authorization:', authorization);
  console.log();
}

// Test 2: Compact format YYYYMMDDTHHMMSSZ
function test2() {
  const datetime = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const method = 'GET';
  const path = '/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword=laptop&limit=2';
  const message = datetime + method + path;

  const signature = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  console.log('Test 2 - Compact YYYYMMDDTHHMMSSZ format:');
  console.log('  datetime:', datetime);
  console.log('  message:', message.substring(0, 60) + '...');
  console.log('  signature:', signature);
  console.log('  authorization:', authorization);
  console.log();
}

test1();
test2();
