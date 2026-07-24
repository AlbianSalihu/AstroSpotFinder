import { CloudCoverClient } from "./api/cloud_cover_client.js";
import { ElevationClient } from "./api/elevation_client.js";
import { IntersectClient } from "./api/intersect_client.js";
import { LocalHorizonClient } from "./api/local_horizon_client.js";
import { ParkingsClient } from "./api/parkings_client.js";
import { TerrainFilterClient } from "./api/terrain_filter_client.js";
import { UnionClient } from "./api/union_client.js";
import { WalkingIsochronesClient } from "./api/walking_isochrones_client.js";
import { GeocodingClient } from "./api/geocoding_client.js";
import { HorizonClient } from "./api/horizon_client.js";
import { IsochronesClient } from "./api/isochrones_client.js";
import { LightPollutionClient } from "./api/light_pollution_client.js";
import { PinsClient } from "./api/pins_client.js";

import { MapView } from "./map/map_view.js";
import { BoundsHighlight } from "./map/objects/bounds_highlight.js";
import { CloudCoverFilterLayer } from "./map/objects/cloud_cover_filter_layer.js";
import { CloudCoverOverlay } from "./map/objects/cloud_cover_overlay.js";
import { IntersectionLayer } from "./map/objects/intersection_layer.js";
import { ParkingsLayer } from "./map/objects/parkings_layer.js";
import { ReachableLayer } from "./map/objects/reachable_layer.js";
import { ElevationLayer } from "./map/objects/elevation_layer.js";
import { HorizonFilterLayer } from "./map/objects/horizon_filter_layer.js";
import { IsochroneLayer } from "./map/objects/isochrone_layer.js";
import { LightPollutionFilterLayer } from "./map/objects/light_pollution_filter_layer.js";
import { LightPollutionOverlay } from "./map/objects/light_pollution_overlay.js";
import { PinMarker } from "./map/objects/pin_marker.js";
import { PinTool } from "./map/tools/pin_tool.js";

import { Pin } from "./models/pin.js";

import { AddressSearch } from "./ui/address_search.js";
import { DatasetStatus } from "./ui/dataset_status.js";
import { MapToolbar } from "./ui/map_toolbar.js";
import { PinDetails } from "./ui/pin_details.js";


const openStreetMapStyle = {
    version: 8,

    sources: {
        openStreetMap: {
            type: "raster",

            tiles: [
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            ],

            tileSize: 256,
            maxzoom: 19,

            attribution:
                "© OpenStreetMap contributors"
        }
    },

    layers: [
        {
            id: "openstreetmap",
            type: "raster",
            source: "openStreetMap"
        }
    ]
};


const mapView = new MapView({
    container: "map",
    style: openStreetMapStyle,
    center: [8.2275, 46.8182],
    zoom: 7
});


const bottomRight = document.createElement("div");
bottomRight.className = "bottom-right-stack";
document.body.appendChild(bottomRight);

const toolbar = new MapToolbar({ mountPoint: bottomRight });

toolbar.addTool({
    id: "pin",
    label: "Place a pin",
    icon: "📍"
});

toolbar.addTool({
    id: "light-pollution",
    label: "Light pollution overlay",
    icon: "🌙"
});

toolbar.addTool({
    id: "cloud-cover",
    label: "Cloud cover overlay",
    icon: "⛅"
});


const pinDetails = new PinDetails();
const pinsClient = new PinsClient();
const isochronesClient = new IsochronesClient();
const elevationClient = new ElevationClient();
const horizonClient = new HorizonClient();
const cloudCoverClient = new CloudCoverClient();
const intersectClient = new IntersectClient();
const parkingsClient = new ParkingsClient();
const terrainFilterClient = new TerrainFilterClient();
const localHorizonClient = new LocalHorizonClient();
const unionClient = new UnionClient();
const walkingIsochronesClient = new WalkingIsochronesClient();
const lightPollutionClient = new LightPollutionClient();

const datasetStatus = new DatasetStatus({ mountPoint: bottomRight });

// pinId → layer (ephemeral, cleared on pin delete)
const isochroneLayers = new Map();
const elevationLayers = new Map();
const horizonFilterLayers = new Map();
const cloudFilterLayers = new Map();
const intersectionLayers = new Map();
const parkingsLayers = new Map();
const lightPollutionFilterLayers = new Map();
const reachableLayers = new Map();
const terrainFilterLayers = new Map();
const localHorizonLayers = new Map();

// pinId → {elevation?, horizon?, cloud?, lightPollution?, terrain?, localHorizon?}
const filterParams = new Map();

// pinId → raw parkings array from API
const parkingsList = new Map();

// pinId → [geometry|null] indexed same as parkingsList
const walkingIsosByPin = new Map();

// pinId → union geometry of all walking isochrones (cached, rebuilt when a parking is removed)
const walkingUnionByPin = new Map();

let lpDatasetAvailable = false;
let lpUnitLabel = null;
let lpOverlayActive = false;
let cloudCoverOverlayActive = false;

const geocodingClient = new GeocodingClient();

