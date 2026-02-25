let map;
let allHydrants = [];
let userMarker = null;
let markers = [];
let infowindow = null;

/** ====== Constants (의도 드러내기) ====== */
const DEFAULT_CENTER = { lat: 35.1595, lon: 126.8526 }; // Gwangju City Hall 근처
const MAP_LEVEL = 5;
const NEAREST_COUNT = 3;

const GEO_OPTIONS = {
  timeout: 8000,          // 8초 내 위치 못잡으면 실패 처리
  maximumAge: 60_000,     // 1분 이내 캐시 허용
  enableHighAccuracy: false
};

const BTN_TEXT_DEFAULT = '내 위치에서 찾기';

/** ====== Initialize map on load ====== */
window.onload = function () {
    const btn = document.getElementById('find-btn');
    if (btn) btn.addEventListener('click', requestLocation);

    loadKakaoSDK();
};
function setStatus(message, { alertUser = false } = {}) {
  // 필요하면 index.html에 status 영역을 추가할 수도 있지만,
  // 최소 수정으로는 alert/console에만 표시
  console.warn(message);
  if (alertUser) alert(message);
}

function loadKakaoSDK() {
  const script = document.createElement('script');
  script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false`;

  script.onload = () => {
    if (!window.kakao || !kakao.maps) {
      setStatus('Kakao SDK 로딩은 되었지만 kakao.maps를 찾을 수 없습니다. 키/네트워크를 확인하세요.', { alertUser: true });
      return;
    }
    kakao.maps.load(() => initMap());
  };

  // ✅ 로딩 실패 처리 추가
  script.onerror = () => {
    setStatus('지도 SDK 로딩에 실패했습니다. 네트워크 또는 API 키 설정을 확인하세요.', { alertUser: true });
    const btn = document.getElementById('find-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '지도 로딩 실패';
    }
  };

  document.head.appendChild(script);
}

function initMap() {
  const container = document.getElementById('map');
  const options = {
    center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon),
    level: MAP_LEVEL
  };

  map = new kakao.maps.Map(container, options);
  infowindow = new kakao.maps.InfoWindow({ zIndex: 1 });
}

async function loadData() {
  try {
    const response = await fetch('refined_data.json', { cache: 'force-cache' });
    if (!response.ok) throw new Error('Network response was not ok');
    allHydrants = await response.json();
  } catch (error) {
    console.error('Failed to load hydrant data:', error);
    alert('소화전 데이터를 불러오는데 실패했습니다.');
    allHydrants = [];
  }
}

function requestLocation() {
  const btn = document.getElementById('find-btn');
  btn.disabled = true;
  btn.textContent = '위치 확인 중...';

  // ✅ geolocation 지원 여부 체크
  if (!navigator.geolocation) {
    setStatus('이 브라우저는 위치 기능을 지원하지 않습니다. 기본 위치로 표시합니다.', { alertUser: true });
    btn.textContent = BTN_TEXT_DEFAULT;
    btn.disabled = false;

    // 기본 좌표로라도 동작하게
    findNearest(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      findNearest(lat, lng);
    },
    (err) => {
      // ✅ 에러별 처리(권한거부/타임아웃/기타)
      console.warn('Geolocation error:', err);
      if (err && err.code === 1) {
        alert('위치 권한이 거부되었습니다. 기본 위치로 표시합니다.');
      } else if (err && err.code === 3) {
        alert('위치 확인 시간이 초과되었습니다. 기본 위치로 표시합니다.');
      } else {
        alert('위치를 가져오지 못했습니다. 기본 위치로 표시합니다.');
      }

      btn.textContent = BTN_TEXT_DEFAULT;
      btn.disabled = false;

      // 권한이 없어도 앱이 멈추지 않게 fallback
      findNearest(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
    },
    GEO_OPTIONS
  );
}

async function findNearest(lat, lon) {
  const btn = document.getElementById('find-btn');

  // 지도 로드가 안 된 경우 방어
  if (!map) {
    alert('지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
    if (btn) {
      btn.textContent = BTN_TEXT_DEFAULT;
      btn.disabled = false;
    }
    return;
  }

  // Show user location
  showUserLocation(lat, lon);

  // Load data if not loaded
  if (allHydrants.length === 0) {
    if (btn) btn.textContent = '데이터 로딩 중...';
    await loadData();
  }

  if (allHydrants.length > 0) {
    calculateAndRender(lat, lon);
  }

  if (btn) {
    btn.textContent = BTN_TEXT_DEFAULT;
    btn.disabled = false;
  }
}

function showUserLocation(lat, lon) {
  const locPosition = new kakao.maps.LatLng(lat, lon);

  if (userMarker) userMarker.setMap(null);

  userMarker = new kakao.maps.Marker({
    map: map,
    position: locPosition
  });

  map.setCenter(locPosition);
}

/** ====== 성능 개선: Top-3만 선형으로 유지 (전체 정렬 제거) ====== */
function calculateAndRender(userLat, userLon) {
  const best = []; // {h, dist}

  for (const h of allHydrants) {
    const dist = getDistanceFromLatLonInKm(userLat, userLon, h.la, h.lo);

    // best에 삽입(거리 오름차순 유지), 최대 3개만
    let inserted = false;
    for (let i = 0; i < best.length; i++) {
      if (dist < best[i].dist) {
        best.splice(i, 0, { h, dist });
        inserted = true;
        break;
      }
    }
    if (!inserted) best.push({ h, dist });

    if (best.length > NEAREST_COUNT) best.length = NEAREST_COUNT;
  }

  const nearest = best.map(x => ({ ...x.h, dist: x.dist }));
  renderResults(nearest);
}

/** ====== 보안 개선: innerHTML 사용 제거 ====== */
function renderResults(hydrants) {
  // Clear existing markers
  markers.forEach(m => m.setMap(null));
  markers = [];

  const listEl = document.getElementById('hydrant-list');
  listEl.innerHTML = '';

  hydrants.forEach((h, index) => {
    const position = new kakao.maps.LatLng(h.la, h.lo);

    const marker = new kakao.maps.Marker({
      map: map,
      position: position,
      title: String(h.n ?? '')
    });

    markers.push(marker);

    kakao.maps.event.addListener(marker, 'click', function () {
      displayInfoWindow(marker, h);
    });

    // li 구성(✅ textContent로 안전하게)
    const li = document.createElement('li');
    li.className = 'hydrant-item';

    const h3 = document.createElement('h3');
    h3.textContent = `${index + 1}. ${String(h.n ?? '')}`;

    const p = document.createElement('p');
    p.textContent = String(h.a ?? '');

    const span = document.createElement('span');
    span.className = 'distance';
    span.textContent = `${(h.dist * 1000).toFixed(0)}m`;

    li.appendChild(h3);
    li.appendChild(p);
    li.appendChild(span);

    li.onclick = () => {
      moveToLocation(h.la, h.lo);
      displayInfoWindow(marker, h);
    };

    listEl.appendChild(li);
  });
}

function displayInfoWindow(marker, data) {
  // ✅ InfoWindow도 DOM을 만들어서 안전하게 넣기
  const wrap = document.createElement('div');
  wrap.style.padding = '10px';
  wrap.style.minWidth = '200px';
  wrap.style.fontSize = '14px';

  const strong = document.createElement('strong');
  strong.textContent = String(data.n ?? '');

  const br = document.createElement('br');

  const addr = document.createElement('span');
  addr.textContent = String(data.a ?? '');

  wrap.appendChild(strong);
  wrap.appendChild(br);
  wrap.appendChild(addr);

  infowindow.setContent(wrap);
  infowindow.open(map, marker);
}

function moveToLocation(lat, lon) {
  const moveLatLon = new kakao.maps.LatLng(lat, lon);
  map.panTo(moveLatLon);
}

// Haversine formula
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

