let latitude = 33.450701;
let longitude = 126.570667;
const KAKAO_REST_API_KEY = 'da8e81b1e3404a10722911b7ba56b53e';
const KAKAO_MAP_URL = 'https://apis-navi.kakaomobility.com/v1/directions';
const BIKE_MAP_URL = 'http://openapi.seoul.go.kr:8088/484c634d63796f75373754726c6b6b/json/bikeList/1/1000';
const KAKAO_ADDRESS_URL = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';
const PRECIPITATION_URL = 'http://openapi.seoul.go.kr:8088/484c634d63796f75373754726c6b6b/json/ListRainfallService/1/5/';
const BIKE_IMAGE_SRC = "./assets/marker.png";
let startPoint = null;
let endPoint = null;
let distance = 0;
const infoContent = document.querySelector('.info-content');
const carbon = infoContent.querySelector('.carbon');
const address = infoContent.querySelector('.address');
const rainfall = infoContent.querySelector('.rainfall');

// 연료별 탄소 배출 계수 (단위: kg CO₂/L)
const emissionFactors = {
    gasoline: 2.31,   // 휘발유
    diesel: 2.68,     // 경유
    electric: 0       // 전기차
};

const fuelEfficiency = 15; // km/L (연비)
const fuelType = "gasoline"; // 연료 타입

/**
 * 탄소 배출량 계산 함수
 * @param {number} distance - 주행 거리(m)
 * @param {number} fuelEfficiency - 차량 연비(km/L)
 * @param {string} fuelType - 연료 타입 ("gasoline", "diesel", "electric")
 * @returns {number} - 탄소 배출량 (kg CO₂)
 */
function calculateCarbonEmissions(distance, fuelEfficiency, fuelType) {
    // distance를 m 단위에서 km 단위로 변환
    const distanceInKm = distance / 1000;

    // 연료별 탄소 배출 계수 가져오기
    const emissionFactor = emissionFactors[fuelType];

    // 전기차는 배출량이 0이므로 계산을 하지 않음
    if (emissionFactor === 0) {
        return 0;
    }

    // 필요한 연료량(L) 계산
    const fuelConsumed = distanceInKm / fuelEfficiency;

    // 탄소 배출량 계산
    const carbonEmissions = fuelConsumed * emissionFactor;

    return carbonEmissions;
}

const updateInfo = () => {
    carbon.querySelector('.distance_value').innerText = `약 ${Math.round(distance / 1000)}km`;
    carbon.querySelector('.carbon_value').innerText = `${calculateCarbonEmissions(distance, fuelEfficiency, fuelType).toFixed(2)} kg CO₂`;
}

const getBikeInfo = async () => {
    const response = await fetch(BIKE_MAP_URL);
    const { rentBikeStatus } = await response.json();
    return rentBikeStatus;
}

const getPrecipitation = async (address) => {
    const response = await fetch(PRECIPITATION_URL + address);
    const { ListRainfallService } = await response.json();
    return ListRainfallService;
}

const getAddress = async (lat, lng) => {
    const url = `${KAKAO_ADDRESS_URL}?x=${lng}&y=${lat}&input_coord=WGS84`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
        }
    });
    const data = await response.json();
    return data;
}

const getDirections = async (map) => {
    const url = `${KAKAO_MAP_URL}?origin=${startPoint.getLng()},${startPoint.getLat()}&destination=${endPoint.getLng()},${endPoint.getLat()}&appkey=${KAKAO_REST_API_KEY}`;
    const headers = {
        'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`,
        'Content-Type': 'application/json'
    }

    const response = await fetch(url, { headers });
    const data = await response.json();
    distance += data.routes[0].summary.distance;
    const linePath = [];
    data.routes[0].sections[0].roads.forEach(router => {
        router.vertexes.forEach((vertex, index) => {
            if (index % 2 === 0) {
                linePath.push(new kakao.maps.LatLng(router.vertexes[index + 1], router.vertexes[index]));
            }
        });
    });
    const polyline = new kakao.maps.Polyline({
        path: linePath,
        strokeWeight: 5,
        strokeColor: '#000000',
        strokeOpacity: 0.7,
        strokeStyle: 'solid'
    });
    polyline.setMap(map);
    updateInfo();
}


const currentLocation = window.navigator.geolocation;
currentLocation.getCurrentPosition(async (position) => {
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;

    const addressData = await getAddress(latitude, longitude);
    address.querySelector('#address_value').innerText = `${addressData.documents[0].address.region_1depth_name} ${addressData.documents[0].address.region_2depth_name} ${addressData.documents[0].address.region_3depth_name}`;

    const precipitationData = await getPrecipitation(addressData.documents[0].address.region_2depth_name);
    rainfall.querySelector('#rainfall_value').innerText = `${precipitationData.row[0].RAINFALL10}mm / 10분`;

    const mapContainer = document.getElementById('map');
    const mapOptions = {
        center: new kakao.maps.LatLng(latitude, longitude),
        level: 3
    };

    let map = new kakao.maps.Map(mapContainer, mapOptions);

    getBikeInfo()
        .then(bikeInfo => {
            const bikeList = bikeInfo.row;

            bikeList.forEach(bike => {
                const bikePosition = new kakao.maps.LatLng(bike.stationLatitude, bike.stationLongitude);

                const imageSize = new kakao.maps.Size(30, 30);
                const imageOption = {
                    offset: new kakao.maps.Point(0, 0)
                }
                const markerImage = new kakao.maps.MarkerImage(BIKE_IMAGE_SRC, imageSize, imageOption);

                const bikeMarker = new kakao.maps.Marker({
                    position: bikePosition,
                    image: markerImage
                });

                bikeMarker.setMap(map);

                const bikeContent = `<div class="bike-info">
                    <h4>${bike.stationName}</h4>
                    <p>${bike.parkingBikeTotCnt}대 자전거 보유</p>
                </div>`;
                const bikeInfoWindow = new kakao.maps.InfoWindow({
                    content: bikeContent,
                    removable: true
                });

                kakao.maps.event.addListener(bikeMarker, 'click', () => {
                    bikeInfoWindow.open(map, bikeMarker);
                });
            });
        });

    kakao.maps.event.addListener(map, 'click', function (mouseEvent) {
        const latlng = mouseEvent.latLng;
        let point = null;

        if (startPoint === null) {
            startPoint = latlng;
            point = startPoint;
        } else {
            endPoint = latlng;
            point = endPoint;
        }

        const marker = new kakao.maps.Marker({
            position: point,
            map: map
        });
        marker.setMap(map);

        if (endPoint !== null) {
            getDirections(map);
        }
    });
});