const addressSearch = new AddressSearch({
    geocodingClient
});

const HIGHLIGHT_ID = "address-highlight";

addressSearch.onPinRequested((result) => {
    const pin = new Pin({
        id: `pin-${globalThis.crypto.randomUUID()}`,
        location: result.location,
        source: "address_search",
        label: result.label,
    });

    void saveAndDisplayPin(pin);
});

addressSearch.onLocationSelected((result) => {
    if (mapView.hasObject(HIGHLIGHT_ID)) {
        mapView.removeObject(HIGHLIGHT_ID);
    }

    if (result.boundingBox) {
        mapView.fitBounds(result.boundingBox);

        mapView.addObject(new BoundsHighlight({
            id: HIGHLIGHT_ID,
            boundingBox: result.boundingBox,
        }));
    } else {
        mapView.flyTo(result.location);
    }
});

let selectedPinId = null;


function displayPin(
    pin,
    {
        select = false
    } = {}
) {
    if (mapView.hasObject(pin.id)) {
        return mapView.getObject(pin.id);
    }

    const pinMarker = new PinMarker({
        pin,
        variant: "default"
    });

    pinMarker.onClick((clickedPin) => {
        selectPin(clickedPin);
    });

    mapView.addObject(pinMarker);

    if (select) {
        selectPin(pin);
    }

    return pinMarker;
}


function selectPin(pin) {
    if (selectedPinId !== null) {
        const previousMarker =
            mapView.getObject(selectedPinId);

        previousMarker?.setSelected(false);
    }

    const selectedMarker = mapView.getObject(pin.id);

    if (selectedMarker === null) {
        return;
    }

    selectedMarker.setSelected(true);
    selectedPinId = pin.id;

    pinDetails.show(pin);
    pinDetails.setIsochroneActive(isochroneLayers.has(pin.id));
    pinDetails.setElevationFilterActive(elevationLayers.has(pin.id));
    pinDetails.setHorizonFilterActive(horizonFilterLayers.has(pin.id));

    const existingCloudLayer = cloudFilterLayers.get(pin.id);
    pinDetails.setCloudFilterActive(
        existingCloudLayer !== undefined,
        existingCloudLayer?.result?.fetched_at ?? null
    );

    pinDetails.setLightPollutionDatasetAvailable(lpDatasetAvailable);
    pinDetails.setLightPollutionUnit(lpUnitLabel);
    pinDetails.setLightPollutionFilterActive(lightPollutionFilterLayers.has(pin.id));
    pinDetails.setIntersectActive(intersectionLayers.has(pin.id));
    pinDetails.setIntersectAvailable(getActiveFilterGeometries(pin.id).length);

    const parkings = parkingsList.get(pin.id);
    if (parkings) {
        pinDetails.setParkingsActive(true, parkings.length);
    }
    const walkingActive = reachableLayers.has(pin.id);
    pinDetails.setWalkingReachableActive(walkingActive);
    if (walkingActive) {
        pinDetails.setTerrainFilterActive(terrainFilterLayers.has(pin.id));
        pinDetails.setLocalHorizonFilterActive(localHorizonLayers.has(pin.id));
    }
    setIntersectionLayerVisible(pin.id, !walkingActive);
}


function removeIsochroneFromMap(pinId) {
    const layerId = `isochrone-${pinId}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    isochroneLayers.delete(pinId);
}


function removeElevationLayerFromMap(pinId) {
    const layerId = `elevation-${pinId}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    elevationLayers.delete(pinId);
}


function removeHorizonFilterFromMap(pinId) {
    const layerId = `horizon-${pinId}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    horizonFilterLayers.delete(pinId);
}


function removeCloudFilterFromMap(pinId) {
    const layerId = `cloud-${pinId}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    cloudFilterLayers.delete(pinId);
}


function setFilterLayersVisible(pinId, visible) {
    const visibility = visible ? "visible" : "none";
    const filterMaps = [
        isochroneLayers,
        elevationLayers,
        horizonFilterLayers,
        cloudFilterLayers,
        lightPollutionFilterLayers,
    ];

    for (const layerMap of filterMaps) {
        const layer = layerMap.get(pinId);

        if (!layer) {
            continue;
        }

        const fillId = `${layer.id}-fill`;
        const outlineId = `${layer.id}-outline`;

        if (mapView.map.getLayer(fillId)) {
            mapView.map.setLayoutProperty(fillId, "visibility", visibility);
        }

        if (mapView.map.getLayer(outlineId)) {
            mapView.map.setLayoutProperty(outlineId, "visibility", visibility);
        }
    }
}


function setIntersectionLayerVisible(pinId, visible) {
    const layer = intersectionLayers.get(pinId);
    if (!layer) return;
    const visibility = visible ? "visible" : "none";
    const fillId = `${layer.id}-fill`;
    const outlineId = `${layer.id}-outline`;
    if (mapView.map.getLayer(fillId)) mapView.map.setLayoutProperty(fillId, "visibility", visibility);
    if (mapView.map.getLayer(outlineId)) mapView.map.setLayoutProperty(outlineId, "visibility", visibility);
}


