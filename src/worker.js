/**
 * Coupang Partners API - Cloudflare Worker
 *
 * 이 Worker는 쿠팡 파트너스 API를 안전하게 호출하기 위한 백엔드입니다.
 * - CORS 문제 해결
 * - API 키 보안
 * - 응답 캐싱
 */

// HMAC-SHA256 서명 생성 함수
async function generateHmac(method, path, queryString, secretKey, accessKey) {
  // 타임스탬프 생성: YYMMDDTHHMMSSZ 형식 (앞 2자리 20 제거)
  const datetime = new Date().toISOString()
    .split('.')[0] + 'Z';  // 2025-01-17T12:34:56Z
  const formattedDatetime = datetime
    .replace(/[-:]/g, '')  // 20250117T123456Z
    .substring(2);         // 250117T123456Z (앞 2자리 제거)

  // 메시지 구성: timestamp + method + path + queryString
  const message = formattedDatetime + method + path + (queryString || '');

  console.log('HMAC Debug:', { formattedDatetime, method, path, queryString, message });

  // Web Crypto API 사용 (Cloudflare Workers 환경)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Authorization 헤더 형식: 쉼표 뒤 공백 포함
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${formattedDatetime}, signature=${signatureHex}`;

  return { authorization, datetime: formattedDatetime };
}

// 쿠팡 제품 검색
async function searchCoupangProducts(keyword, accessKey, secretKey, limit = 10) {
  // 경로와 쿼리 문자열 분리
  const path = `/v2/providers/affiliate_open_api/apis/openapi/products/search`;
  const queryString = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;

  // HMAC 서명 생성 (path와 queryString 모두 포함)
  const { authorization } = await generateHmac('GET', path, queryString, secretKey, accessKey);

  console.log('API Request:', {
    url: `https://api-gateway.coupang.com${path}?${queryString}`,
    headers: {
      'Authorization': authorization.substring(0, 50) + '...',
      'X-Requested-By': accessKey
    }
  });

  const response = await fetch(`https://api-gateway.coupang.com${path}?${queryString}`, {
    method: 'GET',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-By': accessKey
    }
  });

  console.log('API Response Status:', response.status);
  console.log('Response Headers:', Object.fromEntries(response.headers));

  if (!response.ok) {
    const errorText = await response.text();
    console.log('Error Response Body:', errorText);
    throw new Error(`Coupang API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // 데이터 변환
  // 실제 응답 구조: { data: [{ productData: [...] }] }
  if (data.data && data.data.length > 0 && data.data[0].productData) {
    return data.data[0].productData.map(product => ({
      id: product.productId,
      name: product.productName,
      price: product.productPrice,
      image: product.productImage,
      url: product.productUrl,
      rating: product.scoreInfo?.avgRating || 0,
      reviews: product.scoreInfo?.count || 0,
      isRocket: product.isRocket || false,
      isFreeShipping: product.isFreeShipping || false,
      rank: product.rank || 0
    }));
  }

  return [];
}

// 쿠팡 공식 딥링크 API 호출 (구매 추적을 위해 필수)
async function createDeepLink(productUrl, accessKey, secretKey, subId = '') {
  const path = `/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink`;

  // POST 요청 본문
  const requestBody = JSON.stringify({
    coupangUrls: [productUrl],
    subId: subId
  });

  // HMAC 서명 생성 (POST 요청이므로 queryString 없음)
  const { authorization } = await generateHmac('POST', path, '', secretKey, accessKey);

  const response = await fetch(`https://api-gateway.coupang.com${path}`, {
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8'
    },
    body: requestBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Deeplink API Error:', errorText);
    throw new Error(`Deeplink API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // 응답 구조: { rCode: "0", rMessage: "", data: [{ originalUrl, shortenUrl }] }
  if (data.rCode === '0' && data.data && data.data.length > 0) {
    return data.data[0].shortenUrl;
  }

  throw new Error('Failed to create deeplink: ' + JSON.stringify(data));
}

// 여러 URL을 한 번에 딥링크로 변환 (배치 처리)
async function createDeepLinks(productUrls, accessKey, secretKey, subId = '') {
  const path = `/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink`;

  const requestBody = JSON.stringify({
    coupangUrls: productUrls,
    subId: subId
  });

  const { authorization } = await generateHmac('POST', path, '', secretKey, accessKey);

  const response = await fetch(`https://api-gateway.coupang.com${path}`, {
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8'
    },
    body: requestBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Deeplink API Error:', errorText);
    throw new Error(`Deeplink API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (data.rCode === '0' && data.data) {
    // URL -> shortenUrl 매핑 반환
    const urlMap = {};
    data.data.forEach(item => {
      urlMap[item.originalUrl] = item.shortenUrl;
    });
    return urlMap;
  }

  throw new Error('Failed to create deeplinks: ' + JSON.stringify(data));
}

// CORS 헤더
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// JSON 응답 헬퍼
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json;charset=UTF-8',
    }
  });
}

// Worker 메인 핸들러
export default {
  async fetch(request, env, ctx) {
    // OPTIONS 요청 처리 (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
        status: 204
      });
    }

    try {
      const url = new URL(request.url);

      // 헬스체크 엔드포인트
      if (url.pathname === '/' || url.pathname === '/health') {
        return jsonResponse({
          status: 'ok',
          service: 'Coupang Partners API Worker',
          version: '1.0.0',
          endpoints: {
            search: '/api/search?keyword={keyword}&limit={limit}',
            deeplink: '/api/deeplink?url={productUrl}'
          }
        });
      }

      // 제품 검색 엔드포인트
      if (url.pathname === '/api/search') {
        const keyword = url.searchParams.get('keyword');
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);

        if (!keyword || keyword.trim() === '') {
          return jsonResponse({
            success: false,
            error: 'keyword parameter is required'
          }, 400);
        }

        if (limit < 1 || limit > 100) {
          return jsonResponse({
            success: false,
            error: 'limit must be between 1 and 100'
          }, 400);
        }

        // 환경 변수에서 API 키 가져오기
        const accessKey = env.COUPANG_ACCESS_KEY;
        const secretKey = env.COUPANG_SECRET_KEY;

        if (!accessKey || !secretKey) {
          return jsonResponse({
            success: false,
            error: 'API keys not configured'
          }, 500);
        }

        // 캐시 키 생성
        const cacheKey = `search:${keyword}:${limit}`;
        const cache = caches.default;
        const cacheUrl = new URL(request.url);
        cacheUrl.pathname = `/cache/${cacheKey}`;

        // 캐시 확인 (5분 캐싱)
        let response = await cache.match(cacheUrl);

        if (!response) {
          // 캐시 미스 - API 호출
          const products = await searchCoupangProducts(keyword, accessKey, secretKey, limit);

          // 공식 딥링크 API를 사용하여 파트너스 링크 생성 (구매 추적용)
          const productUrls = products.map(p => p.url).filter(Boolean);
          let deepLinkMap = {};

          if (productUrls.length > 0) {
            try {
              const subId = url.searchParams.get('subId') || '';
              deepLinkMap = await createDeepLinks(productUrls, accessKey, secretKey, subId);
            } catch (deepLinkError) {
              console.error('Deeplink creation failed:', deepLinkError.message);
              // 딥링크 생성 실패시에도 검색 결과는 반환
            }
          }

          const productsWithLinks = products.map(product => ({
            ...product,
            partnerLink: deepLinkMap[product.url] || product.url
          }));

          response = jsonResponse({
            success: true,
            keyword,
            count: productsWithLinks.length,
            products: productsWithLinks,
            cached: false
          });

          // 5분 캐싱
          response = new Response(response.body, response);
          response.headers.set('Cache-Control', 'public, max-age=300');
          ctx.waitUntil(cache.put(cacheUrl, response.clone()));
        } else {
          // 캐시 히트
          const data = await response.json();
          response = jsonResponse({
            ...data,
            cached: true
          });
        }

        return response;
      }

      // 딥링크 생성 엔드포인트 (공식 API 사용)
      if (url.pathname === '/api/deeplink') {
        const productUrl = url.searchParams.get('url');
        const subId = url.searchParams.get('subId') || '';

        if (!productUrl) {
          return jsonResponse({
            success: false,
            error: 'url parameter is required'
          }, 400);
        }

        const accessKey = env.COUPANG_ACCESS_KEY;
        const secretKey = env.COUPANG_SECRET_KEY;

        if (!accessKey || !secretKey) {
          return jsonResponse({
            success: false,
            error: 'API keys not configured'
          }, 500);
        }

        const partnerLink = await createDeepLink(productUrl, accessKey, secretKey, subId);

        return jsonResponse({
          success: true,
          originalUrl: productUrl,
          partnerLink: partnerLink,
          subId: subId || null
        });
      }

      // 404 처리
      return jsonResponse({
        success: false,
        error: 'Not Found',
        path: url.pathname
      }, 404);

    } catch (error) {
      console.error('Worker Error:', error);

      return jsonResponse({
        success: false,
        error: error.message,
        stack: env.ENVIRONMENT === 'development' ? error.stack : undefined
      }, 500);
    }
  }
};
