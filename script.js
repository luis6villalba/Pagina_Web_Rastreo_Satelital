import sgp4 from './sgp4.js';

document.addEventListener("DOMContentLoaded", async () => {
    const map = new Cesium.Viewer("map", {
        terrainProvider: Cesium.createWorldTerrain(),
    });

    try {
        const celestrakResponse = await fetch("https://www.celestrak.com/NORAD/elements/active.txt");
        const celestrakData = await celestrakResponse.text();
        const celestrakTLEs = parseTLEData(celestrakData);

        const tinyGSResponse = await fetch("https://api.tinygs.com/v1/satellites/tle");
        const tinyGSData = await tinyGSResponse.json();
        const tinyGSTLEs = tinyGSData.data.map((tleData) => ({
            name: tleData.name,
            line1: tleData.tle_line1,
            line2: tleData.tle_line2,
        }));

        const allTLEs = [...celestrakTLEs, ...tinyGSTLEs];

        displaySatelliteList(allTLEs);
        trackSatellites(allTLEs);
    } catch (error) {
        console.error("Error fetching TLE data:", error);
    }
});

function parseTLEData(data) {
    const lines = data.trim().split(/\r?\n/);
    const tles = [];

    for (let i = 0; i < lines.length; i += 3) {
        const name = lines[i].trim();
        const line1 = lines[i + 1].trim();
        const line2 = lines[i + 2].trim();
        tles.push({ name, line1, line2 });
    }

    return tles;
}

function displaySatelliteList(tles) {
    const satelliteList = document.getElementById("satellite-list");
    tles.forEach((tle) => {
        const li = document.createElement("li");
        li.textContent = tle.name;
        satelliteList.appendChild(li);
    });
}

function trackSatellites(tles) {
    const viewer = Cesium.Viewer.instances[0];

    tles.forEach((tle) => {
        const satelliteEntity = viewer.entities.add({
            name: tle.name,
            availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
                start: Cesium.JulianDate.now(),
                stop: Cesium.JulianDate.addDays(Cesium.JulianDate.now(), 1, new Cesium.JulianDate()),
            })]),
            position: new Cesium.SampledPositionProperty(),
        });

        Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [satelliteEntity]);
        const position = satelliteEntity.position;

        const promise = Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [satelliteEntity]);
        Cesium.when(promise, () => {
            const startTime = Cesium.JulianDate.now();
            const stopTime = Cesium.JulianDate.addDays(startTime, 1, new Cesium.JulianDate());

            const positions = getSatellitePositions(tle, startTime, stopTime);
            positions.forEach((position) => {
                const time = Cesium.JulianDate.addSeconds(startTime, position.time, new Cesium.JulianDate());
                position.time = time;
            });

            position.setInterpolationOptions({
                interpolationDegree: 5,
                interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
            });
            position.addSamples(positions);
        });
    });
}

function getSatellitePositions(tle, startTime, stopTime) {
    const positions = [];
    const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
    const stepSizeSeconds = 60;

    for (let seconds = 0; seconds <= Cesium.JulianDate.secondsDifference(stopTime, startTime); seconds += stepSizeSeconds) {
        const currentTime = Cesium.JulianDate.addSeconds(startTime, seconds, new Cesium.JulianDate());
        const positionAndVelocity = satellite.propagate(satrec, currentTime.getJulianDay(), currentTime.getSecondsOfDay());
        const positionECI = positionAndVelocity.position;
        const gmst = satellite.gstimeFromJulian(currentTime.getJulianDay());

        const positionCartographic = satellite.eciToGeodetic(positionECI, gmst);
        const positionCartesian = Cesium.Cartesian3.fromRadians(positionCartographic.longitude, positionCartographic.latitude, positionCartographic.height * 1000.0);

        positions.push({
            time: seconds,
            position: positionCartesian,
        });
    }

    return positions;
}