function removeReachableFromMap(pinId) {
    const layerId = `reachable-${pinId}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    reachableLayers.delete(pinId);
    setIntersectionLayerVisible(pinId, true);

    // Clear walking-only sub-filter layers when the reachable layer is removed.
    removeTerrainFilterFromMap(pinId);
    removeLocalHorizonFromMap(pinId);
    // Walking isochrone and filter caches are NOT cleared here — they persist
    // so refreshReachableLayer can reuse them without re-fetching.
    // They are only cleared in clearWalkingCache() when parkings are removed.
}


function clearWalkingCache(pinId) {
    walkingIsosByPin.delete(pinId);
    walkingUnionByPin.delete(pinId);
}


function removeParkingsFromMap(pinId) {
    const layerId = `parkings-${pinId}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    parkingsLayers.delete(pinId);
    parkingsList.delete(pinId);
    removeReachableFromMap(pinId);
    clearWalkingCache(pinId);
}


function removeIntersectionFromMap(pinId) {
    const layerId = `intersect-${pinId}`;

    if (intersectionLayers.has(pinId)) {
        setFilterLayersVisible(pinId, true);
    }

    removeParkingsFromMap(pinId);

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    intersectionLayers.delete(pinId);
}


function getActiveFilterGeometries(pinId) {
    return [
        elevationLayers.get(pinId),
        horizonFilterLayers.get(pinId),
        cloudFilterLayers.get(pinId),
        lightPollutionFilterLayers.get(pinId),
    ]
        .filter(Boolean)
        .map((layer) => layer.result?.geometry)
        .filter(Boolean);
}


function syncIntersectButton(pinId) {
    if (selectedPinId !== pinId) {
        return;
    }

    pinDetails.setIntersectAvailable(getActiveFilterGeometries(pinId).length);
}


