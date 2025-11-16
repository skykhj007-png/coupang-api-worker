# 쿠팡 API Worker 배포 가이드

## 단계별 배포 방법

### Step 1: Wrangler 설치 및 로그인

```bash
# Wrangler CLI 설치
npm install -g wrangler

# Cloudflare 로그인
wrangler login
```

브라우저가 자동으로 열립니다. Cloudflare 계정으로 로그인하세요.
(계정이 없다면 https://dash.cloudflare.com/sign-up 에서 무료 가입)

### Step 2: 프로젝트 의존성 설치

```bash
cd C:\Users\kim\coupang-api-worker
npm install
```

### Step 3: API 키 Secret 설정

**중요**: Secret은 암호화되어 저장되며, 코드나 로그에 노출되지 않습니다.

```bash
# Access Key 설정
wrangler secret put COUPANG_ACCESS_KEY
# 프롬프트가 나타나면 입력: 73920ae9-75b9-4136-9d78-39a0de286d64

# Secret Key 설정
wrangler secret put COUPANG_SECRET_KEY
# 프롬프트가 나타나면 입력: 540f3ad0ac3430ce695c8186e6957822d1ab0878
```

### Step 4: 로컬 테스트 (선택사항)

배포 전 로컬에서 테스트해보세요:

```bash
npm run dev
```

브라우저에서 테스트:
- http://localhost:8787/
- http://localhost:8787/api/search?keyword=노트북&limit=5

### Step 5: 배포

```bash
npm run deploy
```

성공하면 다음과 같은 메시지가 표시됩니다:

```
Uploaded coupang-api-worker
Published coupang-api-worker
  https://coupang-api-worker.{your-subdomain}.workers.dev
```

### Step 6: 배포 확인

배포된 URL로 테스트:

```bash
curl "https://coupang-api-worker.{your-subdomain}.workers.dev/health"
```

또는 브라우저에서:
```
https://coupang-api-worker.{your-subdomain}.workers.dev/api/search?keyword=노트북
```

## 프론트엔드 연동

배포 완료 후, 프론트엔드 코드를 업데이트하세요.

### 1. 환경 변수 설정

`.env` 파일 생성 또는 수정:

```env
VITE_COUPANG_WORKER_URL=https://coupang-api-worker.{your-subdomain}.workers.dev
```

### 2. API 파일 업데이트

`src/services/coupangApi.js` 수정:

```javascript
const WORKER_URL = import.meta.env.VITE_COUPANG_WORKER_URL || 'http://localhost:8787';

export async function searchCoupangProducts(keyword, limit = 10) {
  try {
    const response = await fetch(
      `${WORKER_URL}/api/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }

    return data.products;
  } catch (error) {
    console.error('Coupang API Error:', error);
    throw error;
  }
}

export function generateDeepLink(productUrl) {
  // Worker가 자동으로 파트너 링크를 생성하므로
  // 제품 정보에 이미 partnerLink가 포함되어 있습니다
  return `${WORKER_URL}/api/deeplink?url=${encodeURIComponent(productUrl)}`;
}
```

## 모니터링

### 실시간 로그 확인

```bash
npm run tail
```

### Cloudflare 대시보드

https://dash.cloudflare.com 에서:
1. Workers & Pages 선택
2. coupang-api-worker 클릭
3. Metrics 탭에서 요청 통계 확인

## 업데이트

코드 수정 후 재배포:

```bash
npm run deploy
```

변경사항이 즉시 반영됩니다 (캐시 초기화 필요 없음).

## 문제 해결

### 1. "Authentication error" 발생 시

```bash
wrangler logout
wrangler login
```

### 2. "API keys not configured" 에러

Secret이 설정되지 않았습니다:

```bash
wrangler secret put COUPANG_ACCESS_KEY
wrangler secret put COUPANG_SECRET_KEY
```

### 3. CORS 에러 발생 시

Worker가 올바르게 배포되었는지 확인:

```bash
wrangler whoami
```

### 4. 500 에러 발생 시

로그 확인:

```bash
wrangler tail
```

## 비용 관리

### 무료 한도
- **요청**: 하루 100,000 요청
- **Duration**: 요청당 10ms CPU 시간
- **대역폭**: 무제한

### 모니터링
Cloudflare 대시보드에서 일일 사용량을 확인하세요.

### 한도 초과 시
- 유료 플랜으로 자동 업그레이드되지 않습니다
- 한도 초과 시 요청이 차단됩니다
- 필요시 Workers Paid ($5/월)로 업그레이드

## 보안 체크리스트

- ✅ API 키가 코드에 하드코딩되어 있지 않음
- ✅ Secrets로 API 키 관리
- ✅ HTTPS만 사용
- ✅ CORS 헤더 적절히 설정
- ✅ 에러 메시지에 민감한 정보 포함 안 함

## 다음 단계

1. ✅ Worker 배포 완료
2. [ ] 프론트엔드에서 Worker URL 사용
3. [ ] 실제 검색 테스트
4. [ ] 모니터링 설정
5. [ ] 커스텀 도메인 설정 (선택사항)

배포가 완료되면 실제 쿠팡 API를 안전하게 사용할 수 있습니다!
