 //El codigo crea una instancia del visor CesiumJS y lo inserta dentro del elemento HTML con el ID "map". Utiliza el proveedor de terreno "Cesium World Terrain" para mostrar un globo terráqueo detallado y en 3D. A partir de este punto, puedes agregar más funcionalidades y visualizaciones en el visor CesiumJS utilizando las diversas clases y funciones proporcionadas por la biblioteca. //

console.log(satellite); // Asegúrate de que satellite.js esté accesible
console.log(Cesium);    // Asegúrate de que Cesium esté accesible

document.addEventListener("DOMContentLoaded", async () => {
    const map = new Cesium.Viewer("map", {
        terrainProvider: Cesium.createWorldTerrain(),
    });

//este código realiza dos solicitudes HTTP asincrónicas a las API de Celestrak y TinyGS para obtener datos de TLE de satélites activos. Luego, combina los datos de ambas respuestas en un solo arreglo y muestra la lista de satélites en la página web. Además, realiza el seguimiento de los satélites en el visor CesiumJS utilizando los datos de TLE. Si ocurre algún error durante estas operaciones, se mostrará un mensaje de error en la consola.//

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

//esta función toma una cadena de texto que contiene datos de TLE de satélites y los convierte en una estructura de datos más organizada y fácil de manejar. Cada satélite se representa como un objeto con las propiedades name, line1 y line2, que contienen el nombre del satélite, la primera línea de datos de TLE y la segunda línea de datos de TLE, respectivamente. El resultado final es un arreglo que contiene todos estos objetos de TLE para cada satélite presente en los datos de entrada.//

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

//esta función toma un arreglo de objetos que representan los satélites, extrae los nombres de los satélites y los muestra como elementos de lista en una lista no ordenada en la página web. Cada nombre de satélite se muestra en un elemento de lista (li), y todos los elementos de lista se agrupan en el elemento de lista no ordenada (ul) con el ID "satellite-list".//

function displaySatelliteList(tles) {
    const satelliteList = document.getElementById("satellite-list");
    tles.forEach((tle) => {
        const li = document.createElement("li");
        li.textContent = tle.name;
        satelliteList.appendChild(li);
    });
}

//esta función toma un arreglo de objetos que representan los satélites, crea una entidad para cada satélite en el mapa 3D de Cesium, calcula la trayectoria del satélite utilizando datos de terreno y muestra su seguimiento en el globo terráqueo a lo largo del tiempo. La trayectoria se calcula interpolando las posiciones para suavizar el movimiento del satélite. Cada satélite se representará como una entidad en el mapa con su respectivo nombre y se rastreará durante un intervalo de tiempo específico.//

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

//la función getSatellitePositions toma los elementos de línea de dos de un satélite, junto con un intervalo de tiempo, y calcula la trayectoria del satélite a lo largo de ese tiempo en coordenadas cartesianas. Estas posiciones se almacenan en un arreglo que se devolverá para su posterior uso en el rastreo del satélite en el mapa.//

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