function removeLightPollutionFilterFromMap(pinId) {
    const layerId = `lp-filter-${pinId}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    lightPollutionFilterLayers.delete(pinId);
}


function removeTerrainFilterFromMap(pinId) {
    terrainFilterLayers.delete(pinId);
}


function removeLocalHorizonFromMap(pinId) {
    localHorizonLayers.delete(pinId);
}


function removePinFromMap(pin) {
    removeIsochroneFromMap(pin.id);
    removeElevationLayerFromMap(pin.id);
    removeHorizonFilterFromMap(pin.id);
    removeCloudFilterFromMap(pin.id);
    removeLightPollutionFilterFromMap(pin.id);
    removeTerrainFilterFromMap(pin.id);
    removeLocalHorizonFromMap(pin.id);
    removeIntersectionFromMap(pin.id);
    removeParkingsFromMap(pin.id);
    filterParams.delete(pin.id);
    mapView.removeObject(pin.id);

    if (selectedPinId === pin.id) {
        selectedPinId = null;
        pinDetails.hide();
    }
}


async function saveAndDisplayPin(pin) {
    try {
        const savedPin = await pinsClient.createPin(pin);

        displayPin(
            savedPin,
            {
                select: true
            }
        );
    } catch (error) {
        console.error(error);

        window.alert(
            `The pin could not be saved: ${error.message}`
        );
    }
}


async function updatePinLabel(pin, newLabel) {
    try {
        const updatedPin = await pinsClient.updatePin(
            pin.id,
            { label: newLabel }
        );

        const marker = mapView.getObject(pin.id);
        marker?.updatePin(updatedPin);

        if (selectedPinId === pin.id) {
            pinDetails.show(updatedPin);
            pinDetails.setIsochroneActive(isochroneLayers.has(pin.id));
            pinDetails.setElevationFilterActive(elevationLayers.has(pin.id));
        }
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.show(pin);
            pinDetails.setIsochroneActive(isochroneLayers.has(pin.id));
            pinDetails.setElevationFilterActive(elevationLayers.has(pin.id));
        }

        window.alert(
            `The pin could not be updated: ${error.message}`
        );
    }
}


async function showIsochrone(pin, { mode, minutes }) {
    const layerId = `isochrone-${pin.id}`;

    removeIsochroneFromMap(pin.id);
    // Sub-filters were computed against the old isochrone — discard them all.
    removeElevationLayerFromMap(pin.id);
    removeHorizonFilterFromMap(pin.id);
    removeCloudFilterFromMap(pin.id);
    removeLightPollutionFilterFromMap(pin.id);
    removeIntersectionFromMap(pin.id);

    if (selectedPinId === pin.id) {
        pinDetails.setElevationFilterActive(false);
        pinDetails.setHorizonFilterActive(false);
        pinDetails.setCloudFilterActive(false);
        pinDetails.setLightPollutionFilterActive(false);
        pinDetails.setIntersectActive(false);
        pinDetails.setIntersectAvailable(0);
    }

    pinDetails.setIsochroneLoading(true);

    try {
        const result = await isochronesClient.compute({
            location: pin.location,
            minutes,
            mode,
        });

        const layer = new IsochroneLayer({ id: layerId, result });

        mapView.addObject(layer);
        isochroneLayers.set(pin.id, layer);

        if (selectedPinId === pin.id) {
            pinDetails.setIsochroneLoading(false);
            pinDetails.setIsochroneActive(true);
        }
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setIsochroneLoading(false);
            pinDetails.setIsochroneActive(false);
        }

        window.alert(
            `Isochrone could not be computed: ${error.message}`
        );
    }
}


async function showElevationFilter(pin, { minElevation }) {
    const isochroneLayer = isochroneLayers.get(pin.id);

    if (!isochroneLayer) {
        return;
    }

    const layerId = `elevation-${pin.id}`;

    removeElevationLayerFromMap(pin.id);

    pinDetails.setElevationFilterLoading(true);

    try {
        const result = await elevationClient.filter({
            geometry: isochroneLayer.result.geometry,
            minElevation,
        });

        if (result.geometry === null) {
            if (selectedPinId === pin.id) {
                pinDetails.setElevationFilterLoading(false);
                pinDetails.setElevationFilterActive(false);
            }

            window.alert(
                `No areas above ${minElevation} m within the isochrone.`
            );

            return;
        }

        const layer = new ElevationLayer({ id: layerId, result });

        mapView.addObject(layer);
        elevationLayers.set(pin.id, layer);

        if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
        filterParams.get(pin.id).elevation = { minElevation };

        if (selectedPinId === pin.id) {
            pinDetails.setElevationFilterLoading(false);
            pinDetails.setElevationFilterActive(true);
        }

        syncIntersectButton(pin.id);
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setElevationFilterLoading(false);
            pinDetails.setElevationFilterActive(false);
        }

        window.alert(
            `Elevation filter failed: ${error.message}`
        );
    }
}


async function showHorizonFilter(pin, { minSkyFraction }) {
    const isochroneLayer = isochroneLayers.get(pin.id);

    if (!isochroneLayer) {
        return;
    }

    const layerId = `horizon-${pin.id}`;

    removeHorizonFilterFromMap(pin.id);

    pinDetails.setHorizonFilterLoading(true);

    try {
        const result = await horizonClient.filter({
            geometry: isochroneLayer.result.geometry,
            minSkyFraction,
        });

        if (result.geometry === null) {
            if (selectedPinId === pin.id) {
                pinDetails.setHorizonFilterLoading(false);
                pinDetails.setHorizonFilterActive(false);
            }

            window.alert(
                `No areas with ≥ ${Math.round(minSkyFraction * 100)} % open sky within the isochrone.`
            );

            return;
        }

        const layer = new HorizonFilterLayer({ id: layerId, result });

        mapView.addObject(layer);
        horizonFilterLayers.set(pin.id, layer);

        if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
        filterParams.get(pin.id).horizon = { minSkyFraction };

        if (selectedPinId === pin.id) {
            pinDetails.setHorizonFilterLoading(false);
            pinDetails.setHorizonFilterActive(true);
        }

        syncIntersectButton(pin.id);
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setHorizonFilterLoading(false);
            pinDetails.setHorizonFilterActive(false);
        }

        window.alert(`Horizon filter failed: ${error.message}`);
    }
}


async function showCloudFilter(pin, { minSkyFraction }) {
    const isochroneLayer = isochroneLayers.get(pin.id);

    if (!isochroneLayer) {
        return;
    }

    const layerId = `cloud-${pin.id}`;

    removeCloudFilterFromMap(pin.id);

    pinDetails.setCloudFilterLoading(true);

    try {
        const result = await cloudCoverClient.filter({
            geometry: isochroneLayer.result.geometry,
            minSkyFraction,
        });

        if (result.geometry === null) {
            if (selectedPinId === pin.id) {
                pinDetails.setCloudFilterLoading(false);
                pinDetails.setCloudFilterActive(false);
            }

            window.alert(
                `No areas with ≥ ${Math.round(minSkyFraction * 100)} % clear sky within the isochrone.`
            );

            return;
        }

        const layer = new CloudCoverFilterLayer({ id: layerId, result });

        mapView.addObject(layer);
        cloudFilterLayers.set(pin.id, layer);

        if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
        filterParams.get(pin.id).cloud = { minSkyFraction };

        if (selectedPinId === pin.id) {
            pinDetails.setCloudFilterLoading(false);
            pinDetails.setCloudFilterActive(true, result.fetched_at);
        }

        syncIntersectButton(pin.id);
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setCloudFilterLoading(false);
            pinDetails.setCloudFilterActive(false);
        }

        window.alert(`Cloud filter failed: ${error.message}`);
    }
}


async function showLightPollutionFilter(pin, { maxBortle }) {
    const isochroneLayer = isochroneLayers.get(pin.id);

    if (!isochroneLayer) {
        return;
    }

    const layerId = `lp-filter-${pin.id}`;

    removeLightPollutionFilterFromMap(pin.id);

    pinDetails.setLightPollutionFilterLoading(true);

    try {
        const result = await lightPollutionClient.filter({
            geometry: isochroneLayer.result.geometry,
            maxBortle,
        });

        if (result.geometry === null) {
            if (selectedPinId === pin.id) {
                pinDetails.setLightPollutionFilterLoading(false);
                pinDetails.setLightPollutionFilterActive(false);
            }

            window.alert(
                `No areas below Bortle ${maxBortle} within the isochrone.`
            );

            return;
        }

        const layer = new LightPollutionFilterLayer({ id: layerId, result });

        mapView.addObject(layer);
        lightPollutionFilterLayers.set(pin.id, layer);

        if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
        filterParams.get(pin.id).lightPollution = { maxBortle };

        if (selectedPinId === pin.id) {
            pinDetails.setLightPollutionFilterLoading(false);
            pinDetails.setLightPollutionFilterActive(true);
        }

        syncIntersectButton(pin.id);
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setLightPollutionFilterLoading(false);
            pinDetails.setLightPollutionFilterActive(false);
        }

        window.alert(`Light pollution filter failed: ${error.message}`);
    }
}


async function showIntersection(pin) {
    const geometries = getActiveFilterGeometries(pin.id);

    if (geometries.length < 2) {
        return;
    }

    const layerId = `intersect-${pin.id}`;

    removeIntersectionFromMap(pin.id);

    pinDetails.setIntersectLoading(true);

    try {
        const result = await intersectClient.intersect({ geometries });

        if (result.geometry === null) {
            if (selectedPinId === pin.id) {
                pinDetails.setIntersectLoading(false);
                pinDetails.setIntersectActive(false);
            }

            window.alert("The active filters have no area in common.");

            return;
        }

        const layer = new IntersectionLayer({ id: layerId, result });

        mapView.addObject(layer);
        intersectionLayers.set(pin.id, layer);
        setFilterLayersVisible(pin.id, false);

        if (selectedPinId === pin.id) {
            pinDetails.setIntersectLoading(false);
            pinDetails.setIntersectActive(true);
        }
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setIntersectLoading(false);
            pinDetails.setIntersectActive(false);
        }

        window.alert(`Intersection failed: ${error.message}`);
    }
}


function createParkingsLayer(pin, parkings) {
    const layerId = `parkings-${pin.id}`;

    if (mapView.hasObject(layerId)) {
        mapView.removeObject(layerId);
    }

    if (parkings.length === 0) {
        parkingsLayers.delete(pin.id);
        return;
    }

    const layer = new ParkingsLayer({
        id: layerId,
        result: { parkings },
        onParkingRemoved: (osmId) => removeSingleParking(pin, osmId),
    });

    mapView.addObject(layer);
    parkingsLayers.set(pin.id, layer);
}


function removeSingleParking(pin, osmId) {
    const parkings = parkingsList.get(pin.id);
    if (!parkings) return;

    const idx = parkings.findIndex((p) => p.osm_id === osmId);
    if (idx === -1) return;

    parkings.splice(idx, 1);

    const walkingIsos = walkingIsosByPin.get(pin.id);
    if (walkingIsos) walkingIsos.splice(idx, 1);

    createParkingsLayer(pin, parkings);

    if (selectedPinId === pin.id) {
        if (parkings.length === 0) {
            pinDetails.setParkingsActive(false);
        } else {
            pinDetails.setParkingsActive(true, parkings.length);
        }
    }

    if (reachableLayers.has(pin.id)) {
        void recomputeWalkingUnion(pin.id).then(() => refreshReachableLayer(pin));
    }
}


async function showParkings(pin) {
    const intersectionLayer = intersectionLayers.get(pin.id);

    if (!intersectionLayer) {
        return;
    }

    removeParkingsFromMap(pin.id);

    pinDetails.setParkingsLoading(true);

    try {
        const result = await parkingsClient.find({
            geometry: intersectionLayer.result.geometry,
        });

        parkingsList.set(pin.id, result.parkings);
        createParkingsLayer(pin, result.parkings);

        if (selectedPinId === pin.id) {
            pinDetails.setParkingsLoading(false);
            pinDetails.setParkingsActive(true, result.parkings.length);
        }
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setParkingsLoading(false);
            pinDetails.setParkingsActive(false);
        }

        window.alert(`Could not fetch parkings: ${error.message}`);
    }
}


async function recomputeWalkingUnion(pinId) {
    const isos = walkingIsosByPin.get(pinId) ?? [];
    const valid = isos.filter(Boolean);
    if (valid.length === 0) {
        walkingUnionByPin.delete(pinId);
        return null;
    }
    if (valid.length === 1) {
        walkingUnionByPin.set(pinId, valid[0]);
        return valid[0];
    }
    try {
        const r = await unionClient.union({ geometries: valid });
        if (r.geometry) {
            walkingUnionByPin.set(pinId, r.geometry);
            return r.geometry;
        }
    } catch {
        // fall back to first valid iso
    }
    walkingUnionByPin.set(pinId, valid[0]);
    return valid[0];
}


async function refreshReachableLayer(pin) {
    removeReachableFromMap(pin.id);

    if (selectedPinId === pin.id) {
        pinDetails.setWalkingReachableLoading(true);
    }

    const unionGeometry = walkingUnionByPin.get(pin.id);
    if (!unionGeometry) {
        if (selectedPinId === pin.id) {
            pinDetails.setWalkingReachableLoading(false);
            pinDetails.setWalkingReachableActive(false);
        }
        return;
    }

    // Apply each active filter to the walking union in sequence so that new
    // areas reachable from edge parkings (beyond the car isochrone) are also
    // filtered correctly.  Filter APIs are padded server-side to avoid
    // raster-window boundary inconsistencies.
    const fp = filterParams.get(pin.id) ?? {};
    let geometry = unionGeometry;

    if (fp.elevation && geometry) {
        try {
            const r = await elevationClient.filter({
                geometry,
                minElevation: fp.elevation.minElevation,
            });
            geometry = r.geometry ?? null;
        } catch {
            geometry = null;
        }
    }

    if (fp.horizon && geometry) {
        try {
            const r = await horizonClient.filter({
                geometry,
                minSkyFraction: fp.horizon.minSkyFraction,
            });
            geometry = r.geometry ?? null;
        } catch {
            geometry = null;
        }
    }

    if (fp.cloud && geometry) {
        try {
            const r = await cloudCoverClient.filter({
                geometry,
                minSkyFraction: fp.cloud.minSkyFraction,
            });
            geometry = r.geometry ?? null;
        } catch {
            geometry = null;
        }
    }

    if (fp.lightPollution && geometry) {
        try {
            const r = await lightPollutionClient.filter({
                geometry,
                maxBortle: fp.lightPollution.maxBortle,
            });
            geometry = r.geometry ?? null;
        } catch {
            geometry = null;
        }
    }

    if (fp.terrain && geometry) {
        try {
            const r = await terrainFilterClient.filter({
                geometry,
                buildupBufferM: fp.terrain.buildupBufferM ?? 150,
            });
            geometry = r.geometry ?? null;
            if (geometry) terrainFilterLayers.set(pin.id, true);
        } catch {
            geometry = null;
        }
        if (selectedPinId === pin.id) {
            pinDetails.setTerrainFilterActive(terrainFilterLayers.has(pin.id));
            pinDetails.setTerrainFilterLoading(false);
        }
    }

    if (fp.localHorizon && geometry) {
        try {
            const r = await localHorizonClient.filter({
                geometry,
                minSkyFraction: fp.localHorizon.minSkyFraction,
            });
            geometry = r.geometry ?? null;
            if (geometry) localHorizonLayers.set(pin.id, true);
        } catch {
            geometry = null;
        }
        if (selectedPinId === pin.id) {
            pinDetails.setLocalHorizonFilterActive(localHorizonLayers.has(pin.id));
            pinDetails.setLocalHorizonFilterLoading(false);
        }
    }

    if (!geometry) {
        if (selectedPinId === pin.id) {
            pinDetails.setWalkingReachableLoading(false);
            pinDetails.setWalkingReachableActive(false);
        }
        window.alert("No areas reachable on foot satisfy the active filters.");
        return;
    }

    const layerId = `reachable-${pin.id}`;
    const layer = new ReachableLayer({ id: layerId, geometries: [geometry] });
    mapView.addObject(layer);
    reachableLayers.set(pin.id, layer);
    setIntersectionLayerVisible(pin.id, false);

    if (selectedPinId === pin.id) {
        pinDetails.setWalkingReachableLoading(false);
        pinDetails.setWalkingReachableActive(true);
    }
}


async function showWalkingReachable(pin, { minutes }) {
    const parkings = parkingsList.get(pin.id);
    if (!parkings || parkings.length === 0) return;

    removeReachableFromMap(pin.id);

    if (selectedPinId === pin.id) {
        pinDetails.setWalkingReachableLoading(true);
    }

    // Reset filterParams: keep currently active car filters and walking-only terrain/localHorizon.
    const prevFp = filterParams.get(pin.id) ?? {};
    const freshFp = {};
    if (elevationLayers.has(pin.id) && prevFp.elevation) freshFp.elevation = prevFp.elevation;
    if (horizonFilterLayers.has(pin.id) && prevFp.horizon) freshFp.horizon = prevFp.horizon;
    if (cloudFilterLayers.has(pin.id) && prevFp.cloud) freshFp.cloud = prevFp.cloud;
    if (lightPollutionFilterLayers.has(pin.id) && prevFp.lightPollution) freshFp.lightPollution = prevFp.lightPollution;
    if (terrainFilterLayers.has(pin.id) && prevFp.terrain) freshFp.terrain = prevFp.terrain;
    if (localHorizonLayers.has(pin.id) && prevFp.localHorizon) freshFp.localHorizon = prevFp.localHorizon;
    filterParams.set(pin.id, freshFp);

    try {
        const isoResult = await walkingIsochronesClient.compute({
            parkings: parkings.map((p) => ({ latitude: p.lat, longitude: p.lon })),
            minutes,
        });

        walkingIsosByPin.set(pin.id, isoResult.isochrones);

        const unionGeometry = await recomputeWalkingUnion(pin.id);
        if (!unionGeometry) {
            if (selectedPinId === pin.id) {
                pinDetails.setWalkingReachableLoading(false);
                pinDetails.setWalkingReachableActive(false);
            }
            window.alert("No walking isochrones could be computed for the parkings.");
            return;
        }

        await refreshReachableLayer(pin);
    } catch (error) {
        console.error(error);

        if (selectedPinId === pin.id) {
            pinDetails.setWalkingReachableLoading(false);
            pinDetails.setWalkingReachableActive(false);
        }

        window.alert(`Could not compute walking isochrones: ${error.message}`);
    }
}


async function rerunFilterOnWalking(pin) {
    if (!walkingUnionByPin.has(pin.id)) return;
    await refreshReachableLayer(pin);
}


async function deleteSavedPin(pin) {
    try {
        await pinsClient.deletePin(pin.id);
        removePinFromMap(pin);
    } catch (error) {
        console.error(error);

        window.alert(
            `The pin could not be deleted: ${error.message}`
        );
    }
}


async function loadSavedPins() {
    try {
        const pins = await pinsClient.listPins();

        for (const pin of pins) {
            displayPin(pin);
        }
    } catch (error) {
        console.error(error);

        window.alert(
            `Saved pins could not be loaded: ${error.message}`
        );
    }
}


const pinTool = new PinTool({
    mapView,

    onPinCreated: (pin) => {
        void saveAndDisplayPin(pin);
    }
});


toolbar.onToolSelected((toolId) => {
    if (toolId === "pin") {
        pinTool.toggle();
    }

    if (toolId === "light-pollution") {
        const overlayId = "light-pollution-overlay";

        if (lpOverlayActive) {
            mapView.removeObject(overlayId);
            lpOverlayActive = false;
            toolbar.setActiveTool(null);
        } else {
            mapView.addObject(new LightPollutionOverlay({ id: overlayId }));
            lpOverlayActive = true;
            toolbar.setActiveTool("light-pollution");
        }
    }

    if (toolId === "cloud-cover") {
        const overlayId = "cloud-cover-overlay";

        if (cloudCoverOverlayActive) {
            mapView.removeObject(overlayId);
            cloudCoverOverlayActive = false;
            toolbar.setActiveTool(null);
        } else {
            mapView.addObject(new CloudCoverOverlay({ id: overlayId }));
            cloudCoverOverlayActive = true;
            toolbar.setActiveTool("cloud-cover");
        }
    }
});


pinTool.onStateChanged((isActive) => {
    toolbar.setActiveTool(
        isActive ? "pin" : null
    );
});


pinDetails.onDeleteRequested((pin) => {
    void deleteSavedPin(pin);
});

pinDetails.onLabelChanged((pin, newLabel) => {
    void updatePinLabel(pin, newLabel);
});

pinDetails.onIsochroneRequested((pin, options) => {
    void showIsochrone(pin, options);
});

pinDetails.onElevationFilterRequested((pin, options) => {
    void showElevationFilter(pin, options);
});

pinDetails.onElevationFilterRemoved((pin) => {
    removeElevationLayerFromMap(pin.id);
    removeIntersectionFromMap(pin.id);
    if (filterParams.has(pin.id)) delete filterParams.get(pin.id).elevation;

    if (selectedPinId === pin.id) {
        pinDetails.setElevationFilterActive(false);
        pinDetails.setIntersectActive(false);
    }

    syncIntersectButton(pin.id);
});


pinDetails.onHorizonFilterRequested((pin, options) => {
    void showHorizonFilter(pin, options);
});

pinDetails.onHorizonFilterRemoved((pin) => {
    removeHorizonFilterFromMap(pin.id);
    removeIntersectionFromMap(pin.id);
    if (filterParams.has(pin.id)) delete filterParams.get(pin.id).horizon;

    if (selectedPinId === pin.id) {
        pinDetails.setHorizonFilterActive(false);
        pinDetails.setIntersectActive(false);
    }

    syncIntersectButton(pin.id);
});


pinDetails.onCloudFilterRequested((pin, options) => {
    void showCloudFilter(pin, options);
});

pinDetails.onCloudFilterRemoved((pin) => {
    removeCloudFilterFromMap(pin.id);
    removeIntersectionFromMap(pin.id);
    if (filterParams.has(pin.id)) delete filterParams.get(pin.id).cloud;

    if (selectedPinId === pin.id) {
        pinDetails.setCloudFilterActive(false);
        pinDetails.setIntersectActive(false);
    }

    syncIntersectButton(pin.id);
});


pinDetails.onLightPollutionFilterRequested((pin, options) => {
    void showLightPollutionFilter(pin, options);
});

pinDetails.onLightPollutionFilterRemoved((pin) => {
    removeLightPollutionFilterFromMap(pin.id);
    removeIntersectionFromMap(pin.id);
    if (filterParams.has(pin.id)) delete filterParams.get(pin.id).lightPollution;

    if (selectedPinId === pin.id) {
        pinDetails.setLightPollutionFilterActive(false);
        pinDetails.setIntersectActive(false);
    }

    syncIntersectButton(pin.id);
});

pinDetails.onIntersectRequested((pin) => {
    void showIntersection(pin);
});

pinDetails.onIntersectRemoved((pin) => {
    removeIntersectionFromMap(pin.id);

    if (selectedPinId === pin.id) {
        pinDetails.setIntersectActive(false);
    }
});


pinDetails.onParkingsRequested((pin) => {
    void showParkings(pin);
});

pinDetails.onParkingsRemoved((pin) => {
    removeParkingsFromMap(pin.id);

    if (selectedPinId === pin.id) {
        pinDetails.setParkingsActive(false);
        pinDetails.setWalkingReachableActive(false);
    }
});

pinDetails.onWalkingReachableRequested((pin, options) => {
    void showWalkingReachable(pin, options);
});


pinDetails.onWalkingReachableRemoved((pin) => {
    removeReachableFromMap(pin.id);

    if (selectedPinId === pin.id) {
        pinDetails.setWalkingReachableActive(false);
    }
});

pinDetails.onRerunElevationOnWalking((pin, params) => {
    if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
    filterParams.get(pin.id).elevation = params;
    void rerunFilterOnWalking(pin);
});

pinDetails.onRerunHorizonOnWalking((pin, params) => {
    if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
    filterParams.get(pin.id).horizon = params;
    void rerunFilterOnWalking(pin);
});

pinDetails.onRerunCloudOnWalking((pin, params) => {
    if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
    filterParams.get(pin.id).cloud = params;
    void rerunFilterOnWalking(pin);
});

pinDetails.onRerunLightPollutionOnWalking((pin, params) => {
    if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
    filterParams.get(pin.id).lightPollution = params;
    void rerunFilterOnWalking(pin);
});

pinDetails.onTerrainFilterRequested((pin, params) => {
    if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
    filterParams.get(pin.id).terrain = params;
    if (selectedPinId === pin.id) pinDetails.setTerrainFilterLoading(true);
    void rerunFilterOnWalking(pin);
});

pinDetails.onTerrainFilterRemoved((pin) => {
    if (filterParams.has(pin.id)) delete filterParams.get(pin.id).terrain;
    removeTerrainFilterFromMap(pin.id);
    if (selectedPinId === pin.id) {
        pinDetails.setTerrainFilterActive(false);
        pinDetails.setTerrainFilterLoading(false);
    }
    void rerunFilterOnWalking(pin);
});

pinDetails.onLocalHorizonFilterRequested((pin, params) => {
    if (!filterParams.has(pin.id)) filterParams.set(pin.id, {});
    filterParams.get(pin.id).localHorizon = params;
    if (selectedPinId === pin.id) pinDetails.setLocalHorizonFilterLoading(true);
    void rerunFilterOnWalking(pin);
});

pinDetails.onLocalHorizonFilterRemoved((pin) => {
    if (filterParams.has(pin.id)) delete filterParams.get(pin.id).localHorizon;
    removeLocalHorizonFromMap(pin.id);
    if (selectedPinId === pin.id) {
        pinDetails.setLocalHorizonFilterActive(false);
        pinDetails.setLocalHorizonFilterLoading(false);
    }
    void rerunFilterOnWalking(pin);
});


pinDetails.onIsochroneRemoved((pin) => {
    removeIsochroneFromMap(pin.id);
    removeElevationLayerFromMap(pin.id);
    removeHorizonFilterFromMap(pin.id);
    removeCloudFilterFromMap(pin.id);
    removeLightPollutionFilterFromMap(pin.id);
    removeIntersectionFromMap(pin.id);

    if (selectedPinId === pin.id) {
        pinDetails.setIsochroneActive(false);
    }
});


function applyDatasetStatus(status) {
    datasetStatus.update(status);
    lpDatasetAvailable = status.available;
    lpUnitLabel = status.unit_label ?? null;

    if (selectedPinId !== null) {
        pinDetails.setLightPollutionDatasetAvailable(lpDatasetAvailable);
        pinDetails.setLightPollutionUnit(lpUnitLabel);
    }
}


function pollDatasetStatus() {
    const interval = setInterval(async () => {
        try {
            const status = await lightPollutionClient.getStatus();
            applyDatasetStatus(status);

            if (!status.downloading) {
                clearInterval(interval);
            }
        } catch {
            clearInterval(interval);
        }
    }, 2000);
}


datasetStatus.onDownloadRequested(async () => {
    try {
        const status = await lightPollutionClient.download();
        applyDatasetStatus(status);

        if (status.downloading) {
            pollDatasetStatus();
        }
    } catch (error) {
        console.error(error);
    }
});


async function initDatasetStatus() {
    try {
        const status = await lightPollutionClient.getStatus();
        applyDatasetStatus(status);

        if (status.downloading) {
            pollDatasetStatus();
        }
    } catch {
        // Status panel will show default empty state
    }
}


void loadSavedPins();
void initDatasetStatus();