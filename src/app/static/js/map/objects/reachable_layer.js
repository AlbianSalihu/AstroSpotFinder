import { MapObject } from "../map_object.js";


export class ReachableLayer extends MapObject {
    constructor({ id, geometries }) {
        super(id);
        this.geometries = geometries;
        this.mapView = null;
    }

    attach(mapView) {
        this.mapView = mapView;

        const geojson = {
            type: "FeatureCollection",
            features: this.geometries.map((geo, i) => ({
                type: "Feature",
                geometry: geo,
                properties: { parkingIndex: i },
            })),
        };

        mapView.map.addSource(this.id, { type: "geojson", data: geojson });

        mapView.map.addLayer({
            id: `${this.id}-fill`,
            type: "fill",
            source: this.id,
            paint: {
                "fill-color": "#16a34a",
                "fill-opacity": 0.28,
            },
        });

        mapView.map.addLayer({
            id: `${this.id}-outline`,
            type: "line",
            source: this.id,
            paint: {
                "line-color": "#15803d",
                "line-width": 1.5,
            },
        });
    }

    detach() {
        const map = this.mapView?.map;

        if (map) {
            if (map.getLayer(`${this.id}-fill`)) map.removeLayer(`${this.id}-fill`);
            if (map.getLayer(`${this.id}-outline`)) map.removeLayer(`${this.id}-outline`);
            if (map.getSource(this.id)) map.removeSource(this.id);
        }

        this.mapView = null;
    }
}
