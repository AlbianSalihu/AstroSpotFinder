import { MapObject } from "../map_object.js";


export class LightPollutionOverlay extends MapObject {
    constructor({ id = "light-pollution-overlay" } = {}) {
        super(id);

        this.mapView = null;
    }

    attach(mapView) {
        this.mapView = mapView;

        const layerId = `${this.id}-layer`;

        mapView.map.addSource(this.id, {
            type: "raster",
            tiles: ["/api/light-pollution/overlay/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 8,
            attribution: "NASA Black Marble / VIIRS 2016",
        });

        mapView.map.addLayer({
            id: layerId,
            type: "raster",
            source: this.id,
            paint: {
                "raster-opacity": 0.7,
            },
        });
    }

    detach() {
        const map = this.mapView?.map;

        if (map) {
            const layerId = `${this.id}-layer`;

            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(this.id)) map.removeSource(this.id);
        }

        this.mapView = null;
    }
}
