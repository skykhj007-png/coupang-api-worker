# Coupang Partners API - Cloudflare Worker

쿠팡 파트너스 API를 안전하게 사용하기 위한 Cloudflare Workers 백엔드입니다.

## 주요 기능

- ✅ CORS 문제 해결
- ✅ API 키 보안 (클라이언트에 노출 안 됨)
- ✅ 응답 캐싱 (5분)
- ✅ 자동 파트너스 링크 생성
- ✅ 에러 처리

## 배포 방법

### 1. Wrangler 설치

```bash
npm install -g wrangler
```

### 2. Cloudflare 로그인

```bash
wrangler login
```

브라우저가 열리면 Cloudflare 계정으로 로그인하세요.

### 3. 의존성 설치

```bash
cd C:\Users\kim\coupang-api-worker
npm install
```

### 4. API 키 설정 (Secret)

```bash
wrangler secret put COUPANG_ACCESS_KEY
# 입력: 73920ae9-75b9-4136-9d78-39a0de286d64

wrangler secret put COUPANG_SECRET_KEY
# 입력: 540f3ad0ac3430ce695c8186e6957822d1ab0878
```

### 5. 로컬 테스트

```bash
npm run dev
```

브라우저에서 테스트:
- http://localhost:8787/
- http://localhost:8787/api/search?keyword=노트북

### 6. 배포

```bash
npm run deploy
```

배포 완료 후 URL이 표시됩니다:
```
https://coupang-api-worker.{your-subdomain}.workers.dev
```

## API 엔드포인트

### 헬스체크
```
GET /
GET /health
```

응답:
```json
{
  "status": "ok",
  "service": "Coupang Partners API Worker",
  "version": "1.0.0"
}
```

### 제품 검색
```
GET /api/search?keyword={검색어}&limit={개수}
```

파라미터:
- `keyword` (필수): 검색할 제품명
- `limit` (선택, 기본값 10): 결과 개수 (1-100)

응답 예시:
```json
{
  "success": true,
  "keyword": "노트북",
  "count": 10,
  "cached": false,
  "products": [
    {
      "id": "123456",
      "name": "삼성 노트북",
      "price": 1290000,
      "image": "https://...",
      "url": "https://www.coupang.com/...",
      "rating": 4.5,
      "reviews": 1234,
      "isRocket": true,
      "partnerLink": "https://link.coupang.com/a/..."
    }
  ]
}
```

### 딥링크 생성
```
GET /api/deeplink?url={상품URL}
```

파라미터:
- `url` (필수): 쿠팡 상품 URL

응답 예시:
```json
{
  "success": true,
  "originalUrl": "https://www.coupang.com/vp/products/123456",
  "partnerLink": "https://link.coupang.com/a/..."
}
```

## 캐싱

- 검색 결과는 5분간 캐싱됩니다
- 같은 검색어는 캐시된 결과를 반환하여 API 호출을 절약합니다
- 응답에 `"cached": true` 필드로 캐시 여부를 확인할 수 있습니다

## 모니터링

로그 확인:
```bash
npm run tail
```

## 비용

Cloudflare Workers 무료 플랜:
- 하루 100,000 요청까지 무료
- 초과 시 요청당 $0.15/million

충분한 트래픽이 발생하기 전까지는 완전 무료입니다!

## 보안

- API 키는 Workers Secrets에 암호화되어 저장됩니다
- 클라이언트 코드에 API 키가 노출되지 않습니다
- HTTPS만 지원됩니다

## 프론트엔드 연동

배포 후 받은 Worker URL을 사용하여 프론트엔드에서 호출하세요.

### 예시 코드

```javascript
// coupangApi.js
const WORKER_URL = 'https://coupang-api-worker.{your-subdomain}.workers.dev';

export async function searchCoupangProducts(keyword, limit = 10) {
  const response = await fetch(
    `${WORKER_URL}/api/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.products;
}

export function generateDeepLink(productUrl) {
  return `${WORKER_URL}/api/deeplink?url=${encodeURIComponent(productUrl)}`;
}
```

## 문제 해결

### "API keys not configured" 에러
```bash
wrangler secret put COUPANG_ACCESS_KEY
wrangler secret put COUPANG_SECRET_KEY
```

### 배포 실패
```bash
wrangler login
wrangler whoami
```

계정이 올바른지 확인 후 다시 시도하세요.
