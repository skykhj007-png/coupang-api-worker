/**
 * Coupang Partners API - Cloudflare Worker
 *
 * 이 Worker는 쿠팡 파트너스 API를 안전하게 호출하기 위한 백엔드입니다.
 * - CORS 문제 해결
 * - API 키 보안
 * - 응답 캐싱
 */

// HMAC-SHA256 서명 생성 함수
async function generateHmac(method, path, secretKey, accessKey) {
  // YYYYMMDDTHHMMSSZ 형식 (쿠팡 API 공식 형식)
  const datetime = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

  const message = datetime + method + path;

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

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signatureHex}`;

  return { authorization, datetime };
}

// 쿠팡 제품 검색
async function searchCoupangProducts(keyword, accessKey, secretKey, limit = 10) {
  const path = `/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`;

  const { authorization } = await generateHmac('GET', path, secretKey, accessKey);

  const response = await fetch(`https://api-gateway.coupang.com${path}`, {
    method: 'GET',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
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

// 딥링크 생성
function generateDeepLink(productUrl, accessKey) {
  return `https://link.coupang.com/a/${accessKey}?url=${encodeURIComponent(productUrl)}`;
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

          // 파트너스 링크 추가
          const productsWithLinks = products.map(product => ({
            ...product,
            partnerLink: generateDeepLink(product.url, accessKey)
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

      // 딥링크 생성 엔드포인트
      if (url.pathname === '/api/deeplink') {
        const productUrl = url.searchParams.get('url');

        if (!productUrl) {
          return jsonResponse({
            success: false,
            error: 'url parameter is required'
          }, 400);
        }

        const accessKey = env.COUPANG_ACCESS_KEY;

        if (!accessKey) {
          return jsonResponse({
            success: false,
            error: 'Access key not configured'
          }, 500);
        }

        const deepLink = generateDeepLink(productUrl, accessKey);

        return jsonResponse({
          success: true,
          originalUrl: productUrl,
          partnerLink: deepLink
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
