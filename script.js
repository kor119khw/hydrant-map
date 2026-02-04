let map;
let allHydrants = [];
let userMarker = null;
let markers = [];
let infowindow = null;

// Initialize map on load
window.onload = function () {
    loadKakaoSDK();
};

function loadKakaoSDK() {
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false`;
    script.onload = () => {
        kakao.maps.load(() => {
            initMap();
        });
    };
    document.head.appendChild(script);
}

function initMap() {
    const container = document.getElementById('map');
    const options = {
        // Default center: Gwangju City Hall (approximate)
        center: new kakao.maps.LatLng(35.1595, 126.8526),
        level: 5
    };

    map = new kakao.maps.Map(container, options);
    infowindow = new kakao.maps.InfoWindow({ zIndex: 1 });
}

async function loadData() {
    try {
        const response = await fetch('refined_data.json');
        if (!response.ok) throw new Error('Network response was not ok');
        allHydrants = await response.json();
    } catch (error) {
        console.error('Failed to load hydrant data:', error);
        alert('소화전 데이터를 불러오는데 실패했습니다.');
    }
}

function requestLocation() {
    const btn = document.getElementById('find-btn');
    btn.disabled = true;
    btn.textContent = '위치 확인 중...';

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            findNearest(lat, lng);
        },
        () => {
            alert("위치 권한을 허용해주세요.");
            btn.disabled = false;
            btn.textContent = '내 위치에서 찾기';
        }
    );
}

async function findNearest(lat, lon) {
    const btn = document.getElementById('find-btn');

    // Show user location
    showUserLocation(lat, lon);

    // Load data if not loaded
    if (allHydrants.length === 0) {
        btn.textContent = '데이터 로딩 중...';
        await loadData();
    }

    if (allHydrants.length > 0) {
        calculateAndRender(lat, lon);
    }

    btn.textContent = '내 위치에서 찾기';
    btn.disabled = false;
}

function showUserLocation(lat, lon) {
    const locPosition = new kakao.maps.LatLng(lat, lon);

    if (userMarker) userMarker.setMap(null);

    // Custom image or default marker for user
    userMarker = new kakao.maps.Marker({
        map: map,
        position: locPosition
    });

    map.setCenter(locPosition);
}

function calculateAndRender(userLat, userLon) {
    // Basic Haversine distance
    const hydrantsWithDist = allHydrants.map(h => {
        const dist = getDistanceFromLatLonInKm(userLat, userLon, h.la, h.lo);
        return { ...h, dist: dist };
    });

    // Sort by distance
    hydrantsWithDist.sort((a, b) => a.dist - b.dist);

    // Take top 3
    const nearest3 = hydrantsWithDist.slice(0, 3);

    renderResults(nearest3);
}

function renderResults(hydrants) {
    // Clear existing markers
    markers.forEach(m => m.setMap(null));
    markers = [];

    const listEl = document.getElementById('hydrant-list');
    listEl.innerHTML = '';

    hydrants.forEach((h, index) => {
        // Create marker
        const position = new kakao.maps.LatLng(h.la, h.lo);

        // Numbered marker image using Kakao Sprite or simple index
        // For simplicity, using default marker with text potentially, 
        // but standard Default marker is fine for requirements. 
        // Let's stick to simple markers.

        const marker = new kakao.maps.Marker({
            map: map,
            position: position,
            title: h.n // Tooltip
        });

        markers.push(marker);

        // Click listener for marker
        kakao.maps.event.addListener(marker, 'click', function () {
            displayInfoWindow(marker, h);
        });

        // Add to list
        const li = document.createElement('li');
        li.className = 'hydrant-item';
        li.innerHTML = `
            <h3>${index + 1}. ${h.n}</h3>
            <p>${h.a}</p>
            <span class="distance">${(h.dist * 1000).toFixed(0)}m</span>
        `;

        li.onclick = () => {
            moveToLocation(h.la, h.lo);
            displayInfoWindow(marker, h);
        };

        listEl.appendChild(li);
    });

    // Adjust map bounds to show fit markers if needed, or just stay centered
    // User requirement: "Map centered on user location" (Done)
}

function displayInfoWindow(marker, data) {
    const content = `
        <div style="padding:10px; min-width:200px; font-size:14px;">
            <strong>${data.n}</strong><br>
            ${data.a}
        </div>
    `;
    infowindow.setContent(content);
    infowindow.open(map, marker);
}

function moveToLocation(lat, lon) {
    const moveLatLon = new kakao.maps.LatLng(lat, lon);
    map.panTo(moveLatLon);
}

// Haversine formula
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}